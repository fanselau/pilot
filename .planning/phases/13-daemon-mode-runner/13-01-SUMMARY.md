---
phase: 13-daemon-mode-runner
plan: 01
subsystem: queue-store
tags: [queue-store, types, config, blocked-status, completedIds, atomic-lock, dependency-cascade]

# Dependency graph
requires:
  - phase: 06-queue-storage-migration
    provides: queue-store.ts CRUD with proper-lockfile, QueueJsonFile types
provides:
  - blocked queue status for dependency failure cascading
  - completedIds for history-safe dependency resolution
  - findLaunchableAtomic for TOCTOU-safe item launching
  - cascadeFailure for transitive dependent blocking
  - pollInterval and defaultTimeout config env vars
affects: [13-02 runner daemon mode, 13-03 command layer, 13-04 tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic read+mark in single lock, completedIds as never-pruned dep resolution source]

key-files:
  created: []
  modified: [src/core/types.ts, src/core/config.ts, src/core/queue-store.ts, src/core/queue-parser.ts, src/commands/run.ts, test/core/queue-parser.test.ts, test/core/queue-store.test.ts]

key-decisions:
  - "completedIds never pruned — unlike history which caps at 100, this array is the source of truth for dep resolution"
  - "findLaunchableAtomic holds lock during read+mark — prevents TOCTOU where two runners launch same item"
  - "Old findLaunchable kept as deprecated — existing runner.ts still imports it, migration in Plan 02"
  - "QueueEntry moved to queue-parser.ts as local type — it's legacy QUEUE.md vocabulary, not runtime contract"
  - "QueueItem kept in types.ts with blocked added — it's the JSON contract vocabulary (pending/done vs queued/completed)"

patterns-established:
  - "Atomic lock pattern: read + modify + save within single withQueueJsonLock call"
  - "BFS traversal for transitive dependency cascade"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 13 Plan 01: Queue-store Hardening Summary

**Added blocked status, completedIds for history-safe deps, atomic findLaunchable, and dependency failure cascading to queue-store**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T12:19:57Z
- **Completed:** 2026-02-21T12:25:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `blocked` to QueueJsonItem and QueueItem status unions, `completedIds` to QueueJsonFile, `pollInterval` to RunnerOptions and PilotConfig
- Hardened queue-store with `findLaunchableAtomic` (TOCTOU-safe), `markBlocked`, `cascadeFailure` (transitive BFS), and `completedIds`-based dep resolution
- Moved legacy `QueueEntry` from types.ts to queue-parser.ts, keeping `QueueItem` as JSON contract type
- Added PILOT_POLL_INTERVAL and PILOT_DEFAULT_TIMEOUT env var resolution in config.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Update types.ts and config.ts with daemon mode foundations** - `0fb69a5` (feat)
2. **Task 2: Harden queue-store with completedIds, atomic findLaunchable, blocked status, and dep failure cascading** - `6b69c7b` (feat)
3. **Fix: Test PilotConfig mocks missing new fields** - `09f8b6a` (fix)

## Files Created/Modified
- `src/core/types.ts` - Added blocked status, completedIds, pollInterval, defaultTimeout; moved QueueEntry out
- `src/core/config.ts` - Added PILOT_POLL_INTERVAL and PILOT_DEFAULT_TIMEOUT env var resolution
- `src/core/queue-store.ts` - Added findLaunchableAtomic, markBlocked, cascadeFailure; completedIds backward compat
- `src/core/queue-parser.ts` - QueueEntry moved here as local exported type
- `src/commands/run.ts` - Pass pollInterval from config to RunnerOptions
- `test/core/queue-parser.test.ts` - Updated QueueEntry import to queue-parser.ts
- `test/core/queue-store.test.ts` - Added completedIds to explicit saveQueue calls

## Decisions Made
- completedIds never pruned — unlike history which caps at 100, this array is the source of truth for dep resolution
- findLaunchableAtomic holds lock during read+mark — prevents TOCTOU where two runners launch same item
- Old findLaunchable kept as deprecated — existing runner.ts still imports it, migration in Plan 02
- QueueEntry moved to queue-parser.ts as local type — it's legacy QUEUE.md vocabulary, not runtime contract
- QueueItem kept in types.ts with blocked added — it's the JSON contract vocabulary (pending/done vs queued/completed)
- pollInterval minimum clamped to 1 second with NaN fallback to 3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed run.ts RunnerOptions missing pollInterval**
- **Found during:** Task 1 (updating RunnerOptions type)
- **Issue:** Adding pollInterval to RunnerOptions type broke run.ts which constructs RunnerOptions without it
- **Fix:** Added `pollInterval: config.pollInterval` to the RunnerOptions construction in run.ts
- **Files modified:** src/commands/run.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 0fb69a5 (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed test saveQueue calls missing completedIds**
- **Found during:** Task 1 (adding completedIds to QueueJsonFile)
- **Issue:** Three saveQueue calls in tests used old shape without completedIds
- **Fix:** Added `completedIds: []` to all explicit saveQueue calls in test files
- **Files modified:** test/core/queue-store.test.ts
- **Verification:** All 483 tests pass
- **Committed in:** 0fb69a5 (Task 1 commit)

**3. [Rule 3 - Blocking] Fixed test PilotConfig mocks missing pollInterval and defaultTimeout**
- **Found during:** Task 2 (LSP flagged after queue-store changes)
- **Issue:** Three test files construct PilotConfig objects without the new required fields
- **Fix:** Added `pollInterval: 3, defaultTimeout: 60` to makeConfig/testConfig in cleanup, doctor, smart-add tests
- **Files modified:** test/core/cleanup.test.ts, test/core/doctor.test.ts, test/core/smart-add.test.ts
- **Verification:** All 483 tests pass, tsc --noEmit clean
- **Committed in:** 09f8b6a (fix commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All were direct consequences of type changes — required for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types foundation ready for daemon mode runner (Plan 02) and command layer (Plan 03)
- All review audit items addressed: completedIds, atomic findLaunchable, dep cascading, blocked status
- Backward compat maintained: old queue.json files load correctly with missing completedIds
- Zero type errors, all 483 tests pass

---
*Phase: 13-daemon-mode-runner*
*Completed: 2026-02-21*
