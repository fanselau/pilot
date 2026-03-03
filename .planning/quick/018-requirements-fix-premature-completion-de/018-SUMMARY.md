---
phase: quick-018
plan: 01
subsystem: runner-reliability
tags: [opencode-db, runner, completion-detection, stuck-detection, semantic-success]
requires: []
provides:
  - isSessionDone() — step-finish reason-based session completion detection
  - Fixed spawnAndWait() polling using isSessionDone + PID liveness
  - Fixed verifyWithGraceWindow() using isSessionDone for liveness
  - Hardened evaluateStepResult() with fail-safe uncertain + 8 new failure patterns
  - Fixed parsePartRow() patch parsing (files[] + operations[].path fallback)
  - Fixed isStuck() to check ANY running part, not just the last one
affects: []
key-files:
  created: []
  modified:
    - src/core/opencode-db.ts
    - src/core/runner.ts
    - src/commands/status.ts
    - src/tui/data/opencode-db.ts
    - test/core/opencode-db.test.ts
    - test/core/runner.test.ts
decisions:
  - isSessionDone uses step-finish reason as ground truth vs checking running parts
  - isSessionActive kept as deprecated alias delegating to !isSessionDone
  - evaluateStepResult uncertain fallback changed to fail-safe (success:false)
  - parsePartRow tries files[] first, falls back to operations[].path for backward compat
  - isStuck queries ANY part with status=running, not just the last part
metrics:
  duration: 5 minutes
  completed: 2026-03-03
---

# Quick Task 018: Fix Premature Completion Detection Summary

**One-liner:** isSessionDone() via step-finish reason replaces broken isSessionActive() parts-check, eliminating premature job completion between tool calls.

## What Was Done

Fixed the #1 reliability bug in the pilot runner: premature session completion detection caused by checking for "running parts" which returns false between tool calls (during AI thinking time). Replaced with `isSessionDone()` which uses the `step-finish` DB record's `reason` field as ground truth. Also hardened `evaluateStepResult()` against phantom completion, fixed patch parsing, and improved stuck detection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add isSessionDone() and fix opencode-db.ts heuristics | 95a21fa | opencode-db.ts, opencode-db.test.ts |
| 2 | Fix runner.ts polling + evaluateStepResult + migrate all callers | c1a2fe4 | runner.ts, status.ts, tui/data/opencode-db.ts, runner.test.ts |

## Changes Made

### src/core/opencode-db.ts

1. **Added `isSessionDone(sessionId): boolean`** — queries most recent `step-finish` part:
   - `reason='stop'` → done ✅
   - `reason='length'` → done (token limit, logs warning)
   - `reason='tool-calls'` → NOT done (between steps)
   - No rows → NOT done (just started)

2. **Deprecated `isSessionActive()`** — now delegates to `!isSessionDone()` with JSDoc `@deprecated` note. Exported for backward compat.

3. **Fixed `parsePartRow()` patch parsing** — now tries `partData.files[]` (flat string array — actual DB schema) first, falls back to `partData.operations[].path` for backward compatibility.

4. **Fixed `isStuck()`** — now queries for ANY part with `status='running'` (not just the last part). Also detects stale pending parts (>120s) as killed-session indicators.

### src/core/runner.ts

5. **Rewrote `spawnAndWait()` polling loop** — replaced `isSessionActive()` + 60s message age check with:
   - `isSessionDone(sessionId)` → primary completion check
   - `process.kill(pid, 0)` → PID liveness as belt-and-suspenders
   - Handles: session not yet in DB, PID dead before session appeared, process died without stop signal

6. **Fixed `verifyWithGraceWindow()` liveness check** — replaced `isSessionActive() || (lastMsgAge < 60_000)` with `!isSessionDone(sessionId)`.

7. **Hardened `evaluateStepResult()`**:
   - Added 8 new failure patterns: `compilation failed`, `build error`, `test failed`, `syntax error`, `I was unable to`, `I couldn't`, `Unfortunately, I`, `fatal error`
   - Changed uncertain fallback from `success: true` to `success: false` (fail-safe — better to retry than phantom completion)

### src/commands/status.ts

8. **Migrated `isJobStale()`** — replaced `!isSessionActive(sessionId)` with `isSessionDone(sessionId)`.

### src/tui/data/opencode-db.ts

9. **Migrated re-export** — re-exports `isSessionDone` instead of `isSessionActive`.

## Verification

- `npx tsc --noEmit` → 0 type errors ✅
- `npx vitest run` → 239/239 tests pass ✅
- `grep -r "isSessionActive" src/` → only deprecated alias definition + comments ✅
- `grep -r "isSessionDone" src/` → present in all 4 required files ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] isSessionActive deprecated behavior change for empty sessions / nonexistent sessions**

- **Found during:** Task 1 test writing
- **Issue:** Old `isSessionActive` returned `false` for sessions with no parts. New implementation (`!isSessionDone()`) returns `true` for the same cases (no step-finish = not done = still active). Semantically more correct but behavior changed.
- **Fix:** Updated test assertions to document new (more correct) behavior. Added notes explaining the semantic correctness.
- **Files modified:** test/core/opencode-db.test.ts
- **Commit:** 95a21fa

**2. [Rule 2 - Missing Critical] "safe defaults when DB unavailable" tests needed updating for isSessionActive**

- **Found during:** Task 1
- **Issue:** DB-unavailable test for `isSessionActive` expected `false` but new impl returns `!isSessionDone() = !false = true`
- **Fix:** Updated test to document new behavior (returns `true` meaning "not done" when DB unavailable — which is the correct fail-safe for session liveness checks)
- **Files modified:** test/core/opencode-db.test.ts
- **Commit:** 95a21fa

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| isSessionDone step-finish reason as ground truth | Eliminates false negatives between tool calls during AI thinking time |
| isSessionActive deprecated → delegates to !isSessionDone | Backward compat without breaking existing callers during transition |
| evaluateStepResult uncertain → fail-safe (success:false) | Phantom completion is worse than an extra retry |
| parsePartRow tries files[] first | Actual DB schema uses flat string array; operations[].path is legacy format |
| isStuck checks ANY running part | Last-part-only check missed running tool parts earlier in session |
