---
phase: 79-web-ui-job-activity-regression-restore-visible-activity-under-jobs
plan: 01
subsystem: ui
tags: [tanstack-start, ssr, timeline, job-detail, dashboard, activity-preview]

# Dependency graph
requires:
  - phase: 78-web-ui-premium-data-rich-dense-modern-dashboard
    provides: "Split-pane job detail layout, step timeline sidebar, step content pane"
provides:
  - "SSR-loaded job timeline data on job detail page"
  - "Compact activity preview on dashboard job list"
affects: [web-ui, dashboard, job-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route loader for SSR timeline data hydration"
    - "Batch activity preview server function"

key-files:
  created: []
  modified:
    - web/src/routes/jobs.$jobId.index.tsx
    - web/src/components/step-content-pane.tsx
    - web/src/components/job-list.tsx
    - web/src/lib/server-fns.ts
    - web/src/routes/index.tsx
    - web/src/routeTree.gen.ts

key-decisions:
  - "Root cause was missing SSR loader for timeline data — client-only useQuery rendered empty state on server"
  - "Added route loader to pre-fetch timeline via getFullJobTimelineFn, used as initialData for useQuery"
  - "Activity preview uses batch server function to avoid N+1 queries on dashboard"

patterns-established:
  - "Route-level loader + useQuery initialData pattern for SSR-critical data"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-03-21
---

# Phase 79 Plan 01: Web UI Job Activity Regression Fix Summary

**SSR route loader for job timeline + batch activity preview server function for dashboard job list**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-21T08:35:10Z
- **Completed:** 2026-03-21T08:44:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Fixed job detail timeline regression: timeline data now loads via SSR route loader, eliminating the empty-state flash
- Root cause identified: `getFullJobTimelineFn` was only fetched client-side via `useQuery`, so SSR rendered "No timeline activity yet" even for jobs with hundreds of timeline items
- Added compact activity preview to dashboard job list showing latest activity text, step count, and item count per job
- Updated empty-state message to be honest about session resolution failures instead of implying the job hasn't started

## Task Commits

Each task was committed atomically:

1. **Task 1: Diagnose and fix job detail timeline rendering regression** - `ef56233` (fix)
2. **Task 2: Add compact activity preview to dashboard job list** - `65bc9de` (feat)

## Files Created/Modified
- `web/src/routes/jobs.$jobId.index.tsx` - Added route loader for SSR timeline data, renamed variables for clarity
- `web/src/components/step-content-pane.tsx` - Updated empty-state message to be honest
- `web/src/lib/server-fns.ts` - Added `getJobsActivityPreviewFn` batch server function
- `web/src/routes/index.tsx` - Added useQuery for activity previews, threaded to JobList
- `web/src/components/job-list.tsx` - Added `activityPreviews` prop, rendered preview text and step/item badges in card and table views
- `web/src/routeTree.gen.ts` - Auto-generated route tree update

## Decisions Made
- **Root cause: missing SSR loader** — The `getFullJobTimelineFn` was called only via `useQuery` (client-side), not as part of the route's loader. During SSR, `timelineData` was `undefined`, causing the empty-state to render. After client hydration, the query would fire and fetch data, but the initial SSR render showed "No timeline activity yet" even for completed jobs with 178+ items.
- **Fix: route loader + initialData** — Added a `loader` to the `/jobs/$jobId/` index route that pre-fetches the full timeline. The result is passed as `initialData` to the `useQuery`, ensuring timeline data is available on first render (SSR).
- **Batch preview function** — Created `getJobsActivityPreviewFn` that fetches activity previews for multiple job IDs in a single server function call, avoiding N+1 queries from the dashboard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Included routeTree.gen.ts in commit**
- **Found during:** Task 2
- **Issue:** TanStack Router auto-generates routeTree.gen.ts, which included route changes from prior phases
- **Fix:** Included the auto-generated file in the commit since the build depends on it
- **Files modified:** web/src/routeTree.gen.ts
- **Verification:** Build passes cleanly
- **Committed in:** 65bc9de

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor — auto-generated file inclusion was necessary for build integrity. No scope creep.

## Issues Encountered
None — the investigation revealed a straightforward SSR data loading gap. No diagnostic logging was needed since the backend data functions were verified correct via direct Node.js execution.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Job detail timeline regression is fully fixed — SSR renders timeline data on first paint
- Dashboard activity previews provide at-a-glance job context
- Live polling and SSE invalidation remain functional for running jobs
- Phase complete, ready for transition

---
*Phase: 79-web-ui-job-activity-regression-restore-visible-activity-under-jobs*
*Completed: 2026-03-21*
