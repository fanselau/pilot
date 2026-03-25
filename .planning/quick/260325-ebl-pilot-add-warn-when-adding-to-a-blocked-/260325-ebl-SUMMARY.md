---
phase: quick
plan: 260325-ebl
subsystem: cli
tags: [add-command, blocked-project, warning, ux]

# Dependency graph
requires:
  - phase: quick-044
    provides: project CLI commands with --block/--unblock
provides:
  - Blocked project warning in pilot add command
  - getLatestFailedJob DB helper
affects: [add-command, project-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-output warning pattern: check project state after job queued, warn before success line"

key-files:
  created: []
  modified:
    - src/commands/add.ts
    - src/core/db.ts
    - test/commands/add.test.ts

key-decisions:
  - "Warning placed after job is queued but before success output — ensures job is always persisted regardless of warning display"
  - "JSON mode includes blockedWarning as separate field rather than modifying job object — clean separation of concerns"

patterns-established:
  - "Blocked project warning pattern: check projectRecord.status after addJob, output warning before Queued line"

requirements-completed: [ABF-01, ABF-02, ABF-03, ABF-04, ABF-NH-01]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Quick 260325-ebl: Add Blocked Project Warning Summary

**Yellow blocked-project warning with reason, failed job ID, and unblock hint printed before Queued success line in `pilot add`**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T10:23:04Z
- **Completed:** 2026-03-25T10:27:31Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments
- `pilot add` now warns when target project is blocked, showing reason and unblock hint
- Job is always queued regardless of blocked status (non-blocking warning)
- Nice-to-have: warning includes failed job ID when available via new getLatestFailedJob helper
- JSON mode includes `blockedWarning` field with reason and failedJobId
- 7 new tests covering blocked/active/null/JSON/order/failed-job scenarios (62 total)

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1 RED: Failing tests for blocked project warning** - `00a0795` (test)
2. **Task 1 GREEN: Implement blocked warning in add command** - `6b933cb` (feat)

## Files Created/Modified
- `src/core/db.ts` - Added `getLatestFailedJob(project)` helper that queries most recent failed job for a project
- `src/commands/add.ts` - Added blocked project warning logic: imports getLatestFailedJob, checks projectRecord.status after job queued, prints yellow warning with reason/hint before Queued line, includes blockedWarning in JSON output
- `test/commands/add.test.ts` - Added `getLatestFailedJob` to db mock, 7 new tests in 'blocked project warning' describe block

## Decisions Made
- Warning placed after job is queued but before success output — ensures job is always persisted regardless of warning display
- JSON mode includes blockedWarning as separate field rather than modifying job object — clean separation of concerns
- getLatestFailedJob queries `ORDER BY completed_at DESC LIMIT 1` — most recent failed job is most relevant

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- Blocked project warning is complete and tested
- No blockers or concerns

---
*Quick task: 260325-ebl*
*Completed: 2026-03-25*
