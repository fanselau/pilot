---
phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
plan: "04"
subsystem: ui
tags: [react, tanstack-router, tanstack-query, collapsible, base-ui, realtime, polling]

requires:
  - phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish
    provides: phase context and prior UI work (86-01 through 86-03)

provides:
  - Inline collapsible subsession rendering within execution tree
  - Live polling for active session activity (3s refetchInterval)
  - Depth-based auto-expand/collapse behavior for nested sessions
  - Mobile-safe nested layout with reduced indentation
  - Redirect from old session drill-in route to job detail

affects:
  - branch-lifecycle-block
  - session-activity
  - timeline-stream

tech-stack:
  added: []
  patterns:
    - "Collapsible tree items with lazy child loading (enabled: isOpen)"
    - "Controlled Collapsible state + useQuery enabled flag for lazy fetch"
    - "Depth prop for recursive component nesting with MAX_DEPTH guard"
    - "TanStack Router beforeLoad redirect for deprecated routes"

key-files:
  created: []
  modified:
    - web/src/components/branch-lifecycle-block.tsx
    - web/src/components/session-activity.tsx
    - web/src/routes/jobs.$jobId.sessions.$sessionId.tsx

key-decisions:
  - "Controlled Collapsible state (useState + onOpenChange) to enable useQuery enabled:isOpen pattern"
  - "Active branches at depth<2 expand by default; done branches always collapse"
  - "MAX_DEPTH=4 prevents infinite recursion in recursive BranchLifecycleBlock"
  - "SessionToBranchItem adapter converts SessionSummary to BranchLifecycleItem for BranchLifecycleBlock reuse"
  - "Deleted SubagentCard entirely (was only consumer: session drill-in route, now a redirect)"
  - "Session drill-in route converted to beforeLoad redirect — keeps route file (TanStack Router requires file for generation) but clears all UI code"

patterns-established:
  - "Lazy-loaded collapsible children: useQuery enabled by isOpen state"
  - "Recursive component with depth prop and MAX_DEPTH guard"

requirements-completed: [RT86-01, RT86-02, RT86-03, RT86-04, RT86-05, RT86-06, RT86-07]

duration: 4min
completed: 2026-03-22
---

# Phase 86 Plan 04: Inline Collapsible Subsession Nesting Summary

**Transformed BranchLifecycleBlock from a drill-in link to an inline Collapsible tree with live polling, depth-based defaults, and a redirect cleanup of the old session route**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T00:19:51Z
- **Completed:** 2026-03-22T00:23:27Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- BranchLifecycleBlock is now an inline collapsible — active sessions auto-expand, done sessions collapse
- Session activity streams live inside the execution tree with 3s polling for active sessions
- Nested child sessions load lazily on expand (enabled by isOpen), recursively up to depth 4
- SubagentCard deleted — replaced everywhere with BranchLifecycleBlock via sessionToBranchItem adapter
- Old `/jobs/$jobId/sessions/$sessionId` route converted to redirect → `/jobs/$jobId`

## Task Commits

1. **Task 1: Inline collapsible BranchLifecycleBlock + live SessionActivity** - `5052bf6` (feat)
2. **Task 2: Remove SubagentCard, replace with BranchLifecycleBlock** - `805258f` (feat)
3. **Task 3: Session drill-in redirect + route tree regeneration** - `565f736` (feat)

## Files Created/Modified

- `web/src/components/branch-lifecycle-block.tsx` — Rewrote as inline Collapsible with depth prop, lazy children, live activity
- `web/src/components/session-activity.tsx` — Added `isActive` prop driving `refetchInterval: 3000 | false`
- `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` — Replaced 98-line UI with 18-line redirect

## Decisions Made

- **Controlled Collapsible state**: Used `useState` + `onOpenChange` (not `defaultOpen`) to enable `useQuery enabled: isOpen` pattern for lazy child loading
- **Depth < 2 default expansion**: Active sessions at depth 0 and 1 auto-expand; depth 2+ always collapsed — balances visibility vs noise
- **MAX_DEPTH = 4**: Hard limit prevents infinite recursion if sessions have unexpected circular references
- **SubagentCard deletion**: Was only used in session drill-in route (which is now a redirect), so deletion was safe
- **beforeLoad redirect**: TanStack Router requires the route file to exist for route tree generation; converting to redirect keeps the file while removing all UI

## Deviations from Plan

None — plan executed exactly as written. Option A (preferred) was implemented for Task 2: SubagentCard deleted and replaced with BranchLifecycleBlock.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All inline collapsible subsession work is complete
- Live polling for active sessions is wired up
- Ready for Phase 86 plan 05 (if any remaining plans)

## Self-Check: PASSED

- ✅ `web/src/components/branch-lifecycle-block.tsx` exists (inline collapsible with depth prop)
- ✅ `web/src/components/session-activity.tsx` exists (isActive + refetchInterval)
- ✅ `web/src/routes/jobs.$jobId.sessions.$sessionId.tsx` exists (redirect only)
- ✅ `web/src/components/subagent-card.tsx` deleted
- ✅ Commits 5052bf6, 805258f, 565f736 all exist in git log
- ✅ `cd web && npm run build` passes (✓ built in 4.68s)

---
*Phase: 86-pilot-web-ui-realtime-navigation-header-hierarchy-and-observability-polish*
*Completed: 2026-03-22*
