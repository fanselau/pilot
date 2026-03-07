---
phase: 43-job-undo-and-recovery-checkpoints
plan: 02
subsystem: infra
tags: [git, recovery, runner, execa, vitest]

# Dependency graph
requires:
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: Recovery metadata columns and add-time allowDirtyStart intent wiring from 43-01
provides:
  - Reusable git recovery helper module for worktree, commit, relation, and diff checks
  - Runner launch preflight that refuses dirty worktrees by default with explicit force-dirty tradeoff copy
  - Base/head checkpoint capture persisted around execution lifecycle with no-commit safety
  - Focused regression tests for git helper behavior and runner recovery paths
affects: [43-03 undo-command, 43-04 recovery-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns: [typed git exit-code branching helpers, runner preflight safety gate before delegation, terminal-status checkpoint capture ordering]

key-files:
  created: [src/core/git-recovery.ts, test/core/git-recovery.test.ts, test/core/runner-recovery.test.ts]
  modified: [src/core/runner.ts]

key-decisions:
  - "Persist updateJobRecoveryStart before dirty refusal so attempted starts still record base + startedDirty metadata"
  - "Treat no-commit repos as valid by resolving HEAD to null via rev-parse --verify --quiet"
  - "Capture gitHeadCommit in both success and failure paths before markCompleted/markFailed"

patterns-established:
  - "Git recovery helpers return deterministic typed values (boolean/null/enum) for expected git exit codes"
  - "Runner preflight enforces clean-by-default with explicit allowDirtyStart escape hatch warning"

# Metrics
duration: 8min
completed: 2026-03-07
---

# Phase 43 Plan 02: Runner Clean-Worktree Preflight and Checkpoint Capture Summary

**Runner launch now enforces clean git starts by default, records recovery base/head checkpoints around execution, and preserves null-safe behavior for repositories without commits.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-07T22:38:20Z
- **Completed:** 2026-03-07T22:46:16Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added `src/core/git-recovery.ts` with reusable helpers for worktree detection, dirty checks, commit resolution, head relation classification, and changed file listing
- Integrated runner launch preflight checks to fail non-git targets, persist base/dirty start metadata, refuse dirty worktrees by default, and allow explicit `allowDirtyStart` starts with warning copy
- Added head checkpoint capture before terminal DB status updates in both success and failure paths
- Added focused unit tests for git helper exit-code behavior and runner recovery lifecycle behavior (dirty refusal, force-dirty allowance, base/head ordering, no-commit safety)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reusable git recovery helper module** - `cd4ff33` (feat)
2. **Task 2: Enforce runner preflight safety and record base/head checkpoints** - `6eacd7f` (feat)

## Files Created/Modified

- `src/core/git-recovery.ts` - centralized git safety/checkpoint helper APIs used by runner and upcoming undo flows
- `test/core/git-recovery.test.ts` - unit coverage for dirty checks, commit resolution, head relation, and diff parsing behavior
- `src/core/runner.ts` - execution-time clean-worktree guard, dirty-start handling, and base/head checkpoint capture integration
- `test/core/runner-recovery.test.ts` - regression coverage for dirty refusal, allowDirtyStart path, lifecycle call ordering, and no-commit behavior

## Decisions Made

- Performed recovery preflight inside the main launch try/catch so refusal states are captured through existing failure handling and project-block semantics
- Kept checkpoint-head capture best-effort but ordered before terminal status writes to preserve recovery metadata even when execution fails
- Standardized refusal/warning wording to explicitly call out commit/stash/discard actions and `--force-dirty` as weaker-recovery tradeoff

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for `43-03-PLAN.md`: undo command work can now rely on persisted base/head checkpoint metadata and deterministic git helper utilities
- Runner now records dirty-start attempt context needed for undo safety gates and status visibility

---
*Phase: 43-job-undo-and-recovery-checkpoints*
*Completed: 2026-03-07*
