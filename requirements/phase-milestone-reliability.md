# Phase & Milestone Reliability — Make Structured Modes the Default

## Problem

Phase and milestone modes are unreliable, causing users to fall back to `quick` mode for everything. The root causes:

1. **Fallback plan creates wrong phase dirs**: When `resolvePhaseForFallback` runs `add-phase → plan-phase N → execute-phase N`, the `add-phase` GSD command creates a directory like `.planning/phases/22-add-authentication/` but `execute-phase 22` uses `gsd-tools init execute-phase "22"` which searches for dirs matching `22-*`. This part actually works IF add-phase creates the dir correctly — but the fallback computes `nextPhase` from ROADMAP regex which can diverge from what `gsd-tools phase add` actually creates.

2. **Phase number mismatch between pilot and GSD**: Pilot's `resolvePhaseForFallback` counts `### Phase N` headings in ROADMAP.md to predict the next phase number. But `gsd-tools phase add` independently calculates the next number by scanning `.planning/phases/` directories. These can diverge when:
   - There are gaps in phase numbering
   - Phases were deleted but ROADMAP wasn't updated
   - Duplicate phase dirs exist (e.g. `19-tui-phase-redo` AND `19-requirements-tui-phase-redo-md`)

3. **Delegation AI frequently fails → falls back to deterministic**: The delegation session has 120s timeout and often doesn't produce valid JSON, so most jobs hit `fallbackPlan()`. The fallback is too naive for phase/milestone.

4. **`quick` mode is the path of least resistance**: String input → quick. No friction, no planning overhead. Phase requires a `.md` file. This makes quick the default for lazy usage.

## Goal

Phase mode works reliably end-to-end on ANY project (initialized or not). Milestone mode works for multi-requirement batches. Quick mode still exists but is clearly positioned as "minor fixes only."

## Requirements

### Must Have

- [ ] **Fix phase number resolution**: Replace ROADMAP heading counting in `resolvePhaseForFallback` with actual filesystem scan of `.planning/phases/` dirs (same logic GSD uses). Extract the max `NN` prefix from existing dirs to determine next phase number.

- [ ] **Verify phase creation before proceeding**: After the `add-phase` step completes, verify the expected phase directory actually exists before running `plan-phase` and `execute-phase`. If it doesn't exist, scan `.planning/phases/` for the newly created dir and use THAT number.

- [ ] **Make phase the default scope for string inputs**: Change `detectScope` so that strings longer than ~100 chars OR strings that contain requirements-like language (e.g. "add", "implement", "build", "create", "fix") default to `phase` instead of `quick`. Quick should only be for very short imperative strings like "fix typo in README".

- [ ] **Add `--as quick` deprecation warning**: When `--as quick` is explicitly used OR quick is auto-detected, print a warning: `⚠ Quick mode skips planning. Consider phase mode for better results: pilot add <project> <req> --as phase`

- [ ] **Improve fallback plan for milestone scope**: When scope=milestone and project has `.planning/`, iterate requirement files in the directory and create one phase per file (add-phase → plan-phase → execute-phase for each), not just a single `add-phase`.

- [ ] **Add semantic success patterns (not just failure)**: `evaluateStepResult` only checks for failure patterns. Add positive success markers too — if execute-phase output contains "Phase X complete" / "all plans executed" / verification passed patterns, explicitly mark success. If NEITHER success nor failure patterns match, mark as `uncertain` and log a warning.

- [ ] **Comprehensive tests for delegate.ts**: Add tests for:
  - `resolvePhaseForFallback` with various ROADMAP states (gaps, duplicates, empty)
  - `resolvePhaseForFallback` when `.planning/phases/` has mismatched dirs
  - `fallbackPlan` for all three scopes × initialized/uninitialized
  - `buildNewProjectArgs` and `buildQuickArgs` with edge cases

- [ ] **Comprehensive tests for runner.ts step execution**: Add tests for:
  - `evaluateStepResult` with real-world success/failure outputs
  - Step-level recording and completion tracking
  - Multi-step execution with failure at step 2 of 3
  - Shutdown mid-step handling

### Nice to Have

- [ ] Add a `pilot add <project> <string> --as phase` shortcut that auto-creates a temp requirement file from the string, so users don't need to manually create `.md` files for phase mode
- [ ] Emit structured step-level events (not just stderr) so TUI can show per-step progress
- [ ] Add `--dry-run` to delegation that shows the plan without executing

## Technical Notes

- Pilot source: `~/dev/pilot/` (TypeScript, vitest for tests)
- GSD phase tooling: `gsd-tools.cjs` handles phase operations, directory creation, ROADMAP parsing
- `gsd-tools phase add` is the source of truth for phase number calculation
- Existing tests: `test/core/delegate.test.ts` (254 lines), `test/core/runner.test.ts` (775 lines)
- Test framework: vitest
- Build: `npm run build` (tsc)

## Do NOT

- Remove quick mode entirely — it's still useful for genuine one-liners
- Change the GSD workflow files (those are in pilot-gsd, not pilot)
- Break the delegation AI path — it should still be tried first, fallback is the safety net
- Change the opencode spawn mechanism or pre-spawn safety checks
- Modify the TUI code
- Add new npm dependencies
