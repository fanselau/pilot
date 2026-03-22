---
phase: 88-pilot-web-ui-job-detail-content-first-redesign
plan: 01
subsystem: ui
tags: [react, sheet, tanstack-router, tailwind, job-detail, info-panel, summary-overlay]

# Dependency graph
requires:
  - phase: 87-pilot-web-ui-first-class-delegation-step
    provides: split-pane-detail, step-timeline-sidebar, step-content-pane infrastructure
provides:
  - JobInfoPanel Sheet component with all job context + working actions
  - SummaryOverlay Sheet component showing step verdictReasons
  - Tabless split-pane layout — activity/timeline is the only surface
  - Minimal content-first breadcrumb header in job detail route
affects:
  - 88-02-PLAN.md (nested child sessions, follow mode)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Sheet-based secondary surfaces via SheetTrigger render= prop pattern
    - toLocaleString local-timezone rendering (parseSqliteTimestamp → UTC ms → toLocaleString)
    - trigger: React.ReactNode prop pattern for sheet affordances

key-files:
  created:
    - web/src/components/job-info-panel.tsx
    - web/src/components/summary-overlay.tsx
  modified:
    - web/src/components/split-pane-detail.tsx
    - web/src/components/step-timeline-sidebar.tsx
    - web/src/routes/jobs.$jobId.index.tsx
    - web/src/components/job-detail.tsx

key-decisions:
  - "Sheet trigger pattern: pass trigger as React.ReactNode, use render={trigger as React.ReactElement} on SheetTrigger"
  - "toLocaleString for local timezone: parseSqliteTimestamp normalizes to UTC ms, toLocaleString renders in browser locale"
  - "ObservabilityCard/VerdictCard/GitCheckpointCard rendered -mx-6 inside SheetPanel to appear edge-to-edge despite p-6 container"
  - "job-detail.tsx helpers (formatDurationMs, shortProject) kept exported — still imported by job-info-panel.tsx"
  - "JobHeader/JobDetail simplified (not removed) to preserve exports; actions moved to JobInfoPanel"

patterns-established:
  - "Sheet-based secondary surfaces: <Sheet><SheetTrigger render={el}/><SheetContent><SheetHeader/><SheetPanel/></SheetContent></Sheet>"
  - "Content-first mobile: compact status top bar + full-height StepContentPane, no tabs"
  - "Desktop sidebar: Info + Summary buttons in compact border-b row, step list fills remaining height"

requirements-completed: [INFO-PANEL, TAB-REMOVAL, SUMMARY-OVERLAY, TIMEZONE-FIX, TOP-LAYOUT]

# Metrics
duration: 11min
completed: 2026-03-22
---

# Phase 88 Plan 01: Job Detail Content-First Redesign — Info Panel, Summary Overlay, Tab Removal Summary

**Unified JobInfoPanel Sheet + tabless split-pane layout replacing fragmented top-bar/meta/tab-bar model with a content-first activity reader**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-22T23:30:58Z
- **Completed:** 2026-03-22T23:41:58Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `JobInfoPanel` — Sheet-based unified secondary surface with status, timestamps (local timezone), identity, observability, verdict, git checkpoint, recovery context, and all job actions
- Created `SummaryOverlay` — Toggleable Sheet showing per-step `verdictReason` content, replaces the Summary tab
- Removed tab bar entirely from both desktop and mobile (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` gone)
- Mobile redesign: compact top bar with StatusBadge + Summary + Info triggers → full-height `StepContentPane`
- Desktop redesign: Info + Summary sheet triggers in sidebar header row; observability/verdict/git cards moved to `JobInfoPanel`
- Minimal content-first breadcrumb: project name + job ID + status badge replaces old card-based header

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unified Info panel component + Summary overlay** - `716bb23` (feat)
2. **Task 2: Remove tab bar, redesign top layout, wire Info + Summary into split-pane** - `d6921c3` (feat)

## Files Created/Modified
- `web/src/components/job-info-panel.tsx` — New unified Info Sheet with all job context + actions (230 lines)
- `web/src/components/summary-overlay.tsx` — New Summary Sheet showing verdictReason per step (80 lines)
- `web/src/components/split-pane-detail.tsx` — Rewritten without tabs; mobile top bar + full-height timeline
- `web/src/components/step-timeline-sidebar.tsx` — Removed 3 card imports, added Info+Summary triggers
- `web/src/routes/jobs.$jobId.index.tsx` — Minimal project+id+status breadcrumb header
- `web/src/components/job-detail.tsx` — Simplified JobHeader/JobDetail; shared helpers preserved

## Decisions Made
- Used `render={trigger as React.ReactElement}` on SheetTrigger to make caller-provided button elements act as sheet triggers (existing base-ui Dialog pattern)
- `parseSqliteTimestamp` already normalizes SQLite naive timestamps to UTC; `toLocaleString()` renders in user's browser locale/timezone — no extra work needed
- Embedded `ObservabilityCard`, `VerdictCard`, `GitCheckpointCard` inside `SheetPanel` with `-mx-6` negative margin to appear edge-to-edge despite container's `p-6` padding
- `JobDetail` and `JobHeader` simplified rather than removed to preserve exported helpers (`formatDurationMs`, `shortProject`, `statusVariant`, `verdictVariant`, `formatTime`) that `JobInfoPanel` and the route now import

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Info panel, Summary overlay, and tabless layout are complete and compilable
- Ready for Plan 02: nested child session normal-flow redesign + sticky hierarchy + follow mode
- Activity/timeline is now the sole persistent surface on both desktop and mobile

---
*Phase: 88-pilot-web-ui-job-detail-content-first-redesign*
*Completed: 2026-03-22*
