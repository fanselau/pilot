---
phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui
plan: 03
subsystem: ui
tags: [tanstack-router, nested-routes, breadcrumbs, web-ui, vitest]

# Dependency graph
requires:
  - phase: 62
    provides: web detail baseline, server functions, and command palette action model
  - phase: 63-01
    provides: step-grouped timeline contract consumed by parent and child detail surfaces
provides:
  - /jobs/$jobId layout + index split for true nested page behavior
  - child session route UX framing with explicit nested-context header and stable back path
  - route contract regression tests plus regenerated TanStack route tree topology
affects: [63-04, 63-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [layout-index-route-composition, nested-child-detail-context]

key-files:
  created:
    - web/src/routes/jobs.$jobId.index.tsx
    - test/web/job-routes.test.ts
  modified:
    - web/src/routes/jobs.$jobId.tsx
    - web/src/routes/jobs.$jobId.sessions.$sessionId.tsx
    - web/src/routeTree.gen.ts

key-decisions:
  - "Command-palette job context stays at the /jobs/$jobId layout layer so both index and child routes share it"
  - "Route regression tests assert route contract strings and generated topology invariants instead of brittle router internals"

patterns-established:
  - "Parent detail renders from jobs.$jobId.index while jobs.$jobId stays an Outlet-first layout shell"
  - "Child session page always exposes breadcrumb and explicit parent back-path context"

# Metrics
duration: 6 min
completed: 2026-03-14
---

# Phase 63 Plan 03: Nested Job Route Layout Summary

**Web drill-in now behaves like a true nested child page by splitting job detail into layout/index routes and making child session detail primary route content with explicit context.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-14T13:17:44Z
- **Completed:** 2026-03-14T13:24:19Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Converted `jobs.$jobId` into an Outlet-first layout shell and moved parent detail rendering into a new index child route.
- Refined `/jobs/$jobId/sessions/$sessionId` to feel like a focused nested child page with explicit context framing, breadcrumbs, and parent back navigation.
- Added route contract regression coverage and committed regenerated `routeTree.gen.ts` for the layout/index/session topology.

## Task Commits

Each task was committed atomically:

1. **Task 1: Split job route into layout + index** - `3b7c312` (feat)
2. **Task 2: Refine child session route nested UX** - `374d52d` (feat)
3. **Task 3: Add route contract tests and generated route tree** - `f430c32` (test)

## Files Created/Modified
- `web/src/routes/jobs.$jobId.tsx` - Converted parent route into shared layout with Outlet and command-palette context.
- `web/src/routes/jobs.$jobId.index.tsx` - Added index child route that owns parent job detail rendering.
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` - Strengthened nested child-page framing, breadcrumb clarity, and back navigation.
- `test/web/job-routes.test.ts` - Added route architecture and navigation-context regression assertions.
- `web/src/routeTree.gen.ts` - Regenerated TanStack route tree to include the index child route topology.

## Decisions Made
- Kept command-palette context at the layout route level so both the parent index page and child session page share the same job context contract.
- Used contract-focused route tests based on route source and generated route tree invariants to avoid brittle deep assertions against TanStack internals.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Web nested routing contract for child drill-in is in place and covered by regression tests.
- Phase 63 can continue with remaining TUI alignment and drill-in polish plans.

---
*Phase: 63-pilot-phase-63-step-first-detail-flow-lifecycle-branch-blocks-and-nested-child-detail-for-web-tui*
*Completed: 2026-03-14*
