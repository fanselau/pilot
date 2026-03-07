---
phase: 43-job-undo-and-recovery-checkpoints
plan: 03
subsystem: infra
tags: [undo, git, recovery, commander, vitest]

# Dependency graph
requires:
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: Runner-captured git base/head checkpoints with dirty-start metadata from 43-02
provides:
  - First-class `pilot undo <id>` CLI command wired in the primary command surface
  - Guarded undo pipeline with dry-run preview, conservative refusals, and deterministic reset path
  - Regression test coverage for guarded history, dirty-start, unresolved checkpoint, and JSON/human output branches
affects: [43-04 recovery-visibility, operator-recovery-workflows]

# Tech tracking
tech-stack:
  added: []
  patterns: [guarded undo safety pipeline, dry-run-before-destructive-mutation, force-overrides-limited-to-explicit-guards]

key-files:
  created: [src/commands/undo.ts, test/commands/undo.test.ts]
  modified: [src/index.ts]

key-decisions:
  - "Treat pending/running jobs as non-undoable and require terminal status before rollback"
  - "Keep dirty worktree refusal non-overridable even with --force on destructive path"
  - "Use null-safe base/head delta check so no-delta jobs return explicit nothing-to-undo outcome"

patterns-established:
  - "Undo guard ordering: metadata validation -> history relation checks -> destructive execution"
  - "Force behavior is explicit and narrow: guarded-history + dirty-start only"

# Metrics
duration: 8min
completed: 2026-03-07
---

# Phase 43 Plan 03: Guarded Undo Command Summary

**`pilot undo <id>` now ships with a conservative safety pipeline, dry-run rollback previews, and deterministic `git reset --hard <base>` execution only when guard checks pass.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-07T22:50:48Z
- **Completed:** 2026-03-07T22:59:19Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- Wired `pilot undo <id>` into `src/index.ts` with `--dry-run` and `--force` flags and dedicated command routing
- Implemented `src/commands/undo.ts` as a guarded undo engine: checkpoint checks, relation classification, dirty/dirty-start safety gates, and reset execution
- Added `test/commands/undo.test.ts` with coverage for safe paths, refusal paths, force overrides, dry-run non-mutation, idempotency, and JSON/human output branches

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire `pilot undo` into CLI surface** - `7fe29f1` (feat)
2. **Task 2: Implement guarded undo pipeline with dry-run preview** - `5aef330` (feat)
3. **Task 3: Add undo safety regression coverage** - `c317a9f` (test)

## Files Created/Modified

- `src/index.ts` - command registration for `pilot undo <id>` with `--dry-run` and `--force` options
- `src/commands/undo.ts` - full guarded undo flow, force policy, dry-run preview, and deterministic reset execution
- `test/commands/undo.test.ts` - regression suite for safe, refused, and override branches in both output modes

## Decisions Made

- Used a strict terminal-status gate for undo to prevent rollback against active queue state
- Preserved the conservative safety model by refusing dirty destructive undo even with `--force`
- Implemented force override for guarded history (`newer-work-exists`/`diverged`) and dirty-start paths only, with explicit warning output

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for `43-04-PLAN.md`: visibility surfaces can now consume stable undo outcomes and guard semantics from the new command
- Recovery model now includes explicit operator-facing refusal/override behavior for unsafe rollback paths

---
*Phase: 43-job-undo-and-recovery-checkpoints*
*Completed: 2026-03-07*
