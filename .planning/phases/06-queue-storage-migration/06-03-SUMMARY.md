---
phase: 06-queue-storage-migration
plan: 03
subsystem: queue
tags: [queue-store, queue-json, migration, import, backward-compat]

requires:
  - phase: 06-01
    provides: queue-store.ts CRUD operations, QueueJsonItem/QueueHistoryItem types, PilotConfig extensions
provides:
  - All CLI commands use queue-store.ts instead of QUEUE.md
  - New `pilot import` command for QUEUE.md → queue.json migration
  - New `pilot queue remove <id>` subcommand
  - New `pilot queue --history` flag for completed/failed items
  - Backward-compatible --json output (queued→pending, description→args, line_num=0)
affects: [06-04, runner, tui]

tech-stack:
  added: []
  patterns:
    - "Queue-store consumer pattern: import { getItems, addItem } from queue-store"
    - "Backward compat JSON mapping: status/args/line_num fields preserved"

key-files:
  created:
    - src/commands/import.ts
  modified:
    - src/commands/add.ts
    - src/commands/build.ts (indirectly via add.ts)
    - src/commands/scope.ts
    - src/commands/queue.ts
    - src/commands/status.ts
    - src/commands/config.ts
    - src/index.ts
    - test/commands/add.test.ts
    - test/commands/queue.test.ts
    - test/commands/status.test.ts

key-decisions:
  - "build.ts unchanged — delegates to addCommand which now uses queue-store"
  - "JSON backward compat: queued→pending, completed→done, description→args, line_num=0"
  - "import.ts uses local shortId function matching queue-store pattern"
  - "Queue command no longer shows done/failed inline — moved to --history"

patterns-established:
  - "Queue-store consumer: import from queue-store.ts, never from queue-parser.ts (except import.ts)"
  - "Backward compat mapping in JSON output for external consumers"

duration: 6min
completed: 2026-02-21
---

# Phase 6 Plan 3: CLI Command Queue-Store Migration Summary

**Migrated all CLI queue consumers from QUEUE.md to queue-store.ts with new import/remove/history features and backward-compatible JSON output**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T10:59:18Z
- **Completed:** 2026-02-21T11:06:14Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- All queue read/write commands (add, build, scope, queue, status) now use queue-store.ts
- New `pilot import [file]` command reads QUEUE.md and writes to queue.json
- New `pilot queue remove <id>` subcommand for removing queued items
- New `pilot queue --history` flag showing completed/failed from history
- Backward-compatible --json output (queued→pending, description→args, line_num=0)
- config command shows queue.json path and PILOT_DIR
- All 396 tests pass after test migrations

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate add, build, scope commands** - `659ab0d` (feat)
2. **Task 2: Migrate queue/status/config + import command + index.ts** - `12dd3ae` (feat)

## Files Created/Modified
- `src/commands/import.ts` - New import command: QUEUE.md → queue.json migration
- `src/commands/add.ts` - Replaced withQueueLock+QUEUE.md with addItem, returns ID
- `src/commands/scope.ts` - Replaced withQueueLock+QUEUE.md with addItem in --build path
- `src/commands/queue.ts` - Reads from queue-store, supports --history and remove subcommand
- `src/commands/status.ts` - Reads from queue-store with backward-compat mapping
- `src/commands/config.ts` - Shows PILOT_DIR and queue.json path
- `src/index.ts` - Registered import command, queue remove subcommand, --history flag
- `test/commands/add.test.ts` - Updated to mock queue-store instead of lock/queue-parser
- `test/commands/queue.test.ts` - Updated to mock queue-store, test --history and remove
- `test/commands/status.test.ts` - Updated to mock queue-store instead of queue-parser

## Decisions Made
- build.ts left unchanged — it delegates to addCommand which now uses queue-store
- JSON backward compat maps: queued→pending, completed→done, description→args, line_num=0
- import.ts uses local shortId() function matching queue-store's pattern (avoids exposing internal)
- Queue command no longer shows done/failed inline — they live in --history now

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated all test files to mock queue-store instead of legacy modules**
- **Found during:** Task 2 verification
- **Issue:** Tests mocked queue-parser.js and lock.js but commands now use queue-store.js, causing ENOENT errors
- **Fix:** Rewrote test mocks for add.test.ts, queue.test.ts, status.test.ts to mock queue-store.js
- **Files modified:** test/commands/add.test.ts, test/commands/queue.test.ts, test/commands/status.test.ts
- **Verification:** All 396 tests pass
- **Committed in:** 12dd3ae (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test updates were essential for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All CLI commands migrated to queue-store
- Plan 06-04 (cleanup/remove legacy code) can proceed
- lock.ts `withQueueLock` is now completely unused by commands (only import.ts uses queue-parser)

---
*Phase: 06-queue-storage-migration*
*Completed: 2026-02-21*
