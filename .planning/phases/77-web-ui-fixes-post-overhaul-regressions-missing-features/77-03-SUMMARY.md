---
phase: 77-web-ui-fixes-post-overhaul-regressions-missing-features
plan: 03
subsystem: ui
tags: [react, tanstack-router, tanstack-query, grace-period, project-management]

# Dependency graph
requires:
  - phase: 76-pilot-web-ui-overhaul
    provides: Full-width dashboard, job list components, projects tab
provides:
  - Grace wait countdown badge for pending jobs
  - Project detail page with block/unblock and job history
  - Clickable project links in dashboard
affects: [web-ui, project-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server function for config exposure (getGraceConfigFn)"
    - "Auto-refresh countdown via setInterval + state tick"
    - "URL-encoded project path routing"

key-files:
  created:
    - web/src/routes/projects.$projectPath.tsx
  modified:
    - web/src/components/job-list.tsx
    - web/src/components/projects-list.tsx
    - web/src/lib/server-fns.ts
    - src/core/job-detail-query.ts
    - web/src/routes/index.tsx

key-decisions:
  - "Grace countdown computed client-side from createdAt + queueGraceSeconds, avoiding per-job server computation"
  - "Project detail uses filter-based getProjectJobs over dedicated DB query for simplicity"
  - "Categories rendered directly from ProjectWithStats.defaultCategories array (already parsed by db layer)"

patterns-established:
  - "Config exposure pattern: server function returning config subset for client-side computation"
  - "Project detail route pattern: encodeURIComponent for path params, decodeURIComponent in component"

requirements-completed: [WUI77-05, WUI77-06]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 77 Plan 03: Grace Countdown + Project Detail Summary

**Grace wait countdown badge on pending jobs and project detail page with block/unblock actions and filtered job history**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T23:14:29Z
- **Completed:** 2026-03-20T23:20:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Pending jobs with active grace period show "Starting in Xs" countdown badge that updates every second
- Project detail page at `/projects/$projectPath` with status, owner, categories, job counts
- Block/unblock actions on project detail page with toast feedback
- Filtered job history per project
- Projects in dashboard list are clickable links to detail page

## Task Commits

Each task was committed atomically:

1. **Task 1: Grace wait countdown badge + backend grace period data** - `39316d3` (feat)
2. **Task 2: Project management detail page** - `d5474c5` (feat)

## Files Created/Modified
- `web/src/routes/projects.$projectPath.tsx` - New project detail route with status, actions, job history
- `web/src/components/job-list.tsx` - Added getGraceSecondsRemaining helper and grace badge in table/card
- `web/src/components/projects-list.tsx` - Made project names clickable links
- `web/src/lib/server-fns.ts` - Added getGraceConfigFn, getProjectDetailFn, getProjectJobsFn, blockProjectFn
- `src/core/job-detail-query.ts` - Added getProjectDetail, getProjectJobs, blockProjectAction
- `web/src/routes/index.tsx` - Fetches grace config and passes to JobList

## Decisions Made
- Grace countdown computed client-side from createdAt + queueGraceSeconds to avoid per-job server computation
- Project detail uses filter-based getProjectJobs (filters queue + recent) rather than dedicated DB query
- Categories rendered directly from defaultCategories array without additional parsing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Grace countdown and project detail page complete
- Ready for Plan 04 (remaining web UI fixes)

## Self-Check: PASSED

---
*Phase: 77-web-ui-fixes-post-overhaul-regressions-missing-features*
*Completed: 2026-03-20*
