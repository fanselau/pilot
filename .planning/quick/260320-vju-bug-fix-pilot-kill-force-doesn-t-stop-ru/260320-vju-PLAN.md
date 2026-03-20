---
phase: quick
plan: 260320-vju
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/runner.ts
  - src/core/opencode-db.ts
  - test/core/runner.test.ts
  - test/core/opencode-db.test.ts
autonomous: true
requirements: [BUG-KILL-FORCE, BUG-STALE-CHILD]
must_haves:
  truths:
    - "pilot kill --force immediately stops runner polling for the killed job"
    - "Child Task() sessions that have been inactive for 5 minutes are treated as done"
  artifacts:
    - path: "src/core/runner.ts"
      provides: "DB status check in spawnAndWait poll loop"
      contains: "getJob"
    - path: "src/core/opencode-db.ts"
      provides: "Staleness timeout for child sessions in getSessionState"
      contains: "time_created"
  key_links:
    - from: "src/core/runner.ts spawnAndWait poll loop"
      to: "src/core/db.ts getJob()"
      via: "check job status !== 'running' → bail out"
      pattern: "getJob.*status.*running"
    - from: "src/core/opencode-db.ts getSessionState"
      to: "session table time_created"
      via: "child staleness timeout query"
      pattern: "300|5.*min|stale"
---

<objective>
Fix two related bugs where `pilot kill --force` doesn't stop the runner's polling loop, and dead child Task() sessions keep the parent marked as "working" indefinitely.

Purpose: `pilot kill` updates the pilot DB (marks job `failed`) and kills the OS process, but the runner's `spawnAndWait` poll loop never checks the pilot DB status — it only watches the opencode DB session state and process PID. This means the runner continues polling for a killed job until the PID death is detected and session state resolves, which can take multiple poll cycles or hang if a child Task() session never completes. Additionally, child sessions from Task() calls can become orphaned (process dies but no step-finish written), causing `getSessionState` to return `working` forever since it waits for a terminal step-finish that will never arrive.

Output: Patched runner.ts and opencode-db.ts with tests.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/core/runner.ts
@src/core/opencode-db.ts
@src/core/db.ts (getJob, forceQuitJob)
@test/core/runner.test.ts
@test/core/opencode-db.test.ts
</context>

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/core/db.ts:
```typescript
function getJob(id: string): Job | undefined;
// Job has: id, status ('pending' | 'running' | 'failed' | 'completed' | 'cancelled'), ...
```

From src/core/opencode-db.ts:
```typescript
type SessionState = 'done' | 'hung-on-prompt' | 'hung-on-tool' | 'crashed' | 'working';
interface SessionStateResult {
  state: SessionState;
  pendingToolName?: string;
  pendingToolContent?: string;
}
function getSessionState(sessionId: string, pidAlive?: boolean): SessionStateResult;
```

From src/core/runner.ts spawnAndWait poll loop (lines 1457-1552):
```typescript
// The poll loop checks: shuttingDown, findSessionByTitle, PID alive, getSessionState
// But NEVER checks getJob() to see if the job was killed externally via DB
```

From src/core/opencode-db.ts getSessionState child check (lines 655-669):
```typescript
// When parent is done (stop/length), checks for running children:
const runningChildRow = db.prepare(
  `SELECT s.id FROM session s
   WHERE s.parent_id = ?
     AND NOT EXISTS (
       SELECT 1 FROM part p
       WHERE p.session_id = s.id
         AND json_extract(p.data, '$.type') = 'step-finish'
         AND json_extract(p.data, '$.reason') IN ('stop', 'length')
     )
   LIMIT 1`
).get(sessionId);
// If found → returns { state: 'working' } — NO staleness check!
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add DB status check in spawnAndWait + child session staleness timeout</name>
  <files>src/core/runner.ts, src/core/opencode-db.ts, test/core/runner.test.ts, test/core/opencode-db.test.ts</files>
  <behavior>
    - Test: spawnAndWait throws when job status changes to 'failed' mid-poll (simulates pilot kill)
    - Test: spawnAndWait throws when job status changes to 'cancelled' mid-poll
    - Test: spawnAndWait continues polling when job status is 'running'
    - Test: getSessionState returns 'done' when parent is done and child session has no activity for 5+ minutes
    - Test: getSessionState returns 'working' when parent is done and child session has recent activity (< 5 min)
  </behavior>
  <action>
**Bug 1: spawnAndWait DB status check (src/core/runner.ts)**

In the `spawnAndWait` poll loop (the `while` loop starting around line 1457), add a check at the TOP of each poll iteration (after `await this.sleep(pollMs)` and the `shuttingDown` check, before `findSessionByTitle`):

```typescript
// Check if job was killed/cancelled externally (e.g., `pilot kill`)
const jobEntry = [...this.activeJobs.entries()].find(([, v]) => v.title === title);
if (jobEntry) {
  const freshJob = getJob(jobEntry[0]);
  if (freshJob && freshJob.status !== 'running') {
    throw new Error(`Job ${freshJob.id} was ${freshJob.status} externally during session: ${title}`);
  }
}
```

This is a lightweight SQLite read (single row by primary key) that runs once per poll interval (~5s). Negligible overhead.

**Bug 2: Child session staleness timeout (src/core/opencode-db.ts)**

In `getSessionState`, in the child session check block (around line 655-669), modify the child "still running" query to also check for staleness. Replace the existing `runningChildRow` query with one that also fetches the child session's latest activity time. If the child has no parts newer than 5 minutes, treat it as stale/done:

Replace the existing child check block (lines 655-669) with:

```typescript
const runningChildRow = db.prepare(
  `SELECT s.id,
          (SELECT MAX(p2.time_created) FROM part p2 WHERE p2.session_id = s.id) as last_activity
   FROM session s
   WHERE s.parent_id = ?
     AND NOT EXISTS (
       SELECT 1 FROM part p
       WHERE p.session_id = s.id
         AND json_extract(p.data, '$.type') = 'step-finish'
         AND json_extract(p.data, '$.reason') IN ('stop', 'length')
     )
   LIMIT 1`,
).get(sessionId) as { id: string; last_activity: string | null } | undefined;

if (runningChildRow) {
  // Child session exists without terminal step-finish.
  // Check if it's stale (no activity for 5 minutes = dead process).
  const CHILD_STALE_TIMEOUT_MS = 5 * 60 * 1000;
  const lastActivity = runningChildRow.last_activity;
  if (lastActivity) {
    const lastActivityTime = new Date(lastActivity + 'Z').getTime();
    const elapsed = Date.now() - lastActivityTime;
    if (elapsed > CHILD_STALE_TIMEOUT_MS) {
      // Child is stale — treat parent as done
      // (process likely died without writing step-finish)
      return { state: 'done' };
    }
  }
  // Child still active — report as working
  return { state: 'working' };
}
```

Note: The `+ 'Z'` suffix is needed because SQLite's `time_created` column stores UTC timestamps without timezone suffix. If it already has a `Z` or `+00:00`, this is still safe since `new Date()` handles it.

**Tests:**

In `test/core/runner.test.ts`, add a new test to the `spawnAndWait state-based poll loop` describe block using the `buildSpawnAndWaitEnv` helper. The `getJob` mock in the helper (line 552) currently always returns `status: 'running'`. Override it for the new test to return `status: 'failed'` after the first poll:

```typescript
it('throws when job is killed externally (DB status changes to failed)', async () => {
  // ... use buildSpawnAndWaitEnv, override getJob mock to return failed after first call
});
```

In `test/core/opencode-db.test.ts`, add tests to the `getSessionState` describe block:
- Create parent session with step-finish reason='stop', create child session with old last_activity (>5 min ago) and no step-finish → expect 'done'
- Create parent session with step-finish reason='stop', create child session with recent last_activity (<5 min ago) and no step-finish → expect 'working'
  </action>
  <verify>
    <automated>npx vitest run test/core/runner.test.ts test/core/opencode-db.test.ts --reporter=verbose 2>&1 | tail -40</automated>
  </verify>
  <done>
    - spawnAndWait poll loop checks getJob() status each iteration and throws if job is no longer 'running'
    - getSessionState treats child sessions with no activity for 5+ minutes as stale (returns 'done' instead of 'working')
    - All existing tests pass
    - New tests cover: external kill detection, external cancel detection, stale child timeout, active child still blocks
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run test/core/runner.test.ts test/core/opencode-db.test.ts` — all pass
2. `npx vitest run` — full suite passes (no regressions)
3. Manual: `pilot service start`, queue a job, `pilot kill <id>` — runner immediately stops polling for that job
</verification>

<success_criteria>
- `pilot kill --force` causes spawnAndWait to throw within one poll interval (~5s), not hang indefinitely
- Child Task() sessions that are dead for 5+ minutes no longer block parent session completion
- Zero test regressions
</success_criteria>

<output>
After completion, create `.planning/quick/260320-vju-bug-fix-pilot-kill-force-doesn-t-stop-ru/260320-vju-SUMMARY.md`
</output>
