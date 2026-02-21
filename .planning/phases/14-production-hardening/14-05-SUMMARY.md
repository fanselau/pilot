---
phase: 14-production-hardening
plan: 05
type: execute
completed: 2026-02-21
duration: ~7 minutes
subsystem: testing
tags: [tests, vitest, production-hardening, atomic-writes, corruption-recovery, resource-guards, stuck-detection, flaky-detection, structured-logging]
dependency_graph:
  requires: ["14-01", "14-02", "14-03", "14-04"]
  provides: ["test coverage for all production hardening features"]
  affects: ["15-e2e-tests"]
tech_stack:
  patterns: [vi.mock, temp dirs, module-level mock state, fake timers]
key_files:
  created:
    - test/core/spawn.test.ts
    - test/core/lock.test.ts
  modified:
    - test/core/queue-store.test.ts
    - test/core/config.test.ts
    - test/core/runner.test.ts
    - test/core/stuck.test.ts
decisions:
  - "statSync added to node:fs mock in runner.test.ts for flaky detection testing"
  - "Fake timers used for spawn rate limiter test to avoid 5-second real delays"
  - "computeDaemonStuckScore tested with real process.pid (always alive) for healthy path"
metrics:
  tests_added: 29
  total_tests: 553
  files_touched: 6
---

# Phase 14 Plan 05: Production Hardening Tests Summary

Comprehensive test coverage for all production hardening changes from Plans 01-04: atomic writes, corruption recovery, resource guards, daemon stuck detection, flaky detection, structured logging.

## Completed Tasks

### Task 1: Queue-store, lock, and config tests
**Commit:** 0fbad90

Extended test/core/queue-store.test.ts:
- **Atomic write backup**: Verified .bak file created on queue mutation containing pre-mutation state
- **Corruption recovery — truncated JSON**: Truncated main file → loadQueue falls back to .bak
- **Corruption recovery — garbage JSON**: Unparseable main file → loadQueue recovers from .bak
- **Corruption recovery — both corrupt**: Both files garbage → returns empty queue `{ version: 1, items: [], history: [], completedIds: [] }`

Created test/core/lock.test.ts:
- **cleanStaleLocks — stale removed**: Lock file backdated >5min is deleted
- **cleanStaleLocks — fresh preserved**: Current-mtime lock file is not deleted
- **cleanStaleLocks — no lock file**: Handles missing lock gracefully

Extended test/core/config.test.ts:
- **maxParallel auto-detection**: 16GB → 2, 64GB → 5 (via os.totalmem mock)
- **PILOT_MAX_PARALLEL override**: Env var overrides auto-detection
- **logLevel validation**: DEBUG/INFO/WARN/ERROR accepted, invalid → INFO default
- **logLevel case-insensitive**: 'debug' → 'DEBUG'

### Task 2: Spawn, stuck, runner, and runner-log tests
**Commit:** 2818e96

Created test/core/spawn.test.ts:
- **getSystemFreeMem**: Returns MB from /proc/meminfo, null when unreadable or missing MemAvailable
- **checkDiskSpace**: Throws "Disk space too low" when <1GB, resolves when >1GB, skips with warning on statfs error
- **enforceSpawnRateLimit**: Enforces 5-second minimum interval between spawns (fake timer verification)

Extended test/core/stuck.test.ts:
- **computeDaemonStuckScore — healthy**: Recent log activity → healthy verdict, score < 40
- **computeDaemonStuckScore — no output**: Empty log file + 10min runtime → no_output signal (40 points)
- **computeDaemonStuckScore — dead process**: Non-existent PID → handles gracefully, no crash
- **computeDaemonStuckScore — shape**: Returns correct DaemonStuckAssessment structure

Extended test/core/runner.test.ts:
- **Flaky detection — quick fail retried**: Exit code !=0, duration <5min, log <4KB → retried via markQueued, "flaky" logged
- **Flaky detection — 3 strikes**: attempts >= maxAttempts with flaky signals → markFailed + cascadeFailure
- **Heartbeat written**: writeFileSync called with heartbeat path containing ISO timestamp on startup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] statSync not mocked in runner.test.ts**
- **Found during:** Task 2 (flaky detection test)
- **Issue:** runner.ts uses `statSync` from `node:fs` for log file size in flaky detection, but the `node:fs` mock only covered `writeFileSync` and `statfsSync`
- **Fix:** Added `statSync` to the `vi.mock('node:fs')` block with default return value `{ size: 0, mtimeMs: Date.now() }`
- **Files modified:** test/core/runner.test.ts

**2. [Rule 1 - Bug] Rate limiter test timeout with real timers**
- **Found during:** Task 2 (spawn rate limiter test)
- **Issue:** First test approach used real `setTimeout` for 5-second delay, causing 10s test timeout. Module-level `lastSpawnTime` state carried over between test calls.
- **Fix:** Used `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` to verify rate limiting without real delays
- **Files modified:** test/core/spawn.test.ts

## Verification

- `npm test` — 553 tests pass across 31 test files (29 new tests added)
- `npm run build` — no type errors
- All corruption recovery fallback paths tested (truncated, bak fallback, both corrupt)
- Resource guards tested at threshold boundaries (2GB memory, 1GB disk)
- Stuck detection daemon scorer tested (healthy, no-output, dead process)
- Flaky detection tested (retry + 3-strike permanent failure)
- Structured logging coverage already comprehensive from Plan 03 tests

## Next Phase Readiness

Phase 14 is now complete (5/5 plans). All production hardening features have test coverage. Ready for Phase 15 (E2E test suite).
