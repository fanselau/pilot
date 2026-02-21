---
phase: 06-queue-storage-migration
plan: 04
subsystem: queue, tui, testing
tags: [queue-store, queue-json, tui, ink, react, legacy-cleanup, smart-add]

# Dependency graph
requires:
  - phase: 06-02
    provides: runner migrated to queue-store CRUD
  - phase: 06-03
    provides: CLI commands migrated to queue-store
provides:
  - TUI dashboard reads from queue.json via queue-store
  - All tests updated for QueueJsonItem data shape
  - Legacy queue-parser.ts annotated as import-only
  - smart-add.ts migrated from parseQueueFile to queue-store
  - Complete queue storage migration (QUEUE.md only used by import command)
affects: [phase-07, phase-08, phase-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QueueJsonItem with id/status:'queued' replaces QueueEntry with lineNum/status:'pending' in all UI code"
    - "History counts (done/failed) fetched from getHistory() not from active items"

key-files:
  created: []
  modified:
    - src/tui/useStatusData.ts
    - src/tui/QueuePanel.tsx
    - src/tui/Dashboard.tsx
    - src/core/queue-parser.ts
    - src/core/lock.ts
    - src/core/smart-add.ts
    - test/tui/panels.test.tsx
    - test/tui/Dashboard.test.tsx
    - test/core/smart-add.test.ts
    - test/core/queue-parser.test.ts

key-decisions:
  - "TUI migration was already partially done in non-plan commits — committed remaining test/audit work"
  - "smart-add.ts migrated from parseQueueFile to getItems (was missed in 06-03)"
  - "markEntry in queue-parser.ts marked @deprecated — no runtime consumers"

patterns-established:
  - "Only import command reads QUEUE.md — all other code uses queue-store.ts"

# Metrics
duration: 7min
completed: 2026-02-21
---

# Phase 6 Plan 4: TUI + Tests + Legacy Cleanup Summary

**TUI dashboard migrated to queue.json, all 396 tests updated and passing, legacy queue-parser annotated as import-only, smart-add.ts migrated to queue-store**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-21T11:09:10Z
- **Completed:** 2026-02-21T11:16:29Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- TUI components (useStatusData, QueuePanel, Dashboard) read from queue-store with QueueJsonItem types
- All TUI tests updated: QueueJsonItem shape, queue-store mocks, status:'queued' instead of 'pending'
- smart-add.ts migrated from parseQueueFile/QUEUE.md to getItems/queue.json (was missed in 06-03)
- Legacy queue-parser.ts and lock.ts properly annotated as deprecated/import-only
- Full test suite (396 tests) passes with clean build

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate TUI components to use queue-store** — Already committed in prior non-plan commits `a6003cc` and `38cd6ef` (useStatusData.ts, QueuePanel.tsx, Dashboard.tsx)
2. **Task 2: Update tests + audit legacy code + verify full suite** — `06407ad` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/tui/useStatusData.ts` — Imports getItems/getHistory from queue-store, QueueJsonItem types
- `src/tui/QueuePanel.tsx` — QueueJsonItem with key={e.id}, status:'queued' filter
- `src/tui/Dashboard.tsx` — Done/failed counts from summary (history), status:'queued' filter
- `src/core/queue-parser.ts` — LEGACY MODULE annotation, markEntry @deprecated
- `src/core/lock.ts` — Updated deprecation notice (no runtime consumers)
- `src/core/smart-add.ts` — Migrated from parseQueueFile to getItems (queue-store)
- `test/tui/panels.test.tsx` — QueueJsonItem shape with id/status:'queued'
- `test/tui/Dashboard.test.tsx` — Mock queue-store instead of queue-parser
- `test/core/smart-add.test.ts` — Mock queue-store, QueueJsonItem shape, updated test config
- `test/core/queue-parser.test.ts` — Legacy comment added

## Decisions Made
- Task 1 TUI migration was already applied in non-plan commits (`a6003cc`, `38cd6ef`) — no duplicate commit needed
- smart-add.ts was missed in 06-03 migration — fixed as part of legacy audit (Rule 1 - Bug fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] smart-add.ts still reading QUEUE.md instead of queue.json**
- **Found during:** Task 2 (legacy code audit)
- **Issue:** `smart-add.ts` imported `parseQueueFile` from `queue-parser.js` and read the old QUEUE.md file. This means project state detection (isQueued, isRunning) checked the wrong data source.
- **Fix:** Replaced `parseQueueFile` import with `getItems` from `queue-store.js`. Updated status check from `'pending'` to `'queued'` and `entry.args` to `item.description`.
- **Files modified:** `src/core/smart-add.ts`, `test/core/smart-add.test.ts`
- **Verification:** All 30 smart-add tests pass, lint clean
- **Committed in:** `06407ad`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix — smart-add was checking stale QUEUE.md instead of active queue.json. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 6 (Queue Storage Migration) is fully complete
- All 4 plans executed: queue-store foundation, runner migration, CLI migration, TUI + test cleanup
- The only QUEUE.md consumer is `pilot import` (one-time migration tool)
- All 396 tests pass, clean lint, clean build
- Ready for remaining phases (8, 11, 13-15)

---
*Phase: 06-queue-storage-migration*
*Completed: 2026-02-21*
