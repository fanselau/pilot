---
status: resolved
trigger: "Job hsqw (ui-phase for phase 90) completed successfully and created 90-UI-SPEC.md, but Pilot did not advance to plan-phase 90. Step 2 (ui-phase 90) remained in stale/running state. Session ended but job not closed."
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — getSessionState() returned 'working' when pidAlive=false due to child session check ignoring pidAlive, creating infinite poll loop in spawnAndWait
test: applied fix, all tests pass including new regression test
expecting: n/a — fix verified
next_action: none — resolved

## Symptoms

expected: When ui-phase subagent completes successfully (creates 90-UI-SPEC.md), the orchestrator (Pilot) should detect completion, mark step 2 as done, advance to the next step (plan-phase 90), and eventually close the job cleanly when the session ends.
actual: ui-phase completed and produced the expected artifact (90-UI-SPEC.md), but step 2 stayed in stale/running state. Pilot did not advance to plan-phase 90. When the session ended, the job was not properly closed — required external force-quit. The subagent completed its work but the parent orchestrator failed to handle the completion signal.
errors: No explicit error messages reported. The failure is silent — the orchestrator simply doesn't advance after the subagent returns. The job lingers in an unclosed state after the session ends.
reproduction: Run a ui-phase command for a phase. The subagent completes successfully but the orchestrator fails to advance. Additionally, jobs t069 and porx failed before step 1 during delegation — this is related to an opencode run bootstrap regression that was partially resolved by rollback.
started: During phase 90 execution. Delegation regression (t069, porx) appeared first and was partially fixed by rollback, but core handoff/reconciliation issue persists.

## Eliminated

## Evidence

- timestamp: 2026-03-23T00:10:00Z
  checked: getSessionState() child session check in opencode-db.ts lines 653-676
  found: When parent session has step-finish reason='stop' but a child session lacks terminal step-finish, getSessionState returns { state: 'working' } REGARDLESS of the pidAlive parameter. The check does not consider pidAlive.
  implication: When the parent PID is dead (pidAlive=false), this still returns 'working' — preventing the caller from ever detecting completion.

- timestamp: 2026-03-23T00:12:00Z
  checked: spawnAndWait() dead-PID handler in runner.ts lines 1772-1802
  found: The dead-PID handler calls getSessionState(sessionId, false) and ONLY handles 'done' and 'crashed' states. Any other state (working, hung-on-tool, hung-on-prompt) falls through after a 2s WAL wait. After the WAL wait, only 'done' and 'crashed' are handled again. Otherwise it falls through to the main poll loop.
  implication: When getSessionState returns 'working' (due to child sessions), the dead-PID handler falls through. The main poll loop then re-enters the dead-PID handler on next iteration, creating an infinite loop.

- timestamp: 2026-03-23T00:14:00Z
  checked: Timeout calculation in spawnAndWait lines 1619-1625
  found: For non-judge command steps, timeoutMs is calculated from job.timeout. If job.timeout is 0 or undefined, timeoutMs = Infinity. The while condition at line 1734 is `timeoutMs === Infinity || Date.now() - start < timeoutMs` — so with Infinity, the loop never times out.
  implication: The infinite poll loop runs forever (no timeout to break it), causing the session/job to hang indefinitely.

- timestamp: 2026-03-23T00:16:00Z
  checked: Existing tests in test/core/opencode-db.test.ts lines 1018-1059
  found: Tests for parent-done-child-running scenario only test with pidAlive=true (default). No test covers pidAlive=false with running children.
  implication: The bug path was untested — no coverage for the exact failure scenario.

- timestamp: 2026-03-23T00:18:00Z
  checked: isSessionDone() in opencode-db.ts lines 575-614
  found: isSessionDone (used by delegation/continuation polling) does NOT check child sessions — only checks parent's step-finish. This explains why delegation works fine but command execution (which uses getSessionState via spawnAndWait) gets stuck.
  implication: Confirms the bug is specific to the getSessionState → spawnAndWait path used for command execution.

## Resolution

root_cause: getSessionState() returns 'working' when parent session has terminal step-finish AND child sessions lack terminal step-finish, REGARDLESS of the pidAlive parameter. When the spawned process dies (PID dead), spawnAndWait's dead-PID handler only handles 'done' and 'crashed' states — 'working' falls through to create an infinite poll loop with no timeout escape. The ui-phase session likely spawned task() child sessions. When the parent process died after completion, the child session check caused getSessionState to return 'working' even though pidAlive=false, trapping the runner in an infinite poll loop.
fix: (1) Gate the child session check in getSessionState behind pidAlive — when pidAlive=false, skip child check and treat parent with terminal step-finish as done. (2) Add defensive safety net in spawnAndWait's dead-PID handler — after WAL wait, if state is still not 'done' or 'crashed', treat as complete if session has assistant messages, or throw with descriptive error.
verification: All tests pass (job-detail-query 58/58, opencode-db regression test passes). New regression test confirms pidAlive=false returns 'done' while pidAlive=true preserves existing 'working' behavior for child sessions. TypeScript compilation clean.
files_changed: [src/core/opencode-db.ts, src/core/runner.ts, src/core/job-detail-query.ts, test/core/opencode-db.test.ts, test/core/job-detail-query.test.ts]

## Delegation/Bootstrap Regression (t069, porx)

investigation: Jobs t069 and porx failed before step 1 during delegation. Root cause was an opencode version regression that broke `opencode run --agent build --model anthropic/claude-opus-4-6`. After rolling back to an earlier opencode version, the bootstrap path works again.
conclusion: This is NOT the same bug as the ui-phase handoff issue. It is an external dependency regression (opencode binary). Pilot already surfaces this correctly:
  - delegate.ts wraps spawn failures with "Delegation failed:" prefix
  - delegate.ts suggests "Check project setup with: pilot doctor --project" on failure
  - runner.ts launch() catches delegation errors and marks job as failed with the prefixed message
recommendation: No additional health check needed in Pilot. The existing error surfaces clearly distinguish delegation/bootstrap failures from handoff failures. If opencode regressions recur, `pilot doctor` is the correct diagnostic entry point.

## Observability Improvements

- Added step lifecycle logging to the runner step execution loop:
  - `[runner] Step started: {command} {args} (step N/M) [job=ID]`
  - `[runner] Step completed: {command} {args} (step N/M) [job=ID]`
- Safety net warnings explicitly log state and message count for dead-PID scenarios
- Delegation failures prefixed with "Delegation failed:" for clear differentiation
- These logs appear in normal operation (not gated behind PILOT_DEBUG)
