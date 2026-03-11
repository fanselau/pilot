---
phase: 57-pilot-notify-setup-must-be-optional-and-operator-friendly
plan: 01
subsystem: cli
tags: [notify, add, doctor, setup, optional-config, ux]

# Dependency graph
requires:
  - phase: 51-pilot-notifications-via-openclaw-agent-deliver
    provides: notify route resolution chain (resolveNotifyRoute, OpenClawDeliverRoute)
  - phase: 54-pilot-project-agent-notifications
    provides: project owner as notify fallback
provides:
  - Optional notify system — pilot add works without any notify config
  - Informational notify status in doctor --project
  - Clearer setup messaging about optional notifications
affects: [future onboarding flows, operator getting-started guides]

# Tech tracking
tech-stack:
  added: []
  patterns: [graceful-degradation-for-optional-features]

key-files:
  created: []
  modified:
    - src/commands/add.ts
    - src/commands/setup.ts
    - src/commands/doctor.ts
    - test/commands/add.test.ts
    - test/core/notify-route.test.ts

key-decisions:
  - "Notify is informational-only in doctor (warn, never fail)"
  - "No-notify path prints dim hint instead of hard error"
  - "Route resolution block guarded by resolvedNotifyKey !== undefined"

patterns-established:
  - "Optional feature pattern: graceful degradation with informational hints instead of hard errors"

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 57 Plan 01: Optional Notify System Summary

**pilot add succeeds without any notify config — notifications become a useful add-on instead of a blocking prerequisite**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T23:38:05Z
- **Completed:** 2026-03-11T23:42:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `pilot add` no longer exits with error when no notify config exists (no --notify, no env var, no project owner)
- Doctor project check shows notify status as informational warn (never fail)
- Setup messaging clearly states notifications are optional and explains what --owner does
- 4 new tests cover the no-notify-configured happy path
- All 925 tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Make pilot add tolerate missing notify + improve route resolution** - `c419e95` (feat)
2. **Task 2: Add informational notify doctor check + update tests** - `bd3bcc1` (feat)

## Files Created/Modified
- `src/commands/add.ts` — Remove hard error for missing notify; print dim info hint; guard route resolution
- `src/commands/setup.ts` — Replace dim hint with clearer optional-notify messaging
- `src/commands/doctor.ts` — Add Notify route informational check (pass/warn, never fail)
- `test/commands/add.test.ts` — Update 2 existing tests + add 4 new optional-notify tests
- `test/core/notify-route.test.ts` — Add clarifying comment about when resolveNotifyRoute is called

## Decisions Made
- Notify is informational-only in doctor (warn status, never fail) — missing notify should never block project health
- Route resolution block guarded by `resolvedNotifyKey !== undefined` (not just `!opts.noNotify`) — prevents calling resolveNotifyRoute when there's no notify intent at all
- Setup messaging uses "ℹ Notifications are optional." phrasing — makes clear this is not a missing step

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 01 complete, ready for 57-02-PLAN.md if it exists
- All notify-related behavior is now graceful and optional

---
*Phase: 57-pilot-notify-setup-must-be-optional-and-operator-friendly*
*Completed: 2026-03-11*
