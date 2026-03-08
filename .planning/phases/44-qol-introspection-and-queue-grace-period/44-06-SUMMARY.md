---
phase: 44-qol-introspection-and-queue-grace-period
plan: 06
subsystem: cli
tags: [guardrails, copy, undo, runner, vitest]

# Dependency graph
requires:
  - phase: 44-qol-introspection-and-queue-grace-period
    provides: shared JobWhy wording conventions from 44-03 used for concise what/why/next guidance
  - phase: 43-job-undo-and-recovery-checkpoints
    provides: clean-start launch guard and undo safety rules whose copy is hardened in this plan
provides:
  - Dirty-worktree launch refusal now explains what happened, why start is blocked, and explicit next actions with `--force-dirty` tradeoff
  - Undo safety refusals for newer-work, diverged history, dirty-start, and dirty-current-worktree paths now use consistent plain-language what/why/next structure
  - Regression assertions that lock guardrail refusal wording contracts for runner and undo flows
affects: [44-05-tui-recovery-copy-visibility, operator-recovery-triage]

# Tech tracking
tech-stack:
  added: []
  patterns: [what-why-next guardrail copy contract, explicit force-flag tradeoff wording for safety bypasses]

key-files:
  created: []
  modified: [src/core/runner.ts, src/commands/undo.ts, test/core/runner-recovery.test.ts, test/commands/undo.test.ts]

key-decisions:
  - "Dirty-start launch refusal copy includes command-level next actions and frames --force-dirty as a speed-vs-recovery tradeoff"
  - "Undo guard refusals share one what/why/next style across newer-work, diverged, dirty-start, and dirty-worktree branches"

patterns-established:
  - "Guardrails explain actionability first: what happened, why blocked, then concrete next command/action"
  - "Force-flag guidance is explicit about safety boundaries and non-bypass guards"

# Metrics
duration: 2min
completed: 2026-03-08
---

# Phase 44 Plan 06: Guardrail Refusal Copy Hardening Summary

**Dirty-start launch and guarded undo refusals now consistently deliver concise what/why/next guidance with explicit command actions and force-override tradeoff boundaries.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T00:39:11Z
- **Completed:** 2026-03-08T00:41:55Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Hardened runner dirty-worktree refusal copy to clearly explain launch refusal, clean-start safety rationale, and next actions (commit/stash/discard) with `--force-dirty` tradeoff guidance
- Normalized undo refusal/help copy across guarded history and dirty-state branches using consistent what/why/next phrasing
- Added/updated regression coverage to assert refusal-message contracts for dirty launch refusal, newer-work refusal, diverged-history refusal, dirty-start refusal, and dirty-worktree refusal branches

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden dirty-worktree launch refusal copy in runner** - `6cb9d7f` (fix)
2. **Task 2: Harden undo safety refusal copy for guarded history cases** - `d3dceb1` (fix)

## Files Created/Modified

- `src/core/runner.ts` - rewrote dirty-start launch refusal into explicit what/why/next contract with command-level next actions and `--force-dirty` tradeoff framing
- `test/core/runner-recovery.test.ts` - updated refusal assertions to lock new dirty-worktree guidance wording
- `src/commands/undo.ts` - normalized guarded refusal branches (newer-work, diverged, dirty-start, dirty-now) to plain-language what/why/next messaging and explicit force guard semantics
- `test/commands/undo.test.ts` - expanded refusal regression checks and added diverged-history guidance coverage

## Decisions Made

- Standardized both launch and undo guardrail refusals around a single what/why/next copy shape for operator clarity
- Kept undo safety policy unchanged while clarifying exactly where `--force` is required and where it cannot bypass safety rules

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Guardrail refusal language is now consistent and actionable across runner launch and undo safety flows
- The shared copy contract reduces wording drift risk for remaining Phase 44 CLI/TUI polish work
- Ready for remaining parallel wave plans (`44-04-PLAN.md` and `44-05-PLAN.md`)

---
*Phase: 44-qol-introspection-and-queue-grace-period*
*Completed: 2026-03-08*
