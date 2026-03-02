---
phase: quick-015
plan: 01
status: complete
duration: 10m
completed: 2026-03-02
subsystem: runner
tags: [job-steps, step-observability, audit-trail, runner, log]
tech-stack:
  added: []
  patterns: [step-level-audit-trail, per-step-verdict-recording]
key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/core/runner.ts
    - src/commands/log.ts
    - test/core/runner.test.ts
decisions:
  - { area: db, decision: "job_steps table uses julianday arithmetic for duration_ms", rationale: "SQLite-native calculation avoids app-level timing" }
  - { area: runner, decision: "currentStepRowId scoped at launch() level for catch block access", rationale: "Safety net marks in-flight step failed on unexpected errors" }
  - { area: runner, decision: "Spawn errors caught per-step and recorded before re-throw", rationale: "Step audit trail captures spawn failures distinct from semantic failures" }
  - { area: log, decision: "Step summary rendered between header and session activity", rationale: "Immediate visibility before diving into detailed session parts" }
  - { area: log, decision: "Verdict reasons truncated to 60 chars in human output", rationale: "Keeps step summary compact and scannable" }
---

# Quick 015: Step-Level Observability (R4)

Implemented R4 from the Phase Execution Success Contract — the step-level observability requirement deferred by quick-013.

## One-liner

job_steps SQLite table + per-step recording in runner with timing/verdicts + step summary in `pilot log`

## What was done

### Task 1: Add job_steps table and recording functions to DB + types
**Commit:** `ae94ce7`

- Added `JobStep` interface to `types.ts` with id, jobId, stepIndex, command, args, sessionTitle, sessionId, status, verdictSource, verdictReason, startedAt, completedAt, durationMs
- Added `CREATE TABLE IF NOT EXISTS job_steps` to `db.ts` — created in both `openPilotDb()` and `_getTestDb()`
- Added `recordStep(jobId, stepIndex, command, args, sessionTitle?)` — inserts running row, returns ID
- Added `completeStep(id, status, verdictSource?, verdictReason?, sessionId?)` — finalizes with duration computed via julianday arithmetic
- Added `getJobSteps(jobId)` — returns ordered steps for a job
- Added `skipRemainingSteps(jobId, fromIndex, reason)` — reads delegation plan to insert skipped rows for remaining steps

### Task 2: Wire step recording into runner + surface in pilot log
**Commit:** `6840417`

**Runner (runner.ts):**
- `recordStep()` called before each `spawnAndWait()` with job ID, step index, command, args, and session title
- After successful spawn, semantic check for phase commands records verdict via `completeStep()` with source='semantic-check'
- On semantic failure: `completeStep(id, 'failed', ...)` called BEFORE `markFailed()` — ensures step audit trail captures the failure before job-level error propagation
- On spawn error: per-step catch records failed step before re-throwing
- On shutdown interruption: `skipRemainingSteps()` called for unexecuted steps
- Safety net in outer catch: if `currentStepRowId` is non-null, marks it failed

**Log command (log.ts):**
- Calls `getJobSteps(jobId)` and renders step summary between header and session activity
- Format: `✓ 1. plan-phase 3 --auto (12s) [semantic-check: No failure markers]`
- Status icons: green ✓ completed, red ✗ failed, dim ○ skipped, yellow ⟳ running
- Duration in human-friendly format (Xs, Xm Ys)
- Verdict source and truncated reason in brackets when present
- JSON mode includes full `steps` array in output

**Tests (runner.test.ts):**
- Added mocks for `recordStep`, `completeStep`, `skipRemainingSteps`
- "records step for each step in multi-step plan" — verifies recordStep called with correct args per step
- "completes step with verdict on semantic check" — verifies completeStep called with semantic-check source
- "marks step failed before throwing on semantic failure" — verifies ordering (completeStep before markFailed)
- "records step completed for quick commands without verdict" — verifies null verdict for non-phase commands
- Updated shutdown interruption test to verify `skipRemainingSteps` is called

## Deviations from Plan

None — plan executed exactly as written.

## Verification

1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run` — all 168 tests pass (was 164, added 4 new)
3. Step recording verified: runner.ts calls recordStep before spawn, completeStep after, with verdict for phase commands
4. Step display verified: log.ts renders step summary with status icons and verdict info
5. Interruption path verified: skipped steps recorded when runner shuts down mid-job
