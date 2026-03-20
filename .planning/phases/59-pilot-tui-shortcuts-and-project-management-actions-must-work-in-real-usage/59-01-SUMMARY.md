---
phase: 59-pilot-tui-shortcuts-and-project-management-actions-must-work-in-real-usage
plan: 01
subsystem: tui
tags: [solidjs, opentui, keyboard-shortcuts, project-management, sqlite]

# Dependency graph
requires:
  - phase: 33
    provides: Projects table CRUD, unblock keybind
  - phase: 26
    provides: ConfirmOverlay component, K force-quit action
provides:
  - deregisterProject DB function for removing projects from management
  - Context-specific confirm overlay messages (not hardcoded kill text)
  - d keybind to remove project from management with confirmation
  - confirmMessage signal in state store
affects: [59-02, tui-shortcuts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context-specific confirm overlay via confirmMessage signal"
    - "Project removal with deregister + panel refresh pattern"

key-files:
  modified:
    - src/core/db.ts
    - src/tui/app.tsx
    - src/tui/state.ts
    - src/tui/data/pilot-db.ts
    - src/tui/components/projects-panel.tsx

key-decisions:
  - "deregisterProject uses DELETE, does not cascade to jobs (historical reference preserved)"
  - "confirmMessage signal decouples overlay text from action type (kill vs remove)"

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 59 Plan 01: TUI Shortcut Reliability + Remove-Project Action Summary

**deregisterProject DB function + context-specific ConfirmOverlay + `d` keybind for project removal from management**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T09:28:48Z
- **Completed:** 2026-03-12T09:31:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `deregisterProject(path)` to core DB and re-exported through TUI data layer
- `d` key on projects panel opens confirmation overlay to remove a project from management
- ConfirmOverlay now shows context-specific messages (kill job vs remove project)
- `K` force-quit handler also sets confirmMessage before showing overlay
- Projects panel displays "Press d to remove" hint for selected items
- Existing shortcuts (r/x/K/u) preserved with correct early-return behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deregisterProject DB function + confirmMessage signal** - `bb2791c` (feat)
2. **Task 2: Wire remove-project action + context-specific confirm overlay** - `cc434b0` (feat)

## Files Created/Modified
- `src/core/db.ts` - Added deregisterProject function + export
- `src/tui/state.ts` - Added confirmMessage/setConfirmMessage signal
- `src/tui/data/pilot-db.ts` - Re-exported deregisterProject for TUI consumption
- `src/tui/app.tsx` - Added d key handler, updated K handler, updated ConfirmOverlay to use confirmMessage
- `src/tui/components/projects-panel.tsx` - Added "Press d to remove" hint for selected projects

## Decisions Made
- deregisterProject uses simple DELETE without cascading to jobs — associated jobs remain for historical reference
- confirmMessage signal decouples the overlay text from the action type, enabling context-specific messages for both kill and remove actions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 59-02-PLAN.md (context-aware footer bar + shortcut feedback)
- All existing shortcuts preserved and working
- ConfirmOverlay pattern now supports any confirmation action via confirmMessage signal

---
*Phase: 59-pilot-tui-shortcuts-and-project-management-actions-must-work-in-real-usage*
*Completed: 2026-03-12*
