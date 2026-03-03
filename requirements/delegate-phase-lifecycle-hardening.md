# Delegate Phase Lifecycle Hardening

## Problem

The delegate AI outputs correct step plans (add-phase → plan-phase → execute-phase) but the args it passes cause downstream failures:

1. **Bad args to add-phase**: Delegate passes `requirements/tui-visual-polish.md` (the file path) as the description arg. `gsd-tools phase add` then slugifies this to `requirements-tui-visual-polish-md` creating ugly, confusing phase directory names.

2. **No inter-step verification**: After add-phase creates phase N, pilot blindly runs plan-phase N then execute-phase N without checking that step N-1 actually succeeded and created the expected artifacts. If add-phase fails silently or creates a different phase number than expected, the rest of the plan breaks.

3. **Step args are static**: The delegate plan is computed once before any steps run. But step 2 (plan-phase) and step 3 (execute-phase) need the ACTUAL phase number that step 1 (add-phase) created, which might differ from what the delegate predicted.

## Goal

Phase lifecycle (add → plan → execute) works reliably with proper args and inter-step verification. The delegate passes meaningful descriptions, and pilot verifies each step created the expected artifacts before proceeding.

## Requirements

### Must Have

- [ ] **Delegate passes requirement TITLE, not file path**: In `gsd-delegate.md` command definition, update the phase rules:
  - When `requirement_path` is not "none", the delegate should read the requirement file and extract the `# Title` heading
  - Use that title as the `args` for `add-phase`, not the file path
  - Example: `add-phase "Phase & Milestone Reliability"` instead of `add-phase "requirements/phase-milestone-reliability.md"`
  - If the requirement has a `@` prefix (file reference syntax), include it for plan-phase/execute-phase context but NOT in add-phase args

- [ ] **Inter-step artifact verification in runner**: After each step completes, before launching the next step, verify expected artifacts exist:
  - After `add-phase`: scan `.planning/phases/` for a newly created directory. Extract the actual phase number from it. **Patch remaining steps** to use this actual phase number (replacing whatever the delegate predicted).
  - After `plan-phase N`: verify `.planning/phases/N-*/` contains at least one `*-PLAN.md` file.
  - After `execute-phase N`: verify plan SUMMARY files exist (at least one `*-SUMMARY.md`).
  - If verification fails: mark step as failed with descriptive error, don't proceed.

- [ ] **Dynamic step arg patching**: Add a mechanism in the runner to modify step args between steps based on previous step outputs. Specifically:
  - Track `.planning/phases/` directory listing BEFORE add-phase runs
  - After add-phase completes, diff the directory listing to find the new dir
  - Extract actual phase number from the new dir name
  - Replace `{N}` in subsequent step args with the actual number
  - This handles the case where delegate predicted phase 21 but gsd-tools created phase 22

- [ ] **Better delegation prompt for phase scope**: Update `gsd-delegate.md` to include:
  - Instruction to read the requirement file and extract the title
  - Instruction to use `@<path>` syntax for requirement file references in plan-phase args
  - Explicit rule: "add-phase args = human-readable description, NOT file paths"

- [ ] **Tests for inter-step verification**: 
  - Test: add-phase creates dir → runner detects new dir → patches plan-phase/execute-phase args
  - Test: add-phase fails (no new dir) → runner marks job failed
  - Test: plan-phase succeeds but no PLAN.md files → runner marks job failed  
  - Test: phase number mismatch (delegate said 21, actual is 22) → runner patches correctly

### Nice to Have

- [ ] Log inter-step verification results in step records for debugging
- [ ] Add `--verify-steps` flag to `pilot add` to enable/disable inter-step verification (default: on)

## Technical Notes

- Runner step execution: `src/core/runner.ts` → `launch()` method, step loop at the bottom
- Delegate command: `~/dev/punchlab/pilot-gsd/commands/gsd-delegate.md` (this is in pilot-gsd, not pilot — must be updated separately via `pilot update`)
- Phase dir scanning: use same approach as `gsd-tools` — `readdirSync('.planning/phases/')`, filter dirs, extract number prefix
- The inter-step verification happens IN pilot's runner, not in GSD workflows
- Step args are in `plan.steps[i].args` — these can be mutated between steps

## Do NOT

- Modify GSD workflow files (execute-phase.md, plan-phase.md, add-phase.md) — those are in pilot-gsd
- Change the delegation AI spawning mechanism
- Remove the fallback plan logic (it's the safety net)
- Add new npm dependencies
- Break the existing step recording/completion tracking
