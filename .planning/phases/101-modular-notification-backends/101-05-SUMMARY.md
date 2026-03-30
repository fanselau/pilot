---
phase: 101-modular-notification-backends
plan: 05
subsystem: notifications
tags: [web-ui, vitest, test-regression, notifyRoutes, owner-removal]

# Dependency graph
requires:
  - phase: 101-modular-notification-backends
    provides: NotifyBackend interface, 4 backends, registry, fan-out callback, NotifyRoute[] types, DB migration, CLI integration, notify subcommand
provides:
  - Web UI displaying notifyRoutes instead of owner in 3 components
  - Comprehensive test suite updated for modular notification backend model
  - Zero regressions from Phase 101 changes (all tests pass except pre-existing debug-lane failures)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NotifyRoute display: kind → human-readable label mapping in web UI components"
    - "ProjectWithStats includes notifyRoutes for web UI consumption"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/job-detail-query.ts
    - web/src/components/settings/section-projects.tsx
    - web/src/components/projects-list.tsx
    - web/src/routes/projects.$projectPath.tsx
    - test/core/notify-route.test.ts
    - test/core/db.test.ts
    - test/commands/add.test.ts
    - test/commands/project.test.ts
    - test/core/openclaw-deliver.test.ts (deleted)

key-decisions:
  - "Added notifyRoutes to ProjectWithStats type for web UI access"
  - "Removed legacy notify test sections testing old --owner/notifyOpenClawRoute model — replaced with modular backend tests"
  - "Pre-existing runner-debug-lane.test.ts failures (15) documented as out-of-scope"

patterns-established:
  - "Web UI route display: backend kind → label mapping (Kimaki, OpenClaw, Webhook, Telegram)"
  - "Route detail display in project detail: kind-specific formatting with session/channel/url/chatId"

requirements-completed: [NBACK-WEB-UI, NBACK-TESTS]

# Metrics
duration: 19min
completed: 2026-03-30
---

# Phase 101 Plan 05: Web UI Update & Comprehensive Tests Summary

**Web UI updated to display notifyRoutes instead of owner in 3 components, plus comprehensive test regression fixes for all modular notification backend changes — 1429 tests passing**

## Performance

- **Duration:** 19 min
- **Started:** 2026-03-30T11:54:14Z
- **Completed:** 2026-03-30T12:14:10Z
- **Tasks:** 2
- **Files modified:** 10 (+ 1 deleted)

## Accomplishments
- Updated ProjectWithStats type and query functions to include notifyRoutes field
- Replaced owner display with notification route labels/badges in all 3 web UI components
- Deleted openclaw-deliver.test.ts for removed module
- Rewrote notify-route.test.ts for new resolveNotifyRoutes (plural) API
- Fixed db.test.ts: registerProject single-arg, updateProjectNotifyRoutes, NotifyRoute[] types
- Fixed add.test.ts: 13-arg addJob calls, removed legacy owner/notify tests, added --notify-kimaki test
- Rewrote project.test.ts: removed owner/notifyOpenclaw tests, added route management tests
- Full test suite: 1429 passing, 15 pre-existing runner-debug-lane failures (unrelated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update web UI to display notifyRoutes instead of owner** - `1bf8189` (feat)
2. **Task 2: Write comprehensive tests and fix regressions** - `0760e20` (test)

## Files Created/Modified
- `src/core/types.ts` - Added notifyRoutes to ProjectWithStats interface
- `src/core/job-detail-query.ts` - Updated getProjectsWithStats/getProjectDetail to return notifyRoutes
- `web/src/components/settings/section-projects.tsx` - Replaced owner with notification route labels, header → "Notifications"
- `web/src/components/projects-list.tsx` - Replaced owner with backend kind badges (Badge components)
- `web/src/routes/projects.$projectPath.tsx` - Replaced Owner card with Notifications card showing route details
- `test/core/notify-route.test.ts` - Rewritten for resolveNotifyRoutes returning NotifyRoute[] arrays
- `test/core/db.test.ts` - Fixed registerProject single-arg, updateProjectNotifyRoutes, NotifyRoute[] types
- `test/commands/add.test.ts` - Fixed 13-arg addJob calls, added modular backend tests, removed legacy owner tests
- `test/commands/project.test.ts` - Rewritten for new project command interface (route management, no --owner)
- `test/core/openclaw-deliver.test.ts` - DELETED (module deleted in Plan 02)

## Decisions Made
- Added `notifyRoutes` to `ProjectWithStats` type and both query functions for web UI display
- Removed all legacy notify test sections testing the old `--owner`/`notifyOpenClawRoute` model — replaced with tests for the new modular backend model
- Pre-existing runner-debug-lane.test.ts failures (15 tests) documented as out-of-scope — unrelated to notification backends

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added notifyRoutes to ProjectWithStats type**
- **Found during:** Task 1 (web UI update)
- **Issue:** ProjectWithStats did not include notifyRoutes field — web UI components couldn't access it
- **Fix:** Added notifyRoutes to ProjectWithStats type and both getProjectsWithStats/getProjectDetail query functions
- **Files modified:** src/core/types.ts, src/core/job-detail-query.ts
- **Verification:** npx tsc --noEmit passes, web UI components compile
- **Committed in:** 1bf8189 (Task 1 commit)

**2. [Rule 3 - Blocking] Added loadConfigFile to add.test.ts config mock**
- **Found during:** Task 2 (test fixes)
- **Issue:** add.test.ts config mock didn't export loadConfigFile, causing getEnabledBackends() to crash
- **Fix:** Added loadConfigFile and _resetConfigCache to the vi.mock factory
- **Files modified:** test/commands/add.test.ts
- **Verification:** All 46 add tests pass
- **Committed in:** 0760e20 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered
- Pre-existing runner-debug-lane.test.ts has 15 failing tests — these are unrelated to the notification backend work and exist on the current branch before this plan. Not addressed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 101 (modular notification backends) is complete with all 5 plans done
- Web UI displays notification routes, comprehensive tests pass, no remaining references to deprecated APIs
- Ready for phase verification

## Self-Check: PASSED

All modified files verified on disk. Both commits (1bf8189, 0760e20) verified in git log.

---
*Phase: 101-modular-notification-backends*
*Completed: 2026-03-30*
