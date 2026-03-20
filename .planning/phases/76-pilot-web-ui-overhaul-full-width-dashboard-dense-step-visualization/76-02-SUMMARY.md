---
phase: 76-pilot-web-ui-overhaul
plan: 02
subsystem: ui
tags: [react, tanstack-virtual, react-resizable-panels, dashboard, projects]

requires:
  - phase: 76-pilot-web-ui-overhaul
    plan: 01
    provides: "ProjectWithStats type, getProjectsListFn server function"

provides:
  - "react-resizable-panels and @tanstack/react-virtual installed in web/"
  - "ProjectsList component with status badges, job counts, blocked indicators"
  - "Projects tab on dashboard with 30s refresh interval"

affects:
  - 76-pilot-web-ui-overhaul

tech-stack:
  added:
    - react-resizable-panels@4.7.3
    - "@tanstack/react-virtual@3.13.23"
  patterns:
    - "useQuery with refetchInterval for slow-changing data (projects at 30s vs jobs at 5s)"
    - "Tooltip on truncated project paths for full-path disclosure"

key-files:
  created:
    - web/src/components/projects-list.tsx
  modified:
    - web/package.json
    - web/src/routes/index.tsx

key-decisions:
  - "Used pnpm instead of npm (npm errored with 'Cannot read properties of null'); pnpm is the project's package manager per pnpm config in package.json"
  - "Projects tab uses 30s refetch (vs 5s for active jobs) — projects change infrequently"
  - "Clicked rows do nothing (filter wiring deferred per plan spec)"
  - "Plan 01 was already executed when Task 2 ran; getProjectsListFn/ProjectWithStats were already present — my inline additions were redundant and were not double-committed"

patterns-established:
  - "Dashboard tabs: active/queued/recent/sessions/projects — extend TabsTab + TabsPanel pairs"
  - "Empty state for project lists: Empty > EmptyHeader > EmptyTitle + EmptyDescription"

requirements-completed:
  - WUI-08

duration: 8min
completed: 2026-03-20
---

# Phase 76 Plan 02: Dependencies + Projects Tab Summary

**react-resizable-panels and @tanstack/react-virtual installed; ProjectsList table component with blocked indicators and job counts wired into dashboard Projects tab**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-20T17:07:10Z
- **Completed:** 2026-03-20T17:15:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed `react-resizable-panels@4.7.3` and `@tanstack/react-virtual@3.13.23` via pnpm in `web/`
- Created `ProjectsList` component with table: Project (with full-path tooltip), Owner, Status badge, Active/Completed/Failed counts
- Blocked projects highlighted with `bg-destructive/5` row background and blockedReason shown in muted text
- Empty state: "No projects registered" with `pilot setup <dir>` hint
- Added Projects tab to dashboard with 30-second auto-refresh

## Task Commits

Each task was committed atomically:

1. **Task 1: Install react-resizable-panels and @tanstack/react-virtual** - `f0101f7` (chore)
2. **Task 2: Create ProjectsList component and wire into dashboard** - `dcede1c` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `web/package.json` — react-resizable-panels and @tanstack/react-virtual added
- `web/src/components/projects-list.tsx` — New ProjectsList component
- `web/src/routes/index.tsx` — Projects tab + useQuery for getProjectsListFn

## Decisions Made

- Used `pnpm add` (not `npm install`) — npm errored with "Cannot read properties of null"; package.json has `pnpm` config block confirming pnpm is the project package manager
- Plan 01 ran concurrently and had already created `ProjectWithStats` in `types.ts` and `getProjectsListFn` in `server-fns.ts` when Task 2 executed; the inline implementations I attempted to add were not double-committed (git correctly reflected the already-present state from Plan 01)
- `getProjectsListFn` uses Plan 01's `getProjectsWithStats()` abstraction from `job-detail-query.ts` rather than an inline implementation — this is cleaner and matches the plan's original intent

## Deviations from Plan

None - plan executed exactly as written.

The note about Plan 01 dependency ("create a temporary inline type and query function") was not needed because Plan 01 had already executed, providing `ProjectWithStats` and `getProjectsListFn`. My redundant edits to those files were handled cleanly without double-commits.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dependencies ready for Plans 03 (react-resizable-panels) and 05 (@tanstack/react-virtual)
- Projects tab visible on dashboard; operators can now monitor project status and blocked state
- Ready for Plan 03: Split-pane job detail layout

## Self-Check: PASSED

- ✅ `web/src/components/projects-list.tsx` exists
- ✅ `web/src/routes/index.tsx` imports ProjectsList and getProjectsListFn
- ✅ Commit `f0101f7` (chore: install packages) exists
- ✅ Commit `dcede1c` (feat: ProjectsList + Projects tab) exists
- ✅ `react-resizable-panels` and `@tanstack/react-virtual` in web/package.json

---
*Phase: 76-pilot-web-ui-overhaul*
*Completed: 2026-03-20*
