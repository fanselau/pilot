---
phase: 76-pilot-web-ui-overhaul
plan: 04
subsystem: ui
tags: [react, react-resizable-panels, split-pane, job-detail, virtualization]

# Dependency graph
requires:
  - phase: 76-pilot-web-ui-overhaul
    provides: "Plans 76-01 (full-width layout) and 76-03 (unpaginated timeline) built foundation"
provides:
  - "SplitPaneDetail component: resizable horizontal split-pane for job detail"
  - "StepTimelineSidebar: compact job metadata, model badges, keyboard-nav step list"
  - "StepContentPane: virtualized selected-step content with auto-follow"
  - "observedModels field on JobDetailSnapshot.job (populated from session models)"
  - "JobHeader and helpers exported from job-detail.tsx"
affects: [76-05, jobs-detail-route]

# Tech tracking
tech-stack:
  added: [react-resizable-panels v4 (Group/Panel/Separator API)]
  patterns:
    - "Split-pane layout with auto-follow state for active jobs"
    - "Virtualization via @tanstack/react-virtual for large item counts (≥200)"
    - "Keyboard navigation (ArrowUp/Down) on step timeline list"
    - "observedModels derived from session data in getJobDetail()"

key-files:
  created:
    - web/src/components/split-pane-detail.tsx
    - web/src/components/step-timeline-sidebar.tsx
    - web/src/components/step-content-pane.tsx
  modified:
    - web/src/routes/jobs.$jobId.index.tsx
    - web/src/routes/jobs.$jobId.tsx
    - web/src/components/job-detail.tsx
    - web/src/components/timeline-stream.tsx
    - src/core/types.ts
    - src/core/job-detail-query.ts

key-decisions:
  - "Used react-resizable-panels v4 Group/Panel/Separator (not PanelGroup/PanelResizeHandle from v1/v2)"
  - "observedModels added to JobDetailSnapshot.job type; derived from getSessionModelsRecursive per root session"
  - "StepTimelineSidebar also derives models from snapshot.rootSessions+subagents via useMemo (belt-and-suspenders)"
  - "Virtualization threshold set at 200 items in StepContentPane"
  - "Previous plan 76-05 agent committed most code; this plan agent added JobHeader/helpers exports"

requirements-completed:
  - WUI-02
  - WUI-03
  - WUI-06

# Metrics
duration: 226min
completed: 2026-03-20
---

# Phase 76 Plan 04: Split-Pane Job Detail with Step Timeline and Model Badges Summary

**Horizontal split-pane job detail with resizable panels, keyboard-nav step timeline, model badges from observedModels, and virtualized step content pane with auto-follow**

## Performance

- **Duration:** 226 min (largely completed by prior agent in commit 946d84b)
- **Started:** 2026-03-20T17:30:31Z
- **Completed:** 2026-03-20T21:17:19Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Split-pane layout (`split-pane-detail.tsx`) using react-resizable-panels v4 Group/Panel/Separator API
- Left pane: compact job header, model badges, keyboard-nav step list with accent-border selected state
- Right pane: virtualized step content (@tanstack/react-virtual, activates at ≥200 items) with auto-follow + Follow button
- `observedModels: string[]` added to `JobDetailSnapshot.job` type and populated in `getJobDetail()`
- Route wired: `jobs.$jobId.index.tsx` renders `SplitPaneDetail` with full timeline query, SSE invalidation
- `jobs.$jobId.tsx` layout updated to `h-[calc(100vh-3rem)] flex flex-col overflow-hidden`
- `JobHeader` and helpers exported from `job-detail.tsx`
- `ActivityRow`, `ToolSummaryRow`, `TimelineItemRenderer` exported from `timeline-stream.tsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install react-resizable-panels + create split-pane layout** - `946d84b` (feat) *(from prior agent as 76-05)*
2. **Task 2: Wire split-pane into job detail route** - `e95bf45` (feat)

**Plan metadata:** *(this SUMMARY commit)*

## Files Created/Modified
- `web/src/components/split-pane-detail.tsx` — Top-level split-pane with react-resizable-panels v4, auto-follow state
- `web/src/components/step-timeline-sidebar.tsx` — Left pane: compact job header, model badges, keyboard-nav step list
- `web/src/components/step-content-pane.tsx` — Right pane: virtualized selected-step content, auto-follow scroll
- `web/src/routes/jobs.$jobId.index.tsx` — Renders SplitPaneDetail + full timeline query + SSE invalidation
- `web/src/routes/jobs.$jobId.tsx` — Updated layout to full-height flex column
- `web/src/components/job-detail.tsx` — Exported JobHeader, statusVariant, verdictVariant, formatDurationMs, formatTime, shortProject
- `web/src/components/timeline-stream.tsx` — Exported ActivityRow, ToolSummaryRow, TimelineItemRenderer
- `src/core/types.ts` — Added observedModels: string[] to JobDetailSnapshot.job
- `src/core/job-detail-query.ts` — Populates observedModels from getSessionModelsRecursive per root session

## Decisions Made
- react-resizable-panels v4 exports `Group`, `Panel`, `Separator` (not the v1/v2 `PanelGroup`/`PanelResizeHandle` API)
- `observedModels` added to the type even though the sidebar also derives models from sessions via `useMemo` — provides the field the plan specifications required
- Virtualization threshold of 200 items balances performance vs simplicity
- `minSize={280}` (pixels in v4) for the left panel instead of percentage, matching ~300px spec

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] observedModels field missing from JobDetailSnapshot.job type**
- **Found during:** Task 1 (step-timeline-sidebar creation)
- **Issue:** Plan's interfaces block stated `job.observedModels` exists but the actual type had no such field
- **Fix:** Added `observedModels: string[]` to `JobDetailSnapshot.job` in `src/core/types.ts` and populated it in `getJobDetail()` using `getSessionModelsRecursive` across all root sessions
- **Files modified:** `src/core/types.ts`, `src/core/job-detail-query.ts`
- **Verification:** TypeScript compiles cleanly with no errors
- **Committed in:** `946d84b` (part of Task 1 commit from prior agent)

**2. [Rule 2 - Missing Critical] Export TimelineItemRenderer from timeline-stream.tsx**
- **Found during:** Task 1 (step-content-pane creation)
- **Issue:** `step-content-pane.tsx` needs to reuse `TimelineItemRenderer` but it wasn't exported
- **Fix:** Added `export` keyword to `ActivityRow`, `ToolSummaryRow`, `TimelineItemRenderer` in `timeline-stream.tsx`
- **Files modified:** `web/src/components/timeline-stream.tsx`
- **Verification:** Imports work, TypeScript clean
- **Committed in:** `946d84b`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes essential for type correctness and code reuse. No scope creep.

## Issues Encountered
- Prior agent session (labeled 76-05) had already committed most of the work for this plan (all three component files, route wiring, type changes) in commit `946d84b`. This agent's contribution was limited to adding `export` keywords to `JobHeader` and helpers in `job-detail.tsx`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Split-pane job detail is implemented and wired
- Keyboard navigation (ArrowUp/Down), model badges, auto-follow, resizable panels all working
- Session drill-in page (`/jobs/$jobId/sessions/$sessionId`) unaffected
- Ready for Plan 76-05 (if any remaining plans) or phase completion

---
*Phase: 76-pilot-web-ui-overhaul-full-width-dashboard-dense-step-visualization*
*Completed: 2026-03-20*
