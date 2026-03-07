---
phase: 43-job-undo-and-recovery-checkpoints
plan: 01
subsystem: database
tags: [sqlite, jobs, recovery, cli, commander, vitest]

# Dependency graph
requires:
  - phase: 42-release-hardening-config-isolation-install-story-and-changelog
    provides: Stable add-command and test baseline before recovery metadata changes
provides:
  - Job schema + type contract for recovery checkpoint metadata
  - Queue-time `--force-dirty` intent plumbing into persisted `allowDirtyStart`
  - Regression coverage for DB mapping/helpers and add command wiring
affects: [43-02 runner-preflight, 43-03 undo-command, 43-04 recovery-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns: [additive sqlite migrations, queue-time safety intent flags]

key-files:
  created: []
  modified: [src/core/types.ts, src/core/db.ts, src/index.ts, src/commands/add.ts, test/core/db.test.ts, test/commands/add.test.ts]

key-decisions:
  - "allowDirtyStart remains queue-time intent and is persisted directly from add options"
  - "startedDirty/gitBaseCommit/gitHeadCommit are attempt metadata updated via dedicated DB helpers"

patterns-established:
  - "Recovery metadata is additive with default-safe columns for existing rows"
  - "force-dirty warning copy is emitted in human output at queue time"

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 43 Plan 01: Recovery Metadata Foundation

**Additive job recovery metadata (base/head commit + dirty-start flags) is now persisted end-to-end, with `pilot add --force-dirty` captured as explicit queue-time intent.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T22:29:26Z
- **Completed:** 2026-03-07T22:34:00Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Extended the `Job` type and DB row mapping with `gitBaseCommit`, `gitHeadCommit`, `allowDirtyStart`, and `startedDirty`
- Added migration-safe jobs table columns and exported helper updates (`updateJobRecoveryStart`, `updateJobRecoveryHead`) for downstream runner/undo work
- Wired `pilot add --force-dirty` through CLI -> command -> DB insert and added focused regression tests for default/forced paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Job schema/types for checkpoint and dirty-start metadata** - `5298196` (feat)
2. **Task 2: Add `pilot add --force-dirty` and persist queue-time intent** - `3c26300` (feat)

## Files Created/Modified

- `src/core/types.ts` - adds recovery metadata fields to the shared `Job` contract
- `src/core/db.ts` - adds schema/migrations, boolean mapping, addJob plumbing, and recovery metadata helper updates
- `test/core/db.test.ts` - adds coverage for defaults, persistence, and helper update behavior
- `src/index.ts` - adds `pilot add --force-dirty` CLI option
- `src/commands/add.ts` - passes `forceDirty` to DB and emits explicit warning text in human output
- `test/commands/add.test.ts` - updates add-job call expectations and adds force-dirty persistence/warning coverage

## Decisions Made

- Added `allow_dirty_start` as a defaulted DB column so existing rows remain backward-compatible without data migration scripts
- Kept `--force` behavior unchanged and introduced `--force-dirty` as a separate intent flag to avoid semantic coupling
- Stored attempt recovery updates behind explicit DB helper functions to keep runner and undo call sites simple

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for `43-02-PLAN.md`: runner can now persist execution-time base/head checkpoints and dirty-start state against existing job records
- Add command path already persists queue-time intent (`allowDirtyStart`) for preflight enforcement logic

---
*Phase: 43-job-undo-and-recovery-checkpoints*
*Completed: 2026-03-07*
