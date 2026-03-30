---
phase: 101-modular-notification-backends
plan: 02
subsystem: notifications
tags: [promise-allsettled, fan-out, notify-route, db-migration, config-schema]

# Dependency graph
requires:
  - phase: 101-modular-notification-backends
    provides: NotifyBackend interface, 4 backend implementations, backend registry
provides:
  - Fan-out notification delivery via Promise.allSettled in callback.ts
  - NotifyRoute[] types on Job.notifyRoute and Project.notifyRoutes
  - resolveNotifyRoutes returning NotifyRoute arrays with backward compat
  - DB migration for projects.notify_routes column
  - Config schema with nested backend config sections
  - parseNotifyRoutes backward-compat parser for legacy single-object routes
affects: [pilot-add-integration, pilot-project-integration, pilot-notify-cli, owner-removal, pilot-init]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.allSettled fan-out for multi-backend notification delivery"
    - "parseNotifyRoutes backward-compat: single-object → [route] wrapping"
    - "Nested config fallback: notifications.openclaw.hooksUrl ?? notifications.openclawHooksUrl"
    - "DB owner→routes migration via json_array/json_object SQL"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/core/config.ts
    - src/core/notify-route.ts
    - src/core/callback.ts
    - src/commands/config.ts
    - test/core/callback.test.ts

key-decisions:
  - "Job.notifyRoute changed from OpenClawDeliverRoute|null to NotifyRoute[]|null"
  - "Project.notifyOpenClawRoute → Project.notifyRoutes: NotifyRoute[]|null"
  - "registerProject simplified to single-arg (owner param removed)"
  - "updateProjectOwner and updateProjectNotifyOpenClawRoute → updateProjectNotifyRoutes"
  - "Legacy single-object routes automatically wrapped in arrays by parseNotifyRoutes"
  - "Owner→routes DB migration is best-effort with empty channel/to fields"

patterns-established:
  - "resolveNotifyRoutes: job→project→legacy fallback returning NotifyRoute[]"
  - "callback.ts fan-out: Promise.allSettled with per-backend success/failure logging"
  - "Config schema: nested backend sections with legacy flat field fallback"

requirements-completed: [NBACK-ROUTE-REFACTOR, NBACK-CALLBACK-FANOUT, NBACK-TYPE-CHANGES, NBACK-DB-MIGRATION, NBACK-CONFIG-SCHEMA]

# Metrics
duration: 7min
completed: 2026-03-30
---

# Phase 101 Plan 02: Core Pipeline Refactor — Types, Routes, Fan-Out Delivery Summary

**Fan-out notification delivery via Promise.allSettled with NotifyRoute[] types, DB migration for project notify_routes, and backward-compat route parsing — openclaw-deliver.ts deleted, 20 tests passing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T11:34:03Z
- **Completed:** 2026-03-30T11:41:26Z
- **Tasks:** 2
- **Files modified:** 7 (+ 1 deleted)

## Accomplishments
- Rewrote callback.ts to fan out notifications to multiple backends via Promise.allSettled with per-backend logging
- Updated Job.notifyRoute and Project.notifyRoutes to NotifyRoute[] for multi-backend support
- Added DB migration for projects.notify_routes column with owner→routes conversion
- Refactored notify-route.ts to return NotifyRoute[] arrays with legacy backward compat
- Deleted openclaw-deliver.ts — all logic now in notify-backends/openclaw.ts
- Extended config schema with nested backend config sections and legacy flat field fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Update types, DB migration, config schema, and route resolution** - `1ea49eb` (feat)
2. **Task 2: Rewrite callback.ts for fan-out delivery and delete openclaw-deliver.ts** - `132d107` (feat)

## Files Created/Modified
- `src/core/types.ts` - Job.notifyRoute→NotifyRoute[], Project.notifyRoutes, @deprecated annotations, ConfigFileSchema.notifications nested shape
- `src/core/db.ts` - parseNotifyRoutes, notify_routes migration, registerProject(path), updateProjectNotifyRoutes
- `src/core/config.ts` - CONFIG_FILE_MAP with nested backend config paths and legacy fallback
- `src/core/notify-route.ts` - resolveNotifyRoutes returning NotifyRoute[], deriveRouteFromLegacyValue returning NotifyRoute|null
- `src/core/callback.ts` - Fan-out via Promise.allSettled, getBackend registry lookup, resolveNotifyRoutes plural
- `src/core/openclaw-deliver.ts` - DELETED (logic moved to notify-backends/openclaw.ts in Plan 01)
- `src/commands/config.ts` - CONFIG_FIELD_SPECS with notifications.backends and nested backend config paths, getDefaultConfigFileContent updated
- `test/core/callback.test.ts` - Rewritten for fan-out: mocks resolveNotifyRoutes and getBackend, tests multi-backend success/fail/error scenarios

## Decisions Made
- Changed Job.notifyRoute from single OpenClawDeliverRoute to NotifyRoute[] array for multi-backend fan-out
- Project.notifyOpenClawRoute replaced with Project.notifyRoutes (backend-agnostic)
- registerProject simplified to single-arg — owner is no longer a registration concept
- parseNotifyRoutes handles both legacy single-object `{kind:...}` and new array `[{kind:...}]` formats
- Owner→routes DB migration uses json_array/json_object with empty channel/to (best-effort)
- Config reads nested paths first then falls back to legacy flat fields (no auto-rewrite)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Consumer files (add.ts, project.ts, setup.ts, doctor.ts) have type errors from the updated types — these are expected and will be fixed in subsequent plans per the plan's acceptance criteria note.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core notification pipeline fully wired: types → routes → fan-out delivery → backend registry
- Ready for Plan 03 (CLI integration: pilot add flags, pilot project routes, pilot notify commands)
- Consumer type errors in commands/ files will be resolved in subsequent plans

## Self-Check: PASSED

All 6 modified files verified on disk. openclaw-deliver.ts confirmed deleted. Both commits (1ea49eb, 132d107) verified in git log.

---
*Phase: 101-modular-notification-backends*
*Completed: 2026-03-30*
