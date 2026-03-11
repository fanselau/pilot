---
phase: 51-pilot-notifications-via-openclaw-agent-deliver
plan: 01
subsystem: api
tags: [openclaw, notifications, sqlite, routing, vitest]

# Dependency graph
requires:
  - phase: 50-setup-refresh-mode-and-fast-skill-installation
    provides: project/job notification intent capture and callback fields used for route resolution
provides:
  - typed OpenClaw deliver route model on Project and Job records
  - SQLite persistence for structured project route and per-job route snapshot
  - strict structured-first notify route resolver with explicit configuration errors
affects: [51-02-PLAN, 51-03-PLAN, callback delivery transport]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - structured-first route resolution (job snapshot -> project route -> strict legacy derive)
    - safe JSON parsing for persisted route blobs with null fallback

key-files:
  created:
    - src/core/notify-route.ts
    - test/core/notify-route.test.ts
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - test/core/db.test.ts

key-decisions:
  - "Legacy derivation accepts only known `agent:<agentId>:<channel>:(group|channel|thread|topic):<target>` shapes."
  - "Route resolution returns explicit error codes instead of falling back to loose guesses."

patterns-established:
  - "Route persistence pattern: JSON text columns with runtime-safe parse guards"
  - "Notify resolver boundary: deterministic result object with source + error metadata"

# Metrics
duration: 4 min
completed: 2026-03-10
---

# Phase 51 Plan 01: Route foundation Summary

**Structured OpenClaw deliver routes now persist on projects/jobs and resolve deterministically before runtime delivery.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-10T16:07:53Z
- **Completed:** 2026-03-10T16:12:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added canonical `OpenClawDeliverRoute` type and attached it to `Project.notifyOpenClawRoute` and `Job.notifyRoute`.
- Added DB support for `projects.notify_openclaw_route` and `jobs.notify_route` with safe parse behavior for malformed stored JSON.
- Implemented `src/core/notify-route.ts` with strict resolver precedence and explicit route configuration errors.
- Added focused tests for route persistence/round-trip and resolver behavior across structured, legacy group/DM, and invalid inputs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed route model and SQLite persistence for structured notify routes** - `ac9616e` (feat)
2. **Task 2: Implement strict route resolver (structured first, legacy derive second)** - `2b6d993` (feat)

**Plan metadata:** skipped (`.planning/` is gitignored in this repo)

## Files Created/Modified
- `src/core/types.ts` - Added `OpenClawDeliverRoute` plus `notifyRoute`/`notifyOpenClawRoute` fields on core models.
- `src/core/db.ts` - Added route columns migration, route parse guards, job-route insert support, and project route update helper.
- `test/core/db.test.ts` - Added route persistence and malformed JSON fallback tests for projects/jobs.
- `src/core/notify-route.ts` - New strict route validator/deriver/resolver module with explicit error codes.
- `test/core/notify-route.test.ts` - New resolver tests for structured, legacy group/DM, invalid legacy, and precedence.

## Decisions Made
- Restricted safe legacy derivation to explicit known agent session-key shapes; plain values like `main` are treated as ambiguous config.
- Resolver returns `ok/error` results with explicit codes so callback/CLI can surface actionable failures without guessing.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Route typing, storage, and deterministic resolution are in place for transport rewrite work.
- Ready for `51-02-PLAN.md` (runtime `openclaw agent --deliver` integration) and `51-03-PLAN.md` (CLI/add route management wiring).

---
*Phase: 51-pilot-notifications-via-openclaw-agent-deliver*
*Completed: 2026-03-10*
