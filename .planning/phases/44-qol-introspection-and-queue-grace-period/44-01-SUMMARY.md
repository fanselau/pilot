---
phase: 44-qol-introspection-and-queue-grace-period
plan: 01
subsystem: infra
tags: [queue, grace-period, config, sqlite, cli, vitest]

# Dependency graph
requires:
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: Recovery-era queue/job metadata and status surfaces used as the baseline for Phase 44
provides:
  - Queue grace period configuration contract (`queueGraceSeconds`) with env/config/default precedence
  - Persisted per-job grace bypass metadata (`skipGracePeriod`) in DB schema and row mapping
  - `pilot config` support for showing/setting/getting `runner.queueGraceSeconds`
affects: [44-02-launch-eligibility-gate, queue-scheduling, operator-config-ux]

# Tech tracking
tech-stack:
  added: []
  patterns: [config precedence with explicit source tracking, additive sqlite migrations for queue metadata, config command dot-key parity with core config]

key-files:
  created: []
  modified: [src/core/types.ts, src/core/db.ts, src/core/config.ts, src/commands/config.ts, test/core/db.test.ts, test/core/config.test.ts]

key-decisions:
  - "Default queue grace period is 120 seconds; 0 explicitly disables the grace gate"
  - "Per-job grace bypass is persisted as skip_grace_period INTEGER with backward-compatible default 0"
  - "runner.queueGraceSeconds is surfaced as a first-class config key across init/show/set/get"

patterns-established:
  - "Queue grace primitives first: config + schema contracts land before eligibility behavior changes"
  - "New config values must include validation, env/config/default resolution, and source tracking together"

# Metrics
duration: 3min
completed: 2026-03-08
---

# Phase 44 Plan 01: Grace Config and Schema Foundation Summary

**Queue grace period is now a resolved config contract and per-job bypass intent is persisted in SQLite, establishing the primitives required for launch gating in the next plan.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T00:09:42Z
- **Completed:** 2026-03-08T00:13:32Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- Added `queueGraceSeconds` to shared config contracts and resolved it via `PILOT_QUEUE_GRACE_SECONDS` > config file > default `120`
- Added persisted `skipGracePeriod` metadata to jobs (`skip_grace_period` column + migration) and wired row/add mapping so new and existing jobs round-trip cleanly
- Extended `pilot config` surfaces so operators can initialize, show, set, and get `runner.queueGraceSeconds` without editing JSON manually
- Added regression coverage for DB persistence/mapping and config validation/precedence (including explicit `0` disable and negative rejection)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add grace-period fields to shared types and DB schema** - `00de81e` (feat)
2. **Task 2: Add layered config resolution for queue grace seconds** - `0bb24ab` (feat)
3. **Task 3: Expose queue grace setting in `pilot config` surfaces** - `84e20b9` (feat)

## Files Created/Modified

- `src/core/types.ts` - Added `queueGraceSeconds` and `skipGracePeriod` shared contracts
- `src/core/db.ts` - Added `skip_grace_period` schema/migration plus mapping and insert support
- `src/core/config.ts` - Added queue grace resolution, validation, and config-source mapping
- `src/commands/config.ts` - Added `runner.queueGraceSeconds` to config init/show/set/get flows
- `test/core/db.test.ts` - Added persistence and mapping assertions for `skipGracePeriod`
- `test/core/config.test.ts` - Added queue grace validation and precedence regression tests

## Decisions Made

- Kept grace configuration additive and centralized in existing runner config namespace (`runner.queueGraceSeconds`) to avoid introducing a parallel settings surface
- Used additive SQLite migration for `skip_grace_period` with default `0` so existing jobs remain backward-compatible and map to `false`
- Allowed `0` as explicit grace disable while rejecting negative values in config validation to keep semantics clear and safe

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 44-01 primitives are complete: queue grace config and persisted per-job bypass intent are now stable contracts
- Ready for `44-02-PLAN.md` to wire grace checks into launch eligibility and add queue-time override UX

---
*Phase: 44-qol-introspection-and-queue-grace-period*
*Completed: 2026-03-08*
