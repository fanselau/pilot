---
phase: 06-queue-storage-migration
plan: 02
subsystem: queue-runner
tags: [queue-store, runner, state-machine, json-storage, migration]

# Dependency graph
requires:
  - phase: 06-01
    provides: "queue-store.ts with CRUD operations (findLaunchable, markRunning, markCompleted, markFailed, markQueued)"
provides:
  - "Runner state machine reads from queue.json instead of QUEUE.md"
  - "Jobs tracked by QueueJsonItem nanoid instead of line numbers"
  - "All queue mutations via queue-store CRUD functions"
affects: [06-03, 06-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Queue item ID-based tracking instead of line number tracking"
    - "queue-store handles its own locking (no external withQueueLock needed)"

key-files:
  created: []
  modified:
    - "src/core/runner.ts"
    - "src/core/types.ts"
    - "src/core/lock.ts"
    - "src/commands/run.ts"
    - "test/core/runner.test.ts"

key-decisions:
  - "Timeout stored in item.meta.timeout (number) instead of entry.timeout"
  - "Description field holds run-command args (replaces entry.args)"
  - "lock.ts kept with deprecation notice for add.ts and scope.ts consumers"

patterns-established:
  - "QueueJsonItem as the canonical queue item type for runner operations"
  - "queue-store functions handle locking internally — no withQueueLock wrapper needed"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 6 Plan 2: Runner Queue Store Migration Summary

**Runner state machine migrated from QUEUE.md parsing to queue-store.ts JSON CRUD — scan/launch/reap/completion/shutdown all use item IDs**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T10:50:18Z
- **Completed:** 2026-02-21T10:56:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Runner scan() uses findLaunchable() from queue-store instead of parsing QUEUE.md
- Runner launch() uses markRunning(item.id) instead of withQueueLock + markEntry(lineNum, 'running')
- Runner handleJobCompletion() uses markCompleted/markFailed/markQueued instead of withQueueLock + markEntry
- Runner shutdown() marks items back to queued via markQueued(item.id)
- RunnerJob.entry replaced with RunnerJob.item (QueueJsonItem type)
- Runner tests rewritten to mock queue-store instead of queue-parser + lock
- lock.ts deprecated with clear notice for remaining consumers

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate runner.ts scan/launch to use queue-store** - `1116a73` (feat)
2. **Task 2: Migrate runner.ts reap/completion/shutdown + deprecate lock.ts** - `16cb05e` (feat)

## Files Created/Modified
- `src/core/runner.ts` - Queue runner state machine, now uses queue-store.ts CRUD
- `src/core/types.ts` - RunnerJob.entry → RunnerJob.item (QueueJsonItem)
- `src/commands/run.ts` - Event listeners updated for QueueJsonItem type
- `src/core/lock.ts` - Added deprecation notice
- `test/core/runner.test.ts` - Rewritten to mock queue-store instead of queue-parser/lock

## Decisions Made
- Timeout stored in `item.meta['timeout']` (number) since QueueJsonItem doesn't have a dedicated timeout field — timeout was a QueueEntry-specific field from QUEUE.md metadata
- `item.description` used for run-command args (replaces `entry.args`) — consistent with queue-store's addItem API
- lock.ts kept as-is with deprecation comment, since add.ts and scope.ts still import withQueueLock (will be migrated in Plan 03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Runner fully migrated to queue-store
- Ready for Plan 03: migrate remaining consumers (add.ts, build.ts, scope.ts, status.ts, queue.ts, smart-add.ts, TUI)
- lock.ts can be removed once Plan 03 completes

---
*Phase: 06-queue-storage-migration*
*Completed: 2026-02-21*
