---
phase: quick-015
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/db.ts
  - src/core/runner.ts
  - src/core/types.ts
  - src/commands/log.ts
  - test/core/runner.test.ts
  - test/core/db.test.ts
autonomous: true

must_haves:
  truths:
    - "Each step of a multi-step job records command, args, session title, timing, status, and verdict source in the DB"
    - "pilot log shows per-step verdicts (semantic-check pass/fail) for debugging"
    - "Step records persist independently of the parent job's delegation_plan JSON"
  artifacts:
    - path: "src/core/db.ts"
      provides: "job_steps table + CRUD functions"
      contains: "CREATE TABLE IF NOT EXISTS job_steps"
    - path: "src/core/runner.ts"
      provides: "Step recording during launch()"
      contains: "recordStep"
    - path: "src/core/types.ts"
      provides: "JobStep interface"
      contains: "JobStep"
    - path: "src/commands/log.ts"
      provides: "Step verdict display in human output"
      contains: "getJobSteps"
  key_links:
    - from: "src/core/runner.ts"
      to: "src/core/db.ts"
      via: "recordStep/updateStep calls during launch()"
      pattern: "recordStep|updateStep"
    - from: "src/commands/log.ts"
      to: "src/core/db.ts"
      via: "getJobSteps query"
      pattern: "getJobSteps"
---

<objective>
Implement R4 (step-level observability) from the Phase Execution Success Contract requirements — the one requirement deferred by quick-013.

Purpose: When debugging failed or partially-completed phase jobs, operators need to see exactly which step failed, what command ran, how long it took, and whether semantic checks passed or failed. Currently this information is only partially recoverable from delegation_plan JSON + error field. A dedicated `job_steps` table provides first-class audit trail.

Output: job_steps SQLite table, step recording in runner, step display in `pilot log`
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/013-implement-requirements-pilot-phase-execu/013-SUMMARY.md
@src/core/db.ts
@src/core/runner.ts
@src/core/types.ts
@src/commands/log.ts
@test/core/runner.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add job_steps table and recording functions to DB + types</name>
  <files>src/core/types.ts, src/core/db.ts</files>
  <action>
  1. In `src/core/types.ts`, add a `JobStep` interface:
     ```typescript
     export interface JobStep {
       id: number;           // auto-increment
       jobId: string;        // FK to jobs.id
       stepIndex: number;    // 0-based step position
       command: string;      // e.g. "execute-phase", "plan-phase", "quick"
       args: string;         // e.g. "3 --auto"
       sessionTitle: string | null;  // opencode session title
       sessionId: string | null;     // opencode session ID (if found)
       status: 'running' | 'completed' | 'failed' | 'skipped';
       verdictSource: string | null; // e.g. "semantic-check", null for non-phase commands
       verdictReason: string | null; // reason from evaluateStepResult
       startedAt: string;    // ISO 8601
       completedAt: string | null;
       durationMs: number | null;
     }
     ```

  2. In `src/core/db.ts`:
     a. Add `CREATE TABLE IF NOT EXISTS job_steps` to schema init (alongside jobs table):
        ```sql
        CREATE TABLE IF NOT EXISTS job_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL REFERENCES jobs(id),
          step_index INTEGER NOT NULL,
          command TEXT NOT NULL,
          args TEXT NOT NULL DEFAULT '',
          session_title TEXT,
          session_id TEXT,
          status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'skipped')),
          verdict_source TEXT,
          verdict_reason TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT,
          duration_ms INTEGER
        );
        ```
     b. Add `recordStep(jobId, stepIndex, command, args, sessionTitle?)` function:
        - Inserts a new row with status='running', returns the row id
     c. Add `completeStep(id, status, verdictSource?, verdictReason?, sessionId?)` function:
        - Updates status, completed_at=datetime('now'), calculates duration_ms from started_at,
          sets verdict_source, verdict_reason, session_id
     d. Add `getJobSteps(jobId)` function:
        - Returns JobStep[] ordered by step_index ASC
     e. Add `skipRemainingSteps(jobId, fromIndex, reason)` function:
        - Inserts rows with status='skipped' for remaining steps (used on interruption)
     f. Export all new functions.

  3. Ensure `openPilotDb()` calls the new CREATE TABLE in addition to existing jobs table.
     Use a separate `exec()` call (not combined SQL) for the job_steps table.
     Add `_getTestDb()` to also create the job_steps table.
  </action>
  <verify>
    `npx tsc --noEmit` passes. Existing tests still pass: `npx vitest run test/core/db.test.ts` (if it exists) and `npx vitest run test/core/runner.test.ts`.
  </verify>
  <done>
    JobStep type exported from types.ts. job_steps table created on DB init. recordStep, completeStep, getJobSteps, skipRemainingSteps exported from db.ts. All existing tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire step recording into runner + surface in pilot log</name>
  <files>src/core/runner.ts, src/commands/log.ts, test/core/runner.test.ts</files>
  <action>
  1. In `src/core/runner.ts` — modify `launch()` method to record steps:
     a. Import `recordStep`, `completeStep`, `skipRemainingSteps` from db.js
     b. Before `spawnAndWait()` call: `const stepRowId = recordStep(job.id, i, step.command, step.args, title);`
     c. After `spawnAndWait()` succeeds:
        - Look up sessionId: `const sessionId = findSessionByTitle(title);`
        - For phase commands that run evaluateStepResult: capture the verdict
        - Call `completeStep(stepRowId, 'completed', verdict?.source ?? null, verdict?.reason ?? null, sessionId ?? null)`
     d. If evaluateStepResult returns `success: false`:
        - Call `completeStep(stepRowId, 'failed', verdict.source, verdict.reason, sessionId ?? null)` BEFORE throwing
     e. If `shuttingDown` breaks the loop:
        - After loop, call `skipRemainingSteps(job.id, i + 1, 'Runner shutdown')` for the remaining unexecuted steps
        - For the current step that was interrupted mid-execution, if stepRowId was recorded, call `completeStep(stepRowId, 'skipped', null, 'Interrupted by shutdown')`
     f. In the catch block: if a stepRowId was in-flight, mark it failed

     Key: the `evaluateStepResult` call currently throws on failure. Restructure so the step gets recorded BEFORE the throw:
     ```typescript
     if (step.command === 'execute-phase' || step.command === 'plan-phase') {
       const sessionId = findSessionByTitle(title);
       if (sessionId) {
         const verdict = evaluateStepResult(sessionId, step.command);
         if (!verdict.success) {
           completeStep(stepRowId, 'failed', verdict.source, verdict.reason, sessionId);
           throw new Error(`Step "${step.command} ${step.args}" failed: ${verdict.reason}`);
         }
         completeStep(stepRowId, 'completed', verdict.source, verdict.reason, sessionId);
       } else {
         completeStep(stepRowId, 'completed', null, 'Session not found for verdict check');
       }
     } else {
       const sessionId = findSessionByTitle(title);
       completeStep(stepRowId, 'completed', null, null, sessionId ?? null);
     }
     ```

  2. In `src/commands/log.ts` — add step summary section:
     a. Import `getJobSteps` from db.js
     b. After the human header (job info line), before rendering session parts:
        - Call `getJobSteps(job.id)`
        - If steps exist, render a compact step summary:
          ```
            Steps:
              1. plan-phase 3 --auto  ✓ completed (12s) [semantic-check: No failure markers]
              2. execute-phase 3      ✗ failed (45s) [semantic-check: no matching phase]
              3. verify-phase 3       ○ skipped [Runner shutdown]
          ```
        - Use green ✓ for completed, red ✗ for failed, dim ○ for skipped
        - Show duration in human-friendly format (Xs, Xm Xs)
        - Show verdict source and truncated reason in brackets when present
     c. In JSON mode, include `steps` array in the output object

  3. In `test/core/runner.test.ts` — add/update tests:
     a. Mock `recordStep`, `completeStep`, `skipRemainingSteps` from db.js (add to existing mock block)
     b. Add test: "records step for each step in multi-step plan" — verify recordStep called with correct args
     c. Add test: "completes step with verdict on semantic check" — verify completeStep called with semantic-check source
     d. Add test: "marks step failed before throwing on semantic failure" — verify completeStep('failed') called before markFailed
     e. Update existing "shutdown interruption" test to also verify skipRemainingSteps is called
  </action>
  <verify>
    `npx tsc --noEmit` passes. `npx vitest run` — all tests pass including new step-recording tests.
    Manual check: `grep -n 'recordStep\|completeStep' src/core/runner.ts` shows step recording in launch().
    `grep -n 'getJobSteps' src/commands/log.ts` shows step display in log command.
  </verify>
  <done>
    Runner records every step with timing, verdict source, and status. Failed steps are recorded before error propagation. Interrupted steps are marked skipped. `pilot log` shows step summary with per-step verdicts. Tests verify step recording for success, failure, and interruption paths.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run` — all tests pass
3. Step recording verified: runner.ts calls recordStep before spawn, completeStep after spawn, with verdict for phase commands
4. Step display verified: log.ts renders step summary with status icons and verdict info
5. Interruption path verified: skipped steps recorded when runner shuts down mid-job
</verification>

<success_criteria>
- job_steps table exists and is created on DB init
- Every step execution in runner creates a step record with timing + verdict
- `pilot log <id>` shows step-level verdicts for debugging
- Semantic failures are recorded in step before being propagated as job failure
- Runner shutdown marks remaining steps as skipped
- All existing tests continue to pass, new tests cover step recording
</success_criteria>

<output>
After completion, create `.planning/quick/015-pilot-requirement-phase-execution-succes/015-SUMMARY.md`
</output>
