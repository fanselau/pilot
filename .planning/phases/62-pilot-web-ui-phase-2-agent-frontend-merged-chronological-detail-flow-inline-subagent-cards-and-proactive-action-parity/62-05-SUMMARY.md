---
phase: 62-pilot-web-ui-phase-2
plan: 05
subsystem: testing
tags: [vitest, timeline-query, action-model, unit-tests, availability-predicates]

# Dependency graph
requires:
  - phase: 62-01
    provides: getJobTimeline merged chronological timeline query with cursor pagination
  - phase: 62-02
    provides: Centralized action model with resolveActions and 7 action definitions
provides:
  - 15 tests for getJobTimeline covering ordering, fork placement, pagination, type discrimination, mutations
  - 26 tests for resolveActions covering all 7 action availability predicates across job states
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [timeline-query-testing, action-predicate-testing, cross-workspace-test-mocking]

key-files:
  created:
    - test/web/actions.test.ts
  modified:
    - test/core/job-detail-query.test.ts

key-decisions:
  - "Actions test placed in test/web/ under root vitest config rather than web/ since web has no vitest"
  - "Server-fns mock uses vi.mock('~/lib/server-fns') matching the exact import specifier in actions.ts"
  - "Timeline tests verify chronological ordering across multiple sessions via timestamp array assertions"

patterns-established:
  - "Cross-workspace testing: test/web/ tests import from web/src/ with mocked server-fn dependencies"
  - "Discriminated union testing: type discrimination validated via kind field + conditional narrowing"

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 62 Plan 05: Timeline Query and Action Model Tests Summary

**41 new tests covering merged timeline chronological ordering, fork-card placement, cursor pagination, and all 7 action availability predicates across job states**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T15:56:20Z
- **Completed:** 2026-03-13T16:00:44Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- 15 new getJobTimeline tests: cross-session chronological ordering, fork-card timestamp positioning, item type discrimination (text/reasoning→activity, tool/patch→tool-summary, child→fork-card), cursor pagination with limit/hasMore, empty job, completion card emission, stable sort on equal timestamps, mutation wrapper delegation
- 26 new resolveActions tests: retry enabled only for failed, cancel enabled for running/pending, force-quit enabled only for running, unblock enabled with project context (explicit path or job.project fallback), view-detail needs job, back-to-dashboard/refresh always enabled, full integration test, no-job-context test, ResolvedAction shape validation
- Total test count increased from 968 to 1009 (all passing, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tests for getJobTimeline and action model** - `c5bb426` (test)

## Files Created/Modified
- `test/core/job-detail-query.test.ts` - Extended with 15 new tests for getJobTimeline (ordering, fork placement, type discrimination, pagination, empty state, completion cards, mutations) plus mock additions for db.retry/cancel/forceQuitJob/unblockProject
- `test/web/actions.test.ts` - New file with 26 tests for resolveActions covering all 7 action definitions, availability predicates for every job state, navigation always-available, and integration scenarios

## Decisions Made
- Placed actions tests in `test/web/actions.test.ts` under root vitest config since web/ has no test runner — cross-workspace import with `vi.mock('~/lib/server-fns')` matching exact specifier
- Used timestamp array assertions (`expect(timestamps).toEqual([1000, 2000, 3000, 4000])`) for chronological ordering verification — more readable than pairwise comparisons
- Added db mutation mocks (retry, cancel, forceQuitJob, unblockProject) to existing mock factory for mutation wrapper tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file locations adapted to project structure**
- **Found during:** Task 1
- **Issue:** Plan specified `src/core/job-detail-query.test.ts` and `web/src/lib/actions.test.ts` but project has tests in `test/` directory and web has no vitest config
- **Fix:** Used `test/core/job-detail-query.test.ts` (existing) and created `test/web/actions.test.ts` (under root vitest)
- **Files modified:** test/core/job-detail-query.test.ts, test/web/actions.test.ts
- **Verification:** All 1009 tests pass

---

**Total deviations:** 1 auto-fixed (1 blocking — test location)
**Impact on plan:** Minimal — same tests, different file paths matching project conventions.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 62 complete — all 5 plans executed
- Timeline query, action model, timeline UI, table overview, and tests all shipped
- Ready for phase transition

---
*Phase: 62-pilot-web-ui-phase-2*
*Completed: 2026-03-13*
