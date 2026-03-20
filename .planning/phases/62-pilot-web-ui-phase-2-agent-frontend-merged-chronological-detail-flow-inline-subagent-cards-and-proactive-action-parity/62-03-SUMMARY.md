---
phase: 62-pilot-web-ui-phase-2
plan: 03
subsystem: ui
tags: [react, tanstack-query, timeline-stream, fork-card, action-buttons, breadcrumb, command-palette]

# Dependency graph
requires:
  - phase: 62-01
    provides: getJobTimelineFn timeline query + mutation server functions
  - phase: 62-02
    provides: Centralized action model (useActions) + CommandPalette component
provides:
  - TimelineStream merged chronological timeline component
  - TimelineForkCard inline sub-agent fork card component
  - Rewritten JobDetail with unified timeline and proactive action buttons
  - Session drill-in with breadcrumb navigation
  - CommandPalette wired at job detail route level
affects: [62-04, 62-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [merged-timeline-ui, inline-fork-card, proactive-action-header, breadcrumb-drill-in]

key-files:
  created:
    - web/src/components/timeline-stream.tsx
    - web/src/components/timeline-fork-card.tsx
  modified:
    - web/src/components/job-detail.tsx
    - web/src/routes/jobs.$jobId.tsx
    - web/src/routes/jobs.$jobId.sessions.$sessionId.tsx

key-decisions:
  - "JobHeader renders action buttons from useActions with Tooltip for disabled state explanations"
  - "TimelineStream uses independent query (getJobTimelineFn) separate from JobDetail snapshot"
  - "SSE polling invalidates timeline query cache for live updates on active jobs"
  - "BreadcrumbLink uses render prop with TanStack Router Link for proper client-side navigation"

patterns-established:
  - "Merged timeline: single TimelineStream replaces separated session/subagent/activity sections"
  - "Action buttons in header: useActions hook provides contextual actions for proactive controls"
  - "Breadcrumb drill-in: Dashboard > Job > Session pattern for hierarchical navigation"

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 62 Plan 03: Merged Timeline Detail Stream, Inline Fork Cards, and Proactive Actions Summary

**Merged chronological TimelineStream replacing separated session blocks, inline TimelineForkCard at sub-agent spawn points, proactive action buttons (retry/cancel/force-quit) in JobHeader, and breadcrumb navigation on session drill-in**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T15:48:05Z
- **Completed:** 2026-03-13T15:52:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created TimelineStream component rendering merged chronological items with kind-based switching (activity, tool-summary, fork-card, completion-card)
- Created TimelineForkCard with visually distinct styling (border-l-4 accent, bg-muted/30) showing identity, status, timing, message/token counts, models, preview, and drill-in link
- Rewrote JobDetail to replace separated RootSessionList/SubagentSection/ActivityPreview with single TimelineStream
- Added proactive action buttons in JobHeader using useActions hook with Tooltip for disabled reasons
- Wired CommandPalette at job detail route level with job context
- Replaced back button with Breadcrumb navigation (Dashboard > Job > Session) on session drill-in
- Cursor-based load-more pagination with ScrollArea container and vertical timeline connector line

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TimelineStream and TimelineForkCard components** - `b5e13a3` (feat)
2. **Task 2: Rewrite job detail page with timeline + action integration** - `6bbf8aa` (feat)

## Files Created/Modified
- `web/src/components/timeline-stream.tsx` - Merged chronological timeline with kind-based item rendering, cursor pagination, SSE live updates
- `web/src/components/timeline-fork-card.tsx` - Compact inline card for sub-agent fork points with drill-in link
- `web/src/components/job-detail.tsx` - Rewritten to use TimelineStream, added action buttons in JobHeader via useActions
- `web/src/routes/jobs.$jobId.tsx` - Added CommandPalette with job context at route level
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` - Replaced back button with Breadcrumb navigation

## Decisions Made
- JobHeader renders proactive action buttons from useActions hook — destructive variant for cancel/force-quit, default for retry — with Tooltip showing disabled reasons
- TimelineStream uses its own independent query (getJobTimelineFn) rather than the JobDetail snapshot's activityPreview — this gives full timeline data with proper pagination
- SSE polling via useJobDetailStream invalidates the timeline query cache when new events arrive, keeping the timeline live during active jobs
- BreadcrumbLink uses the `render` prop pattern with TanStack Router `<Link>` for proper client-side navigation without full page reloads

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Merged timeline detail view complete, ready for Phase 62-04 (dashboard polish and session overview)
- CommandPalette functional on both dashboard (via root layout) and job detail page
- All session drill-in routes use breadcrumb navigation

---
*Phase: 62-pilot-web-ui-phase-2*
*Completed: 2026-03-13*
