---
phase: 84-pilot-control-flow-live-status-bugs
plan: 01
subsystem: ui
tags: [react, tanstack-query, sse, polling, react-router]

# Dependency graph
requires: []
provides:
  - Live polling in job detail page derives isActive from latest query snapshot, not stale loader data
  - SSE invalidation hook receives accurate enabled flag for active jobs
affects: [web-ui, job-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TanStack Query refetchInterval callback form to eliminate stale-closure polling bugs"

key-files:
  created: []
  modified:
    - web/src/routes/jobs.$jobId.tsx
    - web/src/routes/jobs.$jobId.index.tsx

key-decisions:
  - "Use refetchInterval callback form (query) => {...} instead of ternary with stale isActive to eliminate stale closure"
  - "Derive downstream isActive from snapshot (post-query) not from layoutLoaderData (loader snapshot)"

patterns-established:
  - "refetchInterval callback pattern: always read query.state.data inside callback to get live cache value"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 84 Plan 01: Fix isActive Desync in Job Detail Routes Summary

**TanStack Query refetchInterval callback form replaces stale loaderData-derived isActive, ensuring live polling and SSE invalidation continue even when the loader captured a false failed/completed status**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T13:52:57Z
- **Completed:** 2026-03-21T13:54:39Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Eliminated stale-closure polling bug in layout route: refetchInterval now reads latest query cache value via callback form
- Eliminated stale isActive in index route: derived from `snapshot` (reactive) not `layoutLoaderData` (stale loader snapshot)
- SSE hook and SplitPaneDetail component now receive live-accurate isActive flag

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix isActive derivation in job layout route** - `43c5064` (fix)
2. **Task 2: Fix isActive derivation in job detail index route** - `630bd66` (fix)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `web/src/routes/jobs.$jobId.tsx` - Remove stale isActive const; use refetchInterval callback form reading query.state.data
- `web/src/routes/jobs.$jobId.index.tsx` - Same callback fix on job-detail query; re-derive isActive from snapshot for timeline query, SSE hook, and SplitPaneDetail prop

## Decisions Made
- Used TanStack Query's callback form of `refetchInterval` rather than a computed variable, because the callback is invoked with the latest query instance on every fetch cycle — no stale closure possible
- In the index route, kept `layoutLoaderData` as `initialData` (correct: bootstraps cache), but moved the polling decision to the callback and moved `isActive` derivation below the query to use `snapshot` (reactive)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both route files now correctly derive all polling and SSE decisions from latest reactive query snapshot
- The stale `loaderData?.job.status` / `layoutLoaderData?.job.status` pattern is fully eliminated from polling decisions
- TypeScript compiles cleanly with no errors
- Ready for remaining plans in Phase 84

---
*Phase: 84-pilot-control-flow-live-status-bugs*
*Completed: 2026-03-21*
