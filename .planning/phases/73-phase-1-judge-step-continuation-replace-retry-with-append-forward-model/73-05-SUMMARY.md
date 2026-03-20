---
phase: 73-phase-1-judge-step-continuation
plan: 05
subsystem: api
tags: [step-source, notifications, job-detail, observability]

# Dependency graph
requires:
  - phase: 73-01
    provides: "JobStep with source/reason fields in DB schema and types"
  - phase: 73-02
    provides: "Step execution loop and step record management"
provides:
  - "Step source/reason/error in JobStepSummary and StepTimelineGroup DTOs"
  - "Step history with source badges in job completion notifications"
affects: [web-ui, tui, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source badge rendering: show [source] tag only for non-delegation steps"
    - "Status icons in step history: ✓/✗/○/⊘/◆ for completed/failed/pending/skipped/running"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - src/core/callback.ts
    - test/core/callback.test.ts

key-decisions:
  - "Default source to 'delegation' when step.source is nullish for backward compatibility"
  - "Unattributed timeline group gets source 'delegation' as safe default"
  - "Step history in notifications uses truncated args (40 chars) and errors (80 chars) to keep messages compact"

patterns-established:
  - "Source badge pattern: only show [source] when source !== 'delegation' to avoid noise"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 73 Plan 05: Job Detail & Notification Step Visibility Summary

**Step source/reason/error fields in DTOs and step history with source badges in completion notifications**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T13:51:11Z
- **Completed:** 2026-03-20T13:56:12Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added source, reason, and error fields to JobStepSummary DTO for operator visibility
- Added source field to StepTimelineGroup for timeline rendering
- Added step history section to job completion notifications with status icons and source badges
- Updated callback test mock to support new getJobSteps import

## Task Commits

Each task was committed atomically:

1. **Task 1: Add step source and reason to JobStepSummary and detail rendering** - `bc63686` (feat)
2. **Task 2: Include step history in job completion notifications** - `6392f1b` (feat)

## Files Created/Modified
- `src/core/types.ts` - Added source, reason, error to JobStepSummary; added source to StepTimelineGroup
- `src/core/job-detail-query.ts` - Populated new fields in getJobDetail() and getJobTimeline()
- `src/core/callback.ts` - Added getJobSteps import and step history section in notifications
- `test/core/callback.test.ts` - Updated db mock to include getJobSteps

## Decisions Made
- Default source to 'delegation' when step.source is nullish — backward compatibility with pre-step-source data
- Unattributed timeline group defaults to 'delegation' source — safe default for items that can't be attributed to a step
- Step history uses truncated args (40 chars) and errors (80 chars) — keeps notification messages compact

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated callback test mock for getJobSteps**
- **Found during:** Task 2 (notification step history)
- **Issue:** callback.test.ts mocked only `getProject` from db.js; adding `getJobSteps` import caused all 12 tests to fail
- **Fix:** Added `getJobSteps: vi.fn(() => [])` to the db.js mock
- **Files modified:** test/core/callback.test.ts
- **Verification:** All 17 callback tests pass
- **Committed in:** 6392f1b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for test compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Step source/reason/error visible in all job detail DTOs
- Notifications include step timeline for operator understanding
- Ready for Plan 06 (if exists) or phase completion

---
*Phase: 73-phase-1-judge-step-continuation*
*Completed: 2026-03-20*

## Self-Check: PASSED
