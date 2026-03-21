---
phase: 84-pilot-control-flow-live-status-bugs
plan: 03
subsystem: testing
tags: [vitest, react-query, route-contracts, refetchInterval]

# Dependency graph
requires:
  - phase: 84-pilot-control-flow-live-status-bugs
    provides: 84-01 live-status fix (refetchInterval callback form, snapshot-derived isActive)
provides:
  - Updated route contract tests with live-status regression assertions
  - Passing test suite for web route topology
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
  - "Route contract tests: read source files and assert on string patterns for regression coverage"

key-files:
  created: []
  modified:
  - test/web/job-routes.test.ts

key-decisions:
  - "Kept not.toContain('<JobDetail snapshot={snapshot} />') on layout route — valid regression assertion, already present before this plan"
  - "Updated child-route assertions to match actual file content: Dashboard→Back to Job, Nested child session→Sub-Agent Session"

patterns-established: []

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 84 Plan 03: Route Contract Tests for Live-Status Fix Summary

**Updated job-routes contract tests to assert reactive refetchInterval callback form and snapshot-derived isActive, replacing stale JobDetail and child-route expectations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T14:01:00Z
- **Completed:** 2026-03-21T14:02:24Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced stale `<JobDetail snapshot={snapshot} />` positive assertion with `<SplitPaneDetail` in first test
- Added regression assertions verifying `refetchInterval: (query)` callback form is present in both layout and index routes
- Added regression assertions verifying stale `loaderData?.job.status === 'running'` and `layoutLoaderData?.job.status === 'running'` patterns are absent
- Fixed child-route test assertions to match actual file content ("Back to Job" and "Sub-Agent Session")
- All 3 tests now pass: route structure, route tree alignment, and child-page breadcrumb context

## Task Commits

Each task was committed atomically:

1. **Task 1: Update web route contract tests for live-status fix** - `ea0040c` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `test/web/job-routes.test.ts` — Fixed stale expectations + added live-status regression assertions

## Decisions Made
- Kept `not.toContain('<JobDetail snapshot={snapshot} />')` on the layout route assertion — it was already in the original test (line 17) and serves as a valid regression test asserting the layout doesn't directly render the old component
- Updated child route breadcrumb assertions from "Dashboard"→"Back to Job" and "Nested child session"→"Sub-Agent Session" based on actual source file content

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 route contract tests pass
- Live-status regression assertions in place for both layout and index routes
- Ready for any remaining plan in phase 84

---
*Phase: 84-pilot-control-flow-live-status-bugs*
*Completed: 2026-03-21*
