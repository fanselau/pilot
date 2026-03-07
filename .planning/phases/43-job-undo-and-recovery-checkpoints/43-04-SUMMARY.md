---
phase: 43-job-undo-and-recovery-checkpoints
plan: 04
subsystem: ui
tags: [undo, recovery, status, info, tui, docs, vitest]

# Dependency graph
requires:
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: Runner checkpoint metadata and dirty-start preflight behavior from 43-02
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: Guarded undo outcomes and refusal semantics from 43-03
provides:
  - Recovery safety visibility in `pilot status` and `pilot info` (human + JSON)
  - TUI detail-header recovery line with safe/guarded/unavailable state and concise reason
  - Release-facing docs for guarded undo and `--force-dirty` versus undo `--force`
affects: [operator-recovery-workflows, launch-docs, undo-troubleshooting]

# Tech tracking
tech-stack:
  added: []
  patterns: [metadata-first recovery tags, single-job live relation checks in info command, shared header visibility contract for TUI]

key-files:
  created: [test/commands/info.test.ts]
  modified: [src/commands/status.ts, src/commands/info.ts, src/tui/views/detail.tsx, test/commands/status.test.ts, test/tui/detail-header.test.ts, README.md, docs/GETTING-STARTED.md]

key-decisions:
  - "Status command uses lightweight metadata-derived tags and exposes newer-work guards only when known from stored job context"
  - "Info command computes live recovery relation for one job and emits a stable recovery object without removing existing JSON keys"
  - "TUI detail header prioritizes concise one-line recovery labeling over verbose prose for scanability"

patterns-established:
  - "Undo visibility contract: safe vs guarded vs unavailable is explicit in CLI status/info and TUI header"
  - "Docs language mirrors runtime guardrails: clean default, force-dirty tradeoff, guarded undo force semantics"

# Metrics
duration: 8min
completed: 2026-03-07
---

# Phase 43 Plan 04: Recovery Visibility and Docs Alignment Summary

**Recovery safety state is now visible across status/info/TUI surfaces, with docs updated to clearly explain clean-default execution, guarded undo, and `--force-dirty` tradeoffs.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-07T23:03:01Z
- **Completed:** 2026-03-07T23:11:47Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- Added recovery tags to `pilot status` output and JSON recovery metadata map so operators can spot `undo:safe`, guarded, and unavailable states at a glance
- Added a dedicated `Recovery` section to `pilot info <id>` plus JSON `recovery` object with base/head/current commits, dirty flags, relation checks, and actionable guidance (including newer-work and diverged guards)
- Updated TUI detail header to include concise recovery metadata (base/head + safety reason) and expanded regression tests for safe, guarded, and unavailable variants
- Updated README and Getting Started docs with `pilot undo` coverage, `pilot add --force-dirty` behavior, and recovery troubleshooting guidance aligned with runtime safety rules

## Task Commits

Each task was committed atomically:

1. **Task 1: Add recovery state visibility to CLI status and info outputs** - `ffa0135` (feat)
2. **Task 2: Add concise recovery metadata to TUI detail header** - `01fd31f` (feat)
3. **Task 3: Update docs/help copy and run regression verification** - `b82a6e4` (docs)

## Files Created/Modified

- `src/commands/status.ts` - recovery tag derivation for rows plus JSON recovery map
- `src/commands/info.ts` - recovery analysis pipeline and dedicated human/JSON recovery output block
- `test/commands/status.test.ts` - regression assertions for safe/guarded/unavailable tags including newer-work-known guard
- `test/commands/info.test.ts` - new coverage for recovery block rendering and JSON recovery shape
- `src/tui/views/detail.tsx` - recovery header helper and rendered recovery line in detail metadata panel
- `test/tui/detail-header.test.ts` - updated line-count contract and recovery-state assertions across widths
- `README.md` - CLI reference updates for `pilot undo` and `--force-dirty`, plus safe/refused undo examples
- `docs/GETTING-STARTED.md` - recovery safety model, `--force-dirty` vs `--force`, and refusal troubleshooting matrix

## Decisions Made

- Kept `status` inexpensive by deriving recovery tags from persisted metadata and known error context rather than per-row git graph calls
- Added live git relation checks only in `info` (single job) to surface explicit newer-work/diverged guidance where accurate runtime context is available
- Standardized recovery wording across CLI/TUI/docs around three operator states: safe, guarded, unavailable

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 43 visibility and docs requirements are complete; operators now see recovery state before invoking undo
- Runtime behavior and release docs are aligned around guarded undo semantics and `--force-dirty` tradeoffs

---
*Phase: 43-job-undo-and-recovery-checkpoints*
*Completed: 2026-03-07*
