---
phase: 26-runner-immediate-dispatch-force-quit
plan: 05
subsystem: testing
tags: [vitest, sqlite, runner, dispatch, force-quit, kill-command, project-serialization]

# Dependency graph
requires:
  - phase: 26-runner-immediate-dispatch-force-quit
    provides: claimNextLaunchable, forceQuitJob, killJobSession, ConfirmOverlay

provides:
  - DB tests for claimNextLaunchable project serialization
  - DB tests for forceQuitJob audit trail
  - Runner dispatch and reconcileStaleRunning tests
  - CLI kill command test suite

affects: [future-regression-detection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mocked() for typed access to module-level vi.fn() mocks"
    - "reconcileStaleJobs must be in db mock factory for runner.run() tests"
    - "makeRunningJob helper pattern for kill command tests"

key-files:
  created:
    - test/commands/kill.test.ts
  modified:
    - test/core/db.test.ts
    - test/core/runner.test.ts

key-decisions:
  - "reconcileStaleJobs added to db mock factory — runner.run() calls it on startup, must be present"
  - "reconcileStaleRunning tested indirectly via runner.run(once:true) — function is private"
  - "execa mock returns stdout:'' by default — stale reconcile paths use its stdout for pgrep check"
  - "makeJob helper returns full Job with modelProfile/providerMode to satisfy strict TS"

patterns-established:
  - "vi.mocked() to get typed mock references after vi.mock() factory"
  - "afterEach clearAllMocks in runner dispatch tests prevents state leakage"

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 26 Plan 05: Tests — Runner Dispatch + DB Force-Quit + CLI Kill Summary

**Test coverage for claimNextLaunchable project serialization, forceQuitJob audit trail, runner immediate dispatch, reconcileStaleRunning, and kill command guard rails.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T18:43:45Z
- **Completed:** 2026-03-03T18:47:30Z
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- DB tests prove `claimNextLaunchable` project serialization (same-project pending blocked while one is running, cross-project parallel OK)
- DB tests prove `forceQuitJob` marks job + steps failed with `cli`/`tui` source embedded in audit message
- Runner dispatch tests prove immediate multi-slot filling (both slots claimed before sleep) and maxParallel=1 sequential ordering
- `reconcileStaleRunning` tested indirectly via `runner.run(once:true)`: `forceQuitJob` called for orphaned jobs, not called for live processes
- Kill command tests cover all guard rails: requires `--force`, rejects non-running, calls `killJobSession` then `forceQuitJob`, continues even when `killJobSession` returns `killed:false`

## Task Commits

Each task was committed atomically:

1. **Task 1: DB tests for claimNextLaunchable and forceQuitJob** - `c89f498` (test)
2. **Task 2: Runner dispatch + kill tests + CLI kill command tests** - `a8025e9` (test)

**Plan metadata:** `[TBD]` (docs: complete plan)

## Files Created/Modified

- `test/core/db.test.ts` — Added `describe('claimNextLaunchable', ...)` (5 tests) and `describe('forceQuitJob', ...)` (5 tests), imports for new functions
- `test/core/runner.test.ts` — Added `describe('immediate dispatch', ...)` (2 tests), `describe('reconcileStaleRunning (via runner.run)', ...)` (2 tests); added `reconcileStaleJobs` to db mock factory; added db/delegate/execa imports
- `test/commands/kill.test.ts` — New file: 6 tests covering all kill command paths

## Decisions Made

- `reconcileStaleJobs` must be in db mock factory — `runner.run()` calls it synchronously on startup before the async portion; omitting it crashes the test
- `reconcileStaleRunning` (private) tested indirectly via `runner.run(once:true)` — cleaner than exporting for tests
- `makeJob` helper includes `modelProfile`/`providerMode` to satisfy strict TypeScript (Job type has both as required fields)
- `execa` mock left at module level (returns `stdout:''` by default) — stale reconcile pgrep check reads stdout; for the "alive" test we override per-test via `vi.mocked(execa).mockResolvedValue()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] reconcileStaleJobs missing from db mock factory**

- **Found during:** Task 2 runner dispatch tests
- **Issue:** `runner.run()` calls `reconcileStaleJobs` synchronously on startup; db mock factory didn't expose it, causing `[vitest] No "reconcileStaleJobs" export is defined` error on all runner.run() tests
- **Fix:** Added `reconcileStaleJobs: vi.fn(() => [])` to the `vi.mock('../../src/core/db.js', ...)` factory
- **Files modified:** test/core/runner.test.ts
- **Verification:** All 4 new runner tests now pass
- **Committed in:** a8025e9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor — one missing mock entry, fixed inline. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 26 complete: all 5 plans executed and passing
- Full test suite at 222 tests, all green
- Ready for Phase 27 (TUI Detail Header Rework + Run Info Density + Completed Hover Overlay Fix)

---
*Phase: 26-runner-immediate-dispatch-force-quit*
*Completed: 2026-03-03*
