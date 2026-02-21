---
phase: 06-queue-storage-migration
plan: 01
subsystem: database
tags: [nanoid, json, proper-lockfile, queue, storage]

# Dependency graph
requires:
  - phase: 01-project-scaffolding
    provides: types.ts, config.ts, proper-lockfile dependency
provides:
  - QueueJsonFile/QueueJsonItem/QueueHistoryItem type interfaces
  - queue-store.ts CRUD module with file locking
  - PilotConfig.pilotDir and queueJsonFile fields
  - nanoid dependency for ID generation
affects: [06-02 runner migration, 06-03 command migration, 06-04 TUI migration]

# Tech tracking
tech-stack:
  added: [nanoid ^5.0.0]
  patterns: [JSON file storage with proper-lockfile, items/history split, nanoid 12-char IDs]

key-files:
  created: [src/core/queue-store.ts, test/core/queue-store.test.ts]
  modified: [package.json, src/core/types.ts, src/core/config.ts]

key-decisions:
  - "nanoid(12) for IDs — short enough to type, unique enough for <100 items"
  - "detectCircularDep exported for direct testing — addItem creates new IDs so cycles via public API are impossible, but guards against data corruption"
  - "History capped at 100 entries by newest completedAt"
  - "Lock on queue.json file directly, create empty file if needed before locking"

patterns-established:
  - "Queue JSON CRUD: all mutations go through withQueueJsonLock -> load -> mutate -> save"
  - "Items/history split: active items in items array, completed/failed move to history with duration"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 6 Plan 1: Queue JSON Storage Foundation Summary

**JSON queue CRUD module with nanoid IDs, proper-lockfile, circular dependency detection, and 47-test suite**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T10:41:12Z
- **Completed:** 2026-02-21T10:47:23Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created queue-store.ts (399 lines) with full CRUD: add, remove, markRunning/Completed/Failed/Queued, findLaunchable, getHistory/Items/ItemById
- Added QueueJsonFile, QueueJsonItem, QueueHistoryItem interfaces to types.ts
- Extended PilotConfig with pilotDir (~/.pilot/) and queueJsonFile fields
- 47 comprehensive tests covering all operations, edge cases, and circular dep detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Add nanoid dependency and define new queue JSON types** - `2fe1192` (feat)
2. **Task 2: Create queue-store.ts with full CRUD and file locking** - `e6def28` (feat)
3. **Task 3: Write comprehensive tests for queue-store** - `3d98711` (test)

## Files Created/Modified
- `src/core/queue-store.ts` - JSON queue CRUD operations with file locking (399 lines)
- `src/core/types.ts` - Added QueueJsonItem, QueueHistoryItem, QueueJsonFile interfaces + PilotConfig fields
- `src/core/config.ts` - Added pilotDir and queueJsonFile resolution
- `package.json` - Added nanoid ^5.0.0 dependency
- `test/core/queue-store.test.ts` - 47 tests across 11 suites (612 lines)

## Decisions Made
- nanoid(12) for IDs — short enough to type, unique enough for <100 items
- detectCircularDep exported for direct testing since addItem always generates new IDs that can't exist in existing chains
- History capped at 100 entries sorted by newest completedAt
- Lock on queue.json file directly; create empty file first if it doesn't exist (proper-lockfile requires existing target)
- Existing QueueEntry/QueueItem types kept untouched for backward compatibility during migration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- queue-store.ts ready for runner migration (06-02-PLAN.md)
- All existing tests pass (348 + 47 new = 395 total)
- No blockers

---
*Phase: 06-queue-storage-migration*
*Completed: 2026-02-21*
