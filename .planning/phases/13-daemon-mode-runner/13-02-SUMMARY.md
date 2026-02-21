---
phase: 13-daemon-mode-runner
plan: 02
subsystem: runner
tags: [daemon, signal-handling, queue-runner, process-management, timeout]

# Dependency graph
requires:
  - phase: 13-01
    provides: findLaunchableAtomic, cascadeFailure, pollInterval/defaultTimeout config
provides:
  - Daemon mode watch loop (persistent runner)
  - SIGINT handler for Ctrl+C graceful shutdown
  - Centralized timeout checking (checkTimeouts)
  - Per-item maxAttempts retry logic
  - Dependency failure cascading from runner
  - idle event for monitoring
affects: [13-03, 13-04, run-command, stop-command, tui-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized checkTimeouts() replaces individual setTimeout per job"
    - "Daemon watch loop with pollInterval sleep between scans"
    - "Graceful shutdown waits for active jobs (no kill)"
    - "PID file key pilot-runner for gsd-pilot-runner-pid"

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - src/commands/run.ts
    - src/commands/stop.ts
    - src/commands/status.ts
    - src/commands/build.ts
    - src/commands/scope.ts
    - src/tui/useStatusData.ts
    - test/core/runner.test.ts

key-decisions:
  - "Task 2 work merged into Task 1 — cascadeFailure and per-item attempts tightly coupled with runner refactor"
  - "PID file key change from queue to pilot-runner requires updating all consumers (stop, status, build, scope, TUI)"
  - "Graceful shutdown removes all kill logic — pilot stop --force handles external force-kill"

patterns-established:
  - "Daemon mode is default; --once for batch/CI"
  - "findLaunchableAtomic for all queue scanning (atomic read+mark)"
  - "checkTimeouts centralized, timeout=0 disables"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 13 Plan 02: Daemon Mode Runner Summary

**Persistent daemon runner with SIGINT handling, centralized timeouts, per-item retry config, and dependency failure cascading**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T12:30:57Z
- **Completed:** 2026-02-21T12:37:53Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Runner stays alive in daemon mode, polling every pollInterval seconds for new queue entries
- SIGINT (Ctrl+C) triggers same graceful shutdown as SIGTERM — active jobs finish naturally
- Centralized checkTimeouts() replaces per-job setTimeout; timeout=0 disables timeout
- Per-item maxAttempts used for retry decisions instead of global maxRetries
- cascadeFailure called on permanent job failures to block transitive dependents
- PID file key changed to pilot-runner; all consumers updated
- idle event emitted every 5 minutes when daemon is watching

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor runner for daemon mode watch loop and signal handling** - `53b47c3` (feat)
2. **Task 2: Wire cascadeFailure and update job completion** — included in Task 1 commit (changes tightly coupled)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/core/runner.ts` — Daemon mode mainLoop, SIGINT handler, checkTimeouts, findLaunchableAtomic, cascadeFailure, idle event
- `src/commands/run.ts` — Added idle event handler for daemon mode logging
- `src/commands/stop.ts` — Updated PID file key from queue to pilot-runner
- `src/commands/status.ts` — Updated PID file key from queue to pilot-runner
- `src/commands/build.ts` — Updated PID file key from queue to pilot-runner
- `src/commands/scope.ts` — Updated PID file key from queue to pilot-runner
- `src/tui/useStatusData.ts` — Updated PID file key from queue to pilot-runner
- `test/core/runner.test.ts` — Updated mocks for findLaunchableAtomic, added pollInterval to options

## Decisions Made
- Task 2 work merged into Task 1 — cascadeFailure wiring and per-item attempts logic were tightly interleaved with the overall runner refactor and couldn't be separated into a standalone commit
- PID file key change from 'queue' to 'pilot-runner' required updating 5 consumer files (stop, status, build, scope, TUI) — Rule 3 blocking fix applied automatically
- Graceful shutdown completely removes kill logic for active jobs — force-killing is delegated to `pilot stop --force` externally

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated all PID file consumers for pilot-runner key**
- **Found during:** Task 1 (PID file key change)
- **Issue:** Changing PID key from 'queue' to 'pilot-runner' in runner.ts would break stop.ts, status.ts, build.ts, scope.ts, and useStatusData.ts which all reference readPidFile('queue')
- **Fix:** Updated all 5 consumer files to use 'pilot-runner' instead of 'queue'
- **Files modified:** src/commands/stop.ts, src/commands/status.ts, src/commands/build.ts, src/commands/scope.ts, src/tui/useStatusData.ts
- **Verification:** npx tsc --noEmit passes, all tests pass
- **Committed in:** 53b47c3 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for correctness — PID file key change was a cross-cutting concern that had to be applied atomically.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Runner daemon mode fully operational
- Ready for Plan 03 (run.ts command integration) and Plan 04 (tests)
- No blockers

---
*Phase: 13-daemon-mode-runner*
*Completed: 2026-02-21*
