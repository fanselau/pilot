---
phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration
plan: "02"
subsystem: testing
tags: [vitest, runner, debug-lane, integration-tests, mock]

# Dependency graph
requires:
  - phase: 91-01
    provides: executeDebugFlow, handleDebugOutcome, continueDebugAfterVerify, debug-lane.ts

provides:
  - Integration test suite for runner debug lane behavior
  - Tests for all 5 debug outcome types (debug_complete, root_cause_found, investigation_inconclusive, checkpoint×3, unknown)
  - Tests for autonomous continuation after human-verify checkpoint
  - Tests for hung session handling and safety guard in handleHungContinuation
  - Regression prevention for incident chain failure modes (ovm4/po5n/y6f5)

affects: [runner, debug-lane, ci, regression-prevention]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildDebugEnv helper: vi.resetModules() + vi.doMock() for isolated runner module instances"
    - "Session content cycling: opts.sessionContents[] array cycled via exportCallCount to control per-call outcomes"
    - "Hung session simulation: opts.firstSpawnHung with getSessionState returning hung-on-prompt on first call"

key-files:
  created:
    - test/core/runner-debug-lane.test.ts
  modified: []

key-decisions:
  - "Test via runner.run() (integration): all behaviors tested through public launch() path to ensure real wiring is validated"
  - "buildDebugEnv helper with vi.resetModules() + vi.doMock(): ensures fresh module state per test (no lastSpawnTime bleed)"
  - "Session content controlled via exportSessionFromDb mock cycling: simplest way to control debug outcome type per test"
  - "HungSessionError simulation via getSessionState returning hung-on-prompt: matches real runner behavior without real process management"
  - "handleHungContinuation safety guard tested via quick-intent + debug-scope job: edge case that can't be triggered by debug intent directly"

patterns-established:
  - "Debug lane integration tests: test through runner.run() with mocked dependencies, not unit-testing private methods"
  - "Mock call inspection: cast mock.calls to unknown[][] before accessing args by index (type safety)"

requirements-completed:
  - DBG-01
  - DBG-02
  - DBG-03
  - DBG-04
  - DBG-05
  - DBG-06
  - DBG-07
  - DBG-08
  - DBG-09
  - DBG-10
  - DBG-11
  - DBG-12
  - DBG-13
  - DBG-14

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 91 Plan 02: Runner Debug Lane Integration Tests Summary

**17-test integration suite for runner debug lane covering all 5 outcome types, autonomous continuation, hung session handling, and incident chain (ovm4/po5n/y6f5) regression prevention**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T16:38:00Z
- **Completed:** 2026-03-23T16:44:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `test/core/runner-debug-lane.test.ts` with 17 integration tests (756 lines), exceeding the 12-test minimum
- Tests cover all 5 debug outcome types: `debug_complete`, `root_cause_found`, `investigation_inconclusive`, all 3 checkpoint variants, and `unknown`
- Tests verify autonomous continuation flow for human-verify checkpoints (two spawns, final markCompleted)
- Tests verify explicit blocking for human-action/decision checkpoints (markReviewHold, not markFailed)
- Tests verify hung session handling prevents re-delegation for debug jobs
- Tests validate against incident chain failure modes: no judge routing, no phase number extraction, clean failure on interactive prompts

## Task Commits

1. **Task 1: Integration tests for runner debug lane** - `b798f56` (test)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `test/core/runner-debug-lane.test.ts` - 17 integration tests for runner debug lane behavior

## Decisions Made

- **Test via runner.run() (integration):** All behaviors tested through the public `launch()` path, ensuring the real wiring from intent routing through outcome handling is validated end-to-end. Private methods are not accessed directly.
- **vi.resetModules() + vi.doMock() per test:** Each test gets a fresh Runner module instance (resetting module-level state like `lastSpawnTime`). The `buildDebugEnv` helper encapsulates the full mock setup.
- **Session content controlled via exportSessionFromDb cycling:** The `sessionContents` array is cycled through successive `exportSessionFromDb` calls, allowing the continuation test to return checkpoint content on the first call and debug-complete on the second.
- **HungSessionError simulation via getSessionState:** `getSessionState` returns `hung-on-prompt` on the first call when `firstSpawnHung: true`, triggering the HungSessionError path naturally through the poll loop.
- **handleHungContinuation safety guard tested indirectly:** The guard (job.scope === 'debug' → markFailed, no reDelegateForContinuation) is tested by creating a debug-scoped job with a quick intent, causing it to go through `executeCommandStep` where the guard fires.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 91 (all 2 plans) is now complete. Both plans are verified:
- Plan 01: Debug lane implementation in runner.ts and debug-lane.ts
- Plan 02: Integration tests for all debug lane behaviors

Ready for next phase. The debug lane is production-ready with full regression coverage.

---
*Phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration*
*Completed: 2026-03-23*
