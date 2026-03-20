---
phase: quick
plan: 260320-vc3
subsystem: cli
tags: [add, bump, priority, queue]

provides:
  - "--next flag on pilot add calls bump() to insert job at front of queue"
affects: [add-command, queue-priority]

tech-stack:
  added: []
  patterns: [reuse existing bump() mechanism for --next flag]

key-files:
  created: []
  modified:
    - src/commands/add.ts
    - test/commands/add.test.ts

key-decisions:
  - "Reuse bump() after addJob rather than passing priority to addJob — minimal change, proven mechanism"

requirements-completed: []

duration: 3min
completed: 2026-03-20
---

# Quick Task 260320-vc3: Fix --next Flag on pilot add Summary

**Wire --next flag to bump(job.id) after addJob so jobs are inserted at front of queue with human output indicator**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T22:36:29Z
- **Completed:** 2026-03-20T22:39:51Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 2

## Accomplishments
- `pilot add <project> <requirement> --next` now calls `bump(job.id)` after creation, setting priority to MAX(priority) + 1
- `pilot add` without `--next` retains default priority 0 behavior (unchanged)
- Human output shows `↑ Bumped to front of queue` indicator when `--next` is used
- 3 new tests covering both code paths and human output

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** Add failing tests for --next flag — `eddb8ff` (test)
2. **Task 1 (GREEN):** Wire --next flag to bump() in addCommand — `1a3d6bc` (fix)

## Files Created/Modified
- `src/commands/add.ts` — Added `bump` import, bump(job.id) call after addJob when opts.next, "front of queue" output indicator
- `test/commands/add.test.ts` — Added `bump` to mock, 3 new tests for --next flag behavior

## Decisions Made
- Reuse existing `bump()` function rather than modifying `addJob()` to accept a priority parameter — minimal change, reuses proven mechanism from `pilot bump` command

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Bug fix is complete and self-contained
- Pre-existing failure in `test/web/job-routes.test.ts` is unrelated (web UI route test)

---
*Quick Task: 260320-vc3*
*Completed: 2026-03-20*
