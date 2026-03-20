---
phase: 62-pilot-web-ui-phase-2
plan: 02
subsystem: ui
tags: [react, tanstack-query, command-palette, action-registry, base-ui]

# Dependency graph
requires:
  - phase: 62-01
    provides: Timeline query + mutation server functions (retryJobFn, cancelJobFn, forceQuitJobFn, unblockProjectFn)
provides:
  - Centralized action model with 7 typed action definitions
  - useActions React hook for contextual action resolution
  - CommandPalette component with Cmd+K shortcut
affects: [62-03, 62-04, 62-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [centralized-action-registry, availability-predicate-pattern, command-palette-ui]

key-files:
  created:
    - web/src/lib/actions.ts
    - web/src/lib/use-actions.ts
    - web/src/components/command-palette.tsx
  modified: []

key-decisions:
  - "Manual query filtering instead of Autocomplete's built-in filtering for full control over disabled item display"
  - "ActionContext includes queryClient for cache invalidation, injected by useActions hook"
  - "Disabled actions show disabledReason as description text instead of original description"

patterns-established:
  - "Centralized action registry: all operations defined in actions.ts with availability predicates"
  - "useActions hook pattern: partial context input, queryClient injected internally"

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 62 Plan 02: Action Model and Command Palette Summary

**Centralized action registry with 7 typed definitions (retry, cancel, force-quit, unblock, navigate, refresh) and Cmd+K command palette using Coss Command primitives**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T15:38:52Z
- **Completed:** 2026-03-13T15:44:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Centralized action model with ActionDefinition type, availability predicates, and disabled reasons
- 7 action definitions covering all proactive operations: retry, cancel, force-quit, unblock, view-detail, back-to-dashboard, refresh
- useActions hook integrating action resolution with React Query for cache invalidation
- CommandPalette component with Cmd+K/Ctrl+K shortcut, grouped actions, filtering, and disabled state display

## Task Commits

Each task was committed atomically:

1. **Task 1: Create centralized action model and useActions hook** - `6e8b81a` (feat)
2. **Task 2: Create CommandPalette component with Coss Command** - `da2f613` (feat)

## Files Created/Modified
- `web/src/lib/actions.ts` - ActionDefinition type, ActionContext, ResolvedAction, ACTION_REGISTRY with 7 actions, resolveActions()
- `web/src/lib/use-actions.ts` - useActions hook computing available/disabled actions with executeAction helper
- `web/src/components/command-palette.tsx` - CommandPalette component using Coss Command dialog with grouped actions

## Decisions Made
- Used manual query filtering (useState + includes) instead of Base UI Autocomplete's built-in filtering — gives full control over rendering disabled items with reasons
- ActionContext requires queryClient for cache invalidation (refresh action, post-mutation invalidation) — injected by useActions hook, not by consumer
- Disabled actions show the disabledReason string in place of the description text — makes unavailability immediately clear

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Action model ready for integration into job detail and dashboard pages
- CommandPalette can be mounted in root layout when page components are ready
- Ready for 62-03-PLAN.md (merged timeline detail view)

---
*Phase: 62-pilot-web-ui-phase-2*
*Completed: 2026-03-13*
