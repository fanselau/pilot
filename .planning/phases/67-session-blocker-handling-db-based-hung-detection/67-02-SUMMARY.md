---
phase: 67-session-blocker-handling-db-based-hung-detection
plan: 02
subsystem: infra
tags: [runner, error-types, process-management, sigterm, sigkill, hung-detection]

# Dependency graph
requires:
  - phase: 67-01
    provides: getSessionState() and SessionState types for hung detection context
provides:
  - HungSessionError class with hungReason, lastToolCall, sessionTitle fields
  - killHungSession private method in Runner: SIGTERM → 5s wait → SIGKILL sequence
  - Orphan bug fix: timeout paths now kill process before throwing
affects:
  - 67-03 (poll loop integration uses HungSessionError and killHungSession)
  - 67-04 (retry logic and notifications receive HungSessionError instances)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error subclass pattern: custom fields + name= + default message construction"
    - "SIGTERM→SIGKILL with 500ms poll loop for graceful session termination"
    - "Private helper extraction for reusable kill behavior"

key-files:
  created: []
  modified:
    - src/util/errors.ts
    - src/core/runner.ts
    - test/core/runner.test.ts

key-decisions:
  - "killHungSession is private on Runner (not exported) — only used internally for hung detection"
  - "log() private helper added for consistent [runner] stderr prefix"
  - "Orphan fix: both timeout paths (sessionFound=false and sessionFound=true) call killHungSession before throw"

patterns-established:
  - "HungSessionError: carry enough context (reason, tool, title) for meaningful logs and notifications"
  - "killHungSession: SIGTERM first, poll 500ms intervals, SIGKILL after 5s deadline"

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 67 Plan 02: HungSessionError Class and Kill Behavior Summary

**`HungSessionError` class added to errors.ts; `killHungSession` SIGTERM→SIGKILL helper added to Runner; timeout orphan bug fixed in both timeout paths of `spawnAndWait()`**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T23:51:05Z
- **Completed:** 2026-03-15T23:53:27Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `HungSessionError` class in `src/util/errors.ts` with `hungReason`, `lastToolCall`, `sessionTitle` fields and default message formatting
- `killHungSession` private method on Runner: SIGTERM → poll 500ms → SIGKILL after 5s deadline, cleans sessionPids map
- Fixed orphan bug in `spawnAndWait()`: both timeout paths (`sessionFound=false` and timeout expiry) now call `killHungSession` before throwing
- 10 new tests for `HungSessionError` construction, field access, and message formatting — all passing
- Full test suite: 1032 tests pass, no regressions (3 pre-existing web test file failures unrelated to these changes)

## Task Commits

1. **Task 1: Create HungSessionError class** - `bd140b1` (feat)
2. **Task 2: Add killHungSession helper and fix timeout orphan bug** - `e27f9a9` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `src/util/errors.ts` — Added `HungReason` type union and `HungSessionError` class (29 lines added)
- `src/core/runner.ts` — Added `killHungSession` private method, `log()` helper, fixed both timeout throw paths
- `test/core/runner.test.ts` — Added `describe('HungSessionError')` block with 10 test cases

## Decisions Made

- **`killHungSession` is private on Runner**: Only the poll loop integration (Plan 03) will call it via the hung detection path; no reason to export
- **`log()` private helper added**: Consistent `[runner]` prefix for kill logging without repeating `process.stderr.write` boilerplate
- **Both timeout paths fixed**: `sessionFound=false` (process died before session appeared) and the main timeout expiry both now kill before throwing — complete orphan elimination

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Implementation was straightforward. The `log()` helper was a small addition beyond the spec for cleaner logging code, tracked as an inline improvement.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 67-03: integrate `getSessionState()` into the `spawnAndWait()` poll loop, replacing `isSessionDone()` with the 5-state classification and adding `hung-on-prompt` immediate kill behavior using the `killHungSession` method added here.

---
*Phase: 67-session-blocker-handling-db-based-hung-detection*
*Completed: 2026-03-15*
