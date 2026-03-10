---
phase: 51-pilot-notifications-via-openclaw-agent-deliver
plan: 03
subsystem: cli
tags: [openclaw, notifications, commander, routing, vitest]

# Dependency graph
requires:
  - phase: 51-pilot-notifications-via-openclaw-agent-deliver
    provides: structured route model, strict resolver, and runtime OpenClaw deliver transport from 51-01/51-02
provides:
  - project-level CLI route management for OpenClaw delivery targets
  - queue-time notify route snapshots on jobs for deterministic runtime delivery
  - early validation for mismatched and ambiguous notify configuration
affects: [project route operations, add-command notify behavior, callback delivery determinism]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - strict route-flag gate in project command (set/clear with explicit required fields)
    - add-command route-first snapshot flow (resolve before queue write)

key-files:
  created: []
  modified:
    - src/commands/project.ts
    - src/index.ts
    - test/commands/project.test.ts
    - src/commands/add.ts
    - test/commands/add.test.ts

key-decisions:
  - "Project route fields are only accepted behind --notify-openclaw and cannot be mixed with owner/block actions."
  - "addCommand fails fast on explicit --notify vs configured route-agent mismatches instead of silently accepting ambiguous targets."

patterns-established:
  - "Project output pattern: always expose configured notify route or explicit none-configured state"
  - "Queue snapshot pattern: persist resolved OpenClaw route per job to decouple runtime delivery from later project edits"

# Metrics
duration: 7 min
completed: 2026-03-10
---

# Phase 51 Plan 03: CLI route management and snapshot wiring Summary

**Pilot now supports explicit per-project OpenClaw route configuration and snapshots resolved delivery routes onto queued jobs with strict mismatch/ambiguity guardrails.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-10T16:16:17Z
- **Completed:** 2026-03-10T16:23:51Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `pilot project` route-management flags (`--notify-openclaw`, route fields, and `--clear-notify-openclaw`) with shared validator enforcement.
- Updated project command output (human and JSON) to always show structured notify route state (configured route or explicit none configured).
- Updated `pilot add` to resolve notify routes before queue writes and persist `notifyRoute` snapshots in `addJob`.
- Added strict add-command guardrails for mismatched explicit `--notify` values and non-derivable legacy notify targets.
- Expanded project/add command tests to cover route set/show/clear, route snapshots, mismatch rejection, and ambiguous legacy rejection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add project-level CLI management for structured OpenClaw delivery route** - `4481a5a` (feat)
2. **Task 2: Snapshot resolved notify route in add-command queue flow** - `be361ae` (feat)

**Plan metadata:** pending (recorded in final docs commit)

## Files Created/Modified
- `src/commands/project.ts` - Added route set/clear flag handling, shared route validation, DB persistence call, and route-aware display output.
- `src/index.ts` - Wired new `pilot project` route flags.
- `test/commands/project.test.ts` - Added set/clear/partial-error/json-route coverage for project route management.
- `src/commands/add.ts` - Added route resolution snapshot flow, mismatch checks, and actionable failure messages before queue writes.
- `test/commands/add.test.ts` - Added notify route snapshot, mismatch guard, and ambiguous legacy rejection coverage.

## Decisions Made
- Enforced a strict route-management UX: route-field flags require `--notify-openclaw` and cannot be mixed with unrelated project mutations in one command.
- Kept queue-time notify-key precedence unchanged while adding route snapshot enforcement so delivery routing is deterministic per queued job.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 51 now has route model/persistence, runtime transport, and operator CLI/add wiring complete.
- Phase complete, ready for milestone transition.

---
*Phase: 51-pilot-notifications-via-openclaw-agent-deliver*
*Completed: 2026-03-10*
