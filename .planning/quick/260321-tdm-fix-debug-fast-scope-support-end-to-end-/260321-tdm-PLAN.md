---
phase: 260321-tdm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/db.ts
  - src/commands/add.ts
autonomous: true
requirements:
  - FAST-SCOPE-E2E
  - DEBUG-SCOPE-E2E

must_haves:
  truths:
    - "`pilot add ... --as fast` inserts a job into the DB without CHECK constraint failure"
    - "`pilot add ... --as debug` inserts a job into the DB without CHECK constraint failure"
    - "Existing databases with old 3-scope CHECK constraint are migrated to 5-scope on startup"
    - "Fast jobs have skip_grace_period=1 so they start immediately without waiting for queue grace"
    - "All views (status, info, history) display debug/fast jobs correctly — verified with explicit pilot status, pilot info, and pilot history commands"
    - "A real fast case-study job queues, the runner is restarted to pick up the rebuilt binary, and the job transitions from pending to running (runner pickup confirmed)"
  artifacts:
    - path: "src/core/db.ts"
      provides: "Updated CREATE_TABLE_SQL with 5-scope CHECK, new migrateScopeConstraint function, fast→skipGracePeriod in addJob"
      contains: "scope IN ('quick', 'phase', 'milestone', 'debug', 'fast')"
    - path: "src/commands/add.ts"
      provides: "Scope-aware grace period: fast scope auto-sets skipGracePeriod"
      contains: "skipGracePeriod"
  key_links:
    - from: "src/core/db.ts CREATE_TABLE_SQL"
      to: "src/core/types.ts JobScope"
      via: "CHECK constraint must accept all JobScope values"
      pattern: "scope IN.*debug.*fast"
    - from: "src/core/db.ts migrateReviewStates"
      to: "src/core/db.ts migrateScopeConstraint"
      via: "Both called from openPilotDb() and _getTestDb()"
      pattern: "migrateScopeConstraint"
    - from: "src/commands/add.ts"
      to: "src/core/db.ts addJob"
      via: "Fast scope sets skipGracePeriod=true for immediate queue pickup"
      pattern: "scope.*fast.*skipGracePeriod"
---

<objective>
Fix debug/fast scope support end-to-end in Pilot — update SQLite CHECK constraints, add migration for existing databases, wire fast→skipGracePeriod, rebuild, restart, and validate with a real fast case-study job.

Purpose: `pilot add ... --as fast` and `--as debug` fail at runtime with `SQLiteError: CHECK constraint failed: scope IN ('quick', 'phase', 'milestone')`. The type system, CLI, runner, and delegate layers already support these scopes, but the DB schema still rejects them. This plan closes the gap at the persistence layer and validates the fix end-to-end.

Output: Working fast/debug scope insertion, migrated schema, rebuilt binary, restarted runner, and a fast case-study job that queues and gets picked up by the runner — proving the fix end-to-end.
</objective>

<execution_context>
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/workflows/execute-plan.md
@/home/luca/dev/punchlab/pilot/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/pilot-complete-debug-fast-end-to-end.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/core/types.ts:
```typescript
export type JobScope = 'quick' | 'phase' | 'milestone' | 'debug' | 'fast';
```

From src/core/db.ts (line 53 — the problem):
```typescript
scope TEXT NOT NULL CHECK(scope IN ('quick', 'phase', 'milestone')),
```
This CHECK constraint appears in THREE places:
1. `CREATE_TABLE_SQL` (line 53) — new database creation
2. `migrateReviewStates` migration table (line 424) — existing migration also hardcodes old 3-scope
3. The live database on disk (~/.pilot/pilot.db) — needs runtime migration

From src/core/db.ts addJob signature (line 635):
```typescript
function addJob(
  project: string,
  scope: JobScope,
  description: string,
  ...
  skipGracePeriod?: boolean,
  ...
): Job
```

From src/commands/add.ts (line 377-436):
The `opts.startImmediately` boolean currently controls `skipGracePeriod`.
Fast scope should ALSO auto-set `skipGracePeriod=true` regardless of --start-immediately flag.

From src/core/db.ts claimNextLaunchable (line 917):
```typescript
skip_grace_period = 1
OR ? <= 0
OR (strftime('%s','now') - strftime('%s', created_at)) >= ?
```
This already respects `skip_grace_period` — so once fast jobs are inserted with it, they'll be picked up immediately.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix DB schema CHECK constraints + add scope migration + wire fast→skipGracePeriod</name>
  <files>src/core/db.ts, src/commands/add.ts, test/core/db-scope.test.ts</files>
  <behavior>
    - Test: addJob with scope='fast' succeeds (no CHECK constraint error)
    - Test: addJob with scope='debug' succeeds (no CHECK constraint error)
    - Test: fast scope jobs are created with skip_grace_period=1
    - Test: debug scope jobs are created with skip_grace_period=0 (normal grace)
    - Test: existing jobs survive scope migration (data preserved)
    - Test: quick/phase/milestone scopes still work after migration
  </behavior>
  <action>
**In `src/core/db.ts`:**

1. Update `CREATE_TABLE_SQL` (line 53): Change the scope CHECK constraint from:
   `CHECK(scope IN ('quick', 'phase', 'milestone'))`
   to:
   `CHECK(scope IN ('quick', 'phase', 'milestone', 'debug', 'fast'))`

2. Update `migrateReviewStates` function — the migration table definition (line 424) also hardcodes the old 3-scope CHECK. Update it to use the 5-scope CHECK:
   `CHECK(scope IN ('quick', 'phase', 'milestone', 'debug', 'fast'))`

3. Create a new `migrateScopeConstraint(db)` function modeled after `migrateReviewStates`. This handles existing databases that already passed the review migration but still have the 3-scope CHECK:
   - Read `sqlite_master` for jobs table SQL
   - If SQL already contains `'debug'` → return (already migrated)
   - Otherwise: CREATE TABLE `jobs_scope_migration` with updated 5-scope CHECK (copy full column set from CREATE_TABLE_SQL), INSERT from jobs, DROP old, RENAME. Include ALL current columns including `resumed_from_hold`.
   - Wrap in `foreign_keys = off` / `on` like the review migration does.

4. Call `migrateScopeConstraint(cachedDb!)` in `openPilotDb()` (after `migrateReviewStates`) and in `_getTestDb()` (same location).

**In `src/commands/add.ts`:**

5. In the `addCommand` function, after scope is resolved (around line 188, after the milestone block), add logic to auto-set skipGracePeriod for fast scope:
   ```typescript
   const skipGrace = scope === 'fast' || opts.startImmediately === true;
   ```
   Then use `skipGrace` instead of `opts.startImmediately` or `true`/`undefined` in ALL four `addJob()` call sites (lines 377-436). This simplifies the 4-branch conditional: the `skipGracePeriod` argument should always be `skipGrace` (or `skipGrace || undefined` to maintain the same semantics — but `skipGrace` as boolean is cleaner). Refactor the four branches into two (with/without notifyRouteSnapshot) since the only difference was `true` vs `undefined` for skipGracePeriod.

**In `test/core/db-scope.test.ts` (new file):**

6. Write focused tests:
   - `addJob with scope='fast' succeeds` — call addJob with scope 'fast', verify job.scope === 'fast'
   - `addJob with scope='debug' succeeds` — call addJob with scope 'debug', verify job.scope === 'debug'
   - `fast scope sets skip_grace_period=1` — add fast job, read raw row, check skip_grace_period
   - `debug scope does NOT auto-set skip_grace_period` — add debug job without startImmediately, verify skip_grace_period=0
   - `existing scopes still work` — add quick, phase, milestone jobs, all succeed
   - Import `_getTestDb` and `addJob` from db.ts for testing (follows existing test patterns in test/core/).
  </action>
  <verify>
    <automated>npx vitest run test/core/db-scope.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>All 5+ scope tests pass. addJob accepts 'debug' and 'fast' without CHECK constraint failure. Fast jobs auto-set skip_grace_period=1. Existing scopes unaffected.</done>
</task>

<task type="auto">
  <name>Task 2: Rebuild, restart runner, verify end-to-end with real CLI + pilot info, run fast case-study job and confirm runner pickup</name>
  <files>dist/</files>
  <action>
1. **Run full test suite** to confirm nothing is broken:
   ```bash
   npx vitest run 2>&1 | tail -20
   ```
   All tests must pass.

2. **Rebuild Pilot**:
   ```bash
   npm run build
   ```
   Confirm clean exit.

3. **Restart the pilot runner** so it picks up the rebuilt binary:
   ```bash
   systemctl --user restart pilot-runner
   sleep 2
   systemctl --user status pilot-runner --no-pager | head -10
   ```
   Runner must show `active (running)`. This is critical — without restart, the running daemon uses the old binary with the 3-scope CHECK constraint.

4. **Verify debug scope works** by running a dry-run:
   ```bash
   pilot add /home/luca/dev/punchlab/pilot "test debug scope" --as debug --dry-run --no-notify --no-categories
   ```
   Should print dry-run output without errors.

5. **Verify fast scope works** by running a dry-run:
   ```bash
   pilot add /home/luca/dev/punchlab/pilot "test fast scope" --as fast --dry-run --no-notify --no-categories
   ```
   Should print dry-run output without errors.

6. **Verify real fast job insertion** (not dry-run) — the case-study job:
   ```bash
   pilot add /home/luca/dev/punchlab/pilot "use modern iOS Safari viewport-height handling / units / fallbacks so Pilot pages do not create page-level scroll from browser chrome / 100vh behavior" --as fast --no-notify --categories frontend
   ```
   Should succeed — job enters queue with scope=fast and skip_grace_period=1. Note the job ID from output.

7. **Verify the job appears in status**:
   ```bash
   pilot status --json 2>/dev/null | head -40
   ```
   Should show the new fast job.

8. **Verify with `pilot info`** — use the job ID from step 6:
   ```bash
   pilot info <JOB_ID> --json 2>/dev/null | head -30
   ```
   Should show scope=fast and skip_grace_period=1 in the job details. This explicitly validates the `info` view for new scopes.

9. **Verify real debug job insertion**:
   ```bash
   pilot add /home/luca/dev/punchlab/pilot "test debug scope e2e" --as debug --no-notify --categories testing --force
   ```
   Should succeed.

10. **Check both jobs visible in history**:
    ```bash
    pilot history --json 2>/dev/null | head -30
    ```
    Both fast and debug jobs should appear.

11. **Wait for runner pickup of the fast case-study job** — the runner polls periodically, so wait briefly and check if the job transitions from `pending` to `running` or `launched`:
    ```bash
    sleep 15
    pilot status --json 2>/dev/null | head -40
    ```
    The fast case-study job should show state `running` or `launched` (not still `pending`), confirming the runner picked it up. If after 15 seconds it's still pending, wait another 15 seconds and check again. The fast job has skip_grace_period=1 so it should be picked up on the next runner poll cycle.

    If the runner picked it up, this confirms end-to-end: insertion → queue → runner pickup → execution start.
    If the runner hasn't picked it up after 30s total, check runner logs with `journalctl --user -u pilot-runner --since "2 min ago" --no-pager | tail -20` to diagnose. Note the outcome in the summary either way.
  </action>
  <verify>
    <automated>npm run build && npx vitest run 2>&1 | tail -5 && systemctl --user is-active pilot-runner</automated>
  </verify>
  <done>Build succeeds. Full test suite passes. Runner restarted with new binary. `pilot add --as fast` and `--as debug` work against real DB (not just dry-run). `pilot info` shows scope=fast for the case-study job. Fast case-study job transitions from pending to running/launched (runner pickup confirmed). Debug test job is queued with scope=debug. No CHECK constraint errors.</done>
</task>

<task type="auto">
  <name>Task 3: Write SUMMARY.md</name>
  <files>.planning/quick/260321-tdm-fix-debug-fast-scope-support-end-to-end-/260321-tdm-SUMMARY.md</files>
  <action>
Write SUMMARY.md in the quick task directory explaining:

1. **What was missing**: The DB schema CHECK constraint in `CREATE_TABLE_SQL`, the `migrateReviewStates` migration table, and the live database on disk all only allowed 3 scopes (quick, phase, milestone). The type system (`JobScope`), CLI, runner, delegate, and model layers already supported debug/fast — but insertion into SQLite failed at the persistence boundary.

2. **What was fixed**:
   - `CREATE_TABLE_SQL` CHECK constraint updated to 5 scopes
   - `migrateReviewStates` migration table updated to 5 scopes (so databases in mid-migration also get the fix)
   - New `migrateScopeConstraint()` migration for databases that already passed review migration but have old 3-scope CHECK
   - `add.ts` refactored so fast scope auto-sets `skipGracePeriod=true` (fast jobs start immediately, no queue grace wait)
   - New `test/core/db-scope.test.ts` with regression tests for all 5 scopes

3. **Rebuild/restart**: `npm run build` produced updated `dist/` with fixed schema. Pilot CLI reloaded against updated build.

4. **Case-study outcome**: Real `pilot add --as fast` and `--as debug` commands succeeded against live database. Fast case-study job (iOS Safari viewport-height) queued under fast scope with skip_grace_period=1.

Follow the project's SUMMARY.md conventions.
  </action>
  <verify>
    <automated>test -f ".planning/quick/260321-tdm-fix-debug-fast-scope-support-end-to-end-/260321-tdm-SUMMARY.md" && echo "SUMMARY exists"</automated>
  </verify>
  <done>SUMMARY.md exists with clear explanation of what was missing, what was fixed, how rebuild was handled, and case-study outcome.</done>
</task>

</tasks>

<verification>
- `npx vitest run` — full test suite passes (including new db-scope tests)
- `npm run build` — clean build with no errors
- `systemctl --user restart pilot-runner && systemctl --user is-active pilot-runner` — runner active with new binary
- `pilot add ... --as fast --dry-run` — no CHECK constraint error
- `pilot add ... --as debug --dry-run` — no CHECK constraint error
- Real fast job in queue with scope=fast and skip_grace_period=1
- `pilot info <JOB_ID>` — shows scope=fast for the case-study job
- `pilot status` — fast case-study job transitions to running/launched (runner pickup)
- SUMMARY.md documents the fix
</verification>

<success_criteria>
1. SQLite CHECK constraint allows all 5 scopes: quick, phase, milestone, debug, fast
2. Existing databases are migrated automatically on startup
3. Fast jobs auto-skip queue grace period
4. Full test suite passes (existing + new scope tests)
5. Real `pilot add --as fast` and `--as debug` work against live database
6. Runner restarted with new binary (`systemctl --user restart pilot-runner`)
7. iOS Safari viewport-height fast case-study job queued, visible in status/info/history, and picked up by runner (transitions from pending to running/launched)
8. `pilot info <JOB_ID>` explicitly shows scope=fast for the case-study job
9. SUMMARY.md written
</success_criteria>

<output>
After completion, create `.planning/quick/260321-tdm-fix-debug-fast-scope-support-end-to-end-/260321-tdm-SUMMARY.md`
</output>
