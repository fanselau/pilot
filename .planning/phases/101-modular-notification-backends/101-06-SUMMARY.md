---
phase: 101-modular-notification-backends
plan: 06
subsystem: core, tui, cli, planning
tags: [owner-removal, notify-routes, init-interactive, requirements-traceability]

# Dependency graph
requires:
  - phase: 101-modular-notification-backends
    provides: NotifyBackend registry, NotifyRoute types, backend implementations
provides:
  - Owner-free Project/ProjectWithStats interfaces
  - Interactive backend selection in pilot init
  - Complete NBACK-* requirement traceability in REQUIREMENTS.md
affects: [web-ui, tui, cli, types]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Interactive numbered-list selection in CLI init flow
    - notifyRoutes summary display replacing owner in TUI

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - src/core/db.ts
    - src/tui/components/projects-panel.tsx
    - src/commands/init.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Removed owner from db.ts rowToProject mapping as cascading type fix (Rule 1 deviation)"
  - "Adapted interactive backend selection to use validateConfig() error messages instead of non-existent requiredConfigKeys method"

patterns-established:
  - "Interactive CLI selection: numbered list + comma-separated input pattern in init.ts"

requirements-completed: [NBACK-OWNER-REMOVAL, NBACK-INIT-DETECTION, NBACK-TESTS]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 101 Plan 06: Gap Closure — Owner Removal, Init Detection, Requirements Summary

**Owner field hard-removed from Project/ProjectWithStats types and all DTOs; TUI shows notifyRoutes; pilot init prompts interactive backend selection; 18 NBACK-* requirements added to REQUIREMENTS.md**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T12:35:47Z
- **Completed:** 2026-03-30T12:39:07Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Owner field completely removed from Project, ProjectWithStats interfaces, DTOs (job-detail-query.ts), and db.ts row mapping
- TUI projects panel shows notifyRoutes backend summary instead of owner, with --owner hint removed from empty-state text
- pilot init interactive mode now presents numbered backend list with selection prompt, config validation, and enable flow
- All 18 NBACK-* requirements defined in REQUIREMENTS.md with descriptions, checkmarks, and phase traceability table

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove owner from types, DTOs, and TUI projects panel** - `a266bf2` (feat)
2. **Task 2: Add interactive backend selection to pilot init** - `f792389` (feat)
3. **Task 3: Add NBACK-* requirements to REQUIREMENTS.md** - `9296f0d` (docs)

## Files Created/Modified
- `src/core/types.ts` - Removed owner field from Project and ProjectWithStats interfaces
- `src/core/job-detail-query.ts` - Removed owner from getProjectsWithStats and getProjectDetail return objects
- `src/core/db.ts` - Removed owner from rowToProject mapping (Rule 1 cascading fix)
- `src/tui/components/projects-panel.tsx` - Replaced owner display with notifyRoutes summary, removed --owner hint
- `src/commands/init.ts` - Added interactive backend selection with numbered list and config validation
- `.planning/REQUIREMENTS.md` - Added 18 NBACK-* requirement definitions with traceability table

## Decisions Made
- Removed owner from db.ts rowToProject() as cascading fix since Project interface no longer has owner field (auto-fix, Rule 1)
- Adapted init interactive flow to show validateConfig() errors with config hint instead of prompting for requiredConfigKeys (method doesn't exist on NotifyBackend interface)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed owner from db.ts rowToProject mapping**
- **Found during:** Task 1 (owner removal from types)
- **Issue:** After removing `owner` from Project interface, `src/core/db.ts:310` still assigned `owner: row.owner` in the rowToProject function, causing TypeScript error TS2353
- **Fix:** Removed the `owner: row.owner,` line from the returned object in rowToProject()
- **Files modified:** src/core/db.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** a266bf2 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential cascading type fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gap closure plan complete
- All 3 verification gaps closed: owner removal, init detection, requirements traceability
- Ready for phase verification

---
*Phase: 101-modular-notification-backends*
*Completed: 2026-03-30*
