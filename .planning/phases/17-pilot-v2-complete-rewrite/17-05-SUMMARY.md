---
phase: 17-pilot-v2-complete-rewrite
plan: 05
subsystem: infra
tags: [queue-runner, event-loop, spawn, pre-spawn-checks, opencode-db-polling, graceful-shutdown]

# Dependency graph
requires:
  - phase: 17-02
    provides: "SQLite queue DB (pilot.db) with job CRUD"
  - phase: 17-03
    provides: "opencode-db session queries (findSessionByTitle, isSessionActive, getLastMessage)"
  - phase: 17-04
    provides: "Delegation AI (delegate function, resolveOpencodeBinary)"
provides:
  - "Runner class with event loop (poll → delegate → spawn → poll completion)"
  - "Pre-spawn safety checks (git gc disable, memory check, rate limiting, config validation)"
  - "Graceful shutdown on SIGTERM/SIGINT"
  - "createRunner factory function"
affects: [17-06, 17-07, 17-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async fire-and-forget launch with pre-tracking in activeJobs map"
    - "Module-level spawn rate limiter with test reset function"
    - "opencode DB polling for session completion instead of PID tracking"

key-files:
  created:
    - src/core/runner.ts
    - test/core/runner.test.ts
  modified: []

key-decisions:
  - "Poll interval for session completion reads from config.pollInterval instead of hardcoded 5s — enables fast tests"
  - "activeJobs tracked in run() BEFORE async launch() to prevent --once mode race condition"
  - "Guard against re-launching same job ID that is already active"
  - "Module-level _resetSpawnRateLimit for test isolation"

patterns-established:
  - "Runner event loop: poll queue → launch async → sleep → repeat"
  - "Pre-spawn safety: disableSnapshotGc + checkMemory + enforceSpawnRateLimit + validateProjectConfig"

# Metrics
duration: 14min
completed: 2026-02-22
---

# Phase 17 Plan 05: Runner Event Loop Summary

**V2 queue runner with delegate→spawn→poll pattern, pre-spawn safety checks from SPAWN-LESSONS.md, and 12 unit tests**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-22T21:02:30Z
- **Completed:** 2026-02-22T21:16:55Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Runner class implementing the v2 event loop: poll queue → delegate → spawn opencode → poll DB for completion → mark done/failed
- All 4 SPAWN-LESSONS pre-spawn checks: git gc disable on snapshot repos (including global), 2GB memory check, 5s spawn rate limiting, opencode.json permission validation
- Graceful shutdown via SIGTERM/SIGINT with clean state transition
- 12 unit tests covering constructor, state management, --once mode, delegation errors, spawn errors, multi-step plans, and graceful shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement runner.ts event loop** - `3cd5075` (feat)
2. **Task 2: Runner unit tests** - `0fcd030` (test)

## Files Created/Modified
- `src/core/runner.ts` - V2 queue runner: event loop, pre-spawn checks, session polling, graceful shutdown (430 lines)
- `test/core/runner.test.ts` - Runner unit tests with mocked db/delegate/opencode-db/execa (367 lines)

## Decisions Made
- Poll interval for session completion reads from `config.pollInterval` instead of hardcoded 5000ms — enables 1-second polls in tests
- `activeJobs` map entry set in `run()` before `launch()` fires asynchronously — prevents --once mode from exiting before launch starts
- Guard against re-launching a job ID that's already in `activeJobs` — prevents duplicate launches when `getNextPending` returns same job
- Module-level `_resetSpawnRateLimit()` exported for test isolation — rate limiter state persists across tests otherwise

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- OOM in test worker when using `vi.useFakeTimers({ shouldAdvanceTime: true })` — the infinite auto-advance created unlimited timer objects in the polling loops. Fixed by using real timers with a 1-second poll interval (via config mock) instead.
- Inter-test state leakage from module-level `lastSpawnTime` and `getConfig` mock — previous tests' rate limiter and config overrides persisted. Fixed with `_resetSpawnRateLimit()` and config mock reset in `beforeEach`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Runner is ready for integration with CLI commands (run/stop/build)
- Plan 06+ can wire `pilot run` and `pilot stop` commands to the Runner
- Pre-spawn checks are exported individually for direct testing if needed

---
*Phase: 17-pilot-v2-complete-rewrite*
*Completed: 2026-02-22*
