# Cleanup: Remove Dead Code After Phase Redesign

## Problem
After the phase redesign (gsd-phase + pilot-judge), a lot of old heuristic code is dead weight. The codebase grew organically through many iterations and has accumulated technical debt.

## Goal
Clean, lean codebase. Remove everything that's no longer used. Make the remaining code easy to understand.

## Requirements

### Must Have
- [ ] Delete `evaluateStepResult()` from runner.ts if replaced by judge
- [ ] Delete `verifyStepArtifacts()` from runner.ts if replaced by judge
- [ ] Delete `verifyWithGraceWindow()` from runner.ts if replaced by judge
- [ ] Delete `patchStepArgs()` from runner.ts if no longer needed (single-step phases)
- [ ] Delete `scanPhaseDirs()` from runner.ts if only used by verifyStepArtifacts
- [ ] Delete `isSessionActive()` from opencode-db.ts if fully replaced by `isSessionDone()`
- [ ] Remove any unused imports across all files
- [ ] Remove any functions in opencode-db.ts that are exported but never imported anywhere
- [ ] Remove dead delegation AI code in delegate.ts that's been bypassed (phase jobs skip delegation)
- [ ] Clean up `.planning/phases/` — remove any leftover superseded/duplicate phase directories
- [ ] Remove old requirement files that have been fully implemented
- [ ] Run `npx tsc --noEmit` to verify no type errors after cleanup
- [ ] Run `npm run test:run` to verify all tests pass after cleanup
- [ ] Check for TODO/FIXME/HACK comments that reference old code — resolve or remove them

### Nice to Have
- [ ] Consolidate types — check types.ts for unused interfaces
- [ ] Review test files — remove tests for deleted functions
- [ ] Update comments/JSDoc that reference old architecture (4-session chain, artifact checks, etc.)

## Do NOT
- Delete anything that's still actively used — check imports before removing
- Remove the old GSD commands (gsd-add-phase, gsd-plan-phase, gsd-execute-phase) — they're still useful for interactive use and gsd-phase calls them as subagents
- Break any existing tests — run the full suite after every deletion
