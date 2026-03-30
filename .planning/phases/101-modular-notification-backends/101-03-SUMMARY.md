---
phase: 101-modular-notification-backends
plan: 03
subsystem: notifications
tags: [cli-flags, notify-routes, owner-removal, multi-backend]

# Dependency graph
requires:
  - phase: 101-modular-notification-backends
    provides: NotifyBackend interface, 4 backend implementations, registry, fan-out callback, NotifyRoute[] types, DB migration
provides:
  - Multi-backend --notify-* flags on pilot add (kimaki, webhook, telegram)
  - Enabled backend validation with per-backend defaults
  - Project route management via --notify-kimaki-channel/--notify-webhook/--notify-telegram/--clear-notify
  - Hard removal of all --owner flags and project.owner references from CLI
  - Backend-based doctor notify health check
affects: [pilot-notify-cli, pilot-init, web-ui-owner-removal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-backend enabled validation at queue time with fallback to project routes and config defaults"
    - "Route management via filter-and-replace pattern in project command"

key-files:
  created: []
  modified:
    - src/commands/add.ts
    - src/commands/project.ts
    - src/commands/setup.ts
    - src/commands/projects.ts
    - src/commands/doctor.ts
    - src/commands/unblock.ts
    - src/core/runner.ts
    - src/index.ts

key-decisions:
  - "Legacy --notify <agentId> derives openclaw route via deriveRouteFromLegacyValue at queue time"
  - "Enabled backend validation errors with helpful per-backend messages and --no-notify opt-out"
  - "PILOT_DEFAULT_NOTIFY deprecation warning instead of hard removal for backward compat"
  - "Owner removal is hard — no deprecation warnings, just delete all references"
  - "Project route updates use filter-and-replace pattern (remove same-kind, push new)"

patterns-established:
  - "Multi-backend flag collection: each --notify-* flag pushes to notifyRoutes array"
  - "Backend default resolution: project routes → config defaults → error"

requirements-completed: [NBACK-ADD-INTEGRATION, NBACK-PROJECT-INTEGRATION, NBACK-OWNER-REMOVAL]

# Metrics
duration: 6min
completed: 2026-03-30
---

# Phase 101 Plan 03: CLI Integration — Multi-Backend Flags, Project Route Management, Owner Removal Summary

**Multi-backend --notify-* flags on pilot add with enabled backend validation, project route management via --notify-kimaki-channel/--notify-webhook/--notify-telegram, and hard removal of all --owner flags from 8 CLI files**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T11:45:13Z
- **Completed:** 2026-03-30T11:51:56Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added --notify-kimaki, --notify-webhook, --notify-telegram flags to pilot add with enabled backend validation
- Rewrote project.ts with multi-backend route management (add/replace/clear routes)
- Hard-removed all --owner flags and project.owner references from setup, project, projects, doctor, unblock, runner, index.ts
- Updated doctor.ts with backend-based notify health check (pass/warn/info states)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update pilot add with multi-backend notification flags** - `0e5b8a5` (feat)
2. **Task 2: Update project/setup/projects/doctor/unblock commands — owner removal + route management** - `2d1eade` (feat)

## Files Created/Modified
- `src/commands/add.ts` - Multi-backend --notify-* flag handling, enabled backend validation, PILOT_DEFAULT_NOTIFY deprecation
- `src/commands/project.ts` - Complete rewrite: owner removed, multi-backend route management via --notify-* flags
- `src/commands/setup.ts` - Owner param removed, hint text updated
- `src/commands/projects.ts` - Owner display replaced with notify routes display
- `src/commands/doctor.ts` - Owner-based check replaced with backend-based check
- `src/commands/unblock.ts` - Removed --owner hint from error message
- `src/core/runner.ts` - Removed owner fallback notification, updated unregistered project warning
- `src/index.ts` - Added --notify-kimaki/--notify-webhook/--notify-telegram to add command, removed --owner from setup and project, added project route flags

## Decisions Made
- Legacy `--notify <agentId>` derives openclaw route via `deriveRouteFromLegacyValue` — preserves backward compat during transition
- Enabled backend validation at queue time errors with per-backend help messages showing flag or config default needed
- `PILOT_DEFAULT_NOTIFY` gets deprecation warning (not hard removed) since existing users may rely on it
- Owner removal is hard — no deprecation period, just remove all references since it's replaced by notifyRoutes
- Project route updates use filter-and-replace: remove existing routes of same kind, push new route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI integration complete — pilot add and project commands support multi-backend notification model
- Ready for Plan 04 (pilot notify CLI subcommand) and Plan 05 (pilot init update)
- Web UI files still reference project.owner — will be updated in a future plan

## Self-Check: PASSED

All 8 modified files verified on disk. Both commits (0e5b8a5, 2d1eade) verified in git log.

---
*Phase: 101-modular-notification-backends*
*Completed: 2026-03-30*
