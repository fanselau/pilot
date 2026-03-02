---
phase: quick-013
plan: 01
status: complete
duration: 7m
completed: 2026-03-02
subsystem: runner
tags: [delegate, runner, semantic-gating, phase-fallback, cancellation]
tech-stack:
  added: []
  patterns: [semantic-failure-detection, safe-phase-resolution]
key-files:
  created: []
  modified:
    - src/core/delegate.ts
    - src/core/runner.ts
    - src/commands/add.ts
    - test/core/delegate.test.ts
    - test/core/runner.test.ts
decisions:
  - { area: delegate, decision: "resolvePhaseForFallback builds add→plan→execute lifecycle for non-numeric descriptions", rationale: "Prevents blindly passing requirement titles to execute-phase" }
  - { area: runner, decision: "evaluateStepResult checks last message for failure markers after execute-phase/plan-phase only", rationale: "Quick commands don't need semantic check; false positives would break them" }
  - { area: runner, decision: "Interrupted jobs marked cancelled via cancel() not markCompleted()", rationale: "Prevents false completed status on shutdown" }
  - { area: add, decision: "Phase scope warning is stderr-only and non-blocking", rationale: "Job still queues; warning is informational per R5" }
  - { area: runner, decision: "R4 step-level observability deferred — existing delegation_plan JSON + error field sufficient", rationale: "Quick task scope; evaluateStepResult reason stored in error field on failure" }
---

# Quick 013: Phase Execution Success Contract

Implemented requirements/pilot-phase-execution-success-contract.md: fixed phase fallback mapping, added semantic success gating, handled interrupted jobs properly, and warned on ambiguous phase inputs.

## One-liner

Safe phase fallback resolution + semantic failure gating + shutdown cancellation for the runner's phase execution pipeline.

## What was done

### Task 1: Fix phase fallback mapping + semantic success gating + interrupted job handling
**Commit:** `996e5c5`

**R1 — Safe phase delegation mapping (delegate.ts):**
- Added `resolvePhaseForFallback()` function that safely resolves phase identifiers
- Numeric descriptions (e.g., "3") → direct `execute-phase 3`
- Non-numeric descriptions (e.g., "Add dark mode") → builds full lifecycle: `add-phase` → `plan-phase N --auto` → `execute-phase N`
- Reads ROADMAP.md to count existing phases and calculate next phase number
- Uses `requirementPath` as `@path` in add-phase args when available
- Falls back to `execute-phase 1` when ROADMAP.md is missing

**R2 — Semantic success gating (runner.ts):**
- Added `evaluateStepResult()` function that checks last assistant message for failure markers
- Failure patterns: `no matching phase`, `error.*phase.*not found`, `no plan(s) found`, `phase directory.*not found`, `cannot find phase`, `failed to (plan|execute|verify)`, `error.*(execute|plan|verify)`
- Only runs after `execute-phase` and `plan-phase` commands (not quick tasks)
- On failure detection: throws error → caught by launch() → `markFailed()`

**R3 — Interrupted job cancellation (runner.ts):**
- Added `allStepsCompleted` flag to step loop
- When `shuttingDown` is true during step loop, sets `allStepsCompleted = false` and breaks
- After loop: `allStepsCompleted ? markCompleted() : cancel()`
- Imported `cancel` from db.ts (already existed but wasn't used by runner)

**R5 — Ambiguous phase warning (add.ts):**
- When scope='phase' is auto-detected from file path and no `--as` override:
  - Reads ROADMAP.md and checks if first 30 chars of description match
  - If no match: emits stderr warning suggesting `--as quick` or `--as milestone`
  - Warning is non-blocking; job still queues normally

### Task 2: Add tests for all four requirements
**Commit:** `876442a`

- **delegate.test.ts:** 8 new tests for `resolvePhaseForFallback` covering numeric, non-numeric, requirementPath, gaps in phase numbers, empty ROADMAP, missing ROADMAP, and requirement-title-never-passes-to-execute-phase
- **runner.test.ts:** 5 new tests for semantic failure detection (R2): failure markers on execute-phase, clean output, failure markers on plan-phase, no messages = success, quick commands skip semantic check
- **runner.test.ts:** 1 new test for shutdown interruption (R3): interrupted job gets `cancel()` not `markCompleted()`
- **runner.test.ts:** 7 new tests for `evaluateStepResult` unit tests covering each failure pattern
- All 164 tests pass (was 138 pre-task, added 26 new)

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **R4 (step-level observability) deferred** — The plan explicitly called this out as lightweight/deferred. Existing `delegation_plan` JSON + `current_step` counter + `error` field already provides reasonable observability. The `evaluateStepResult` reason gets stored in the error field when it fails.

2. **Pre-existing test fix** — The multi-step test had already been fixed in a prior commit (models.js mock added, `updateSessionTitles` count updated to 3). No additional fix needed.

## Verification

- `npx tsc --noEmit` — passes with no type errors
- `npx vitest run` — all 164 tests pass (9 test files)
- `grep -n 'markCompleted' src/core/runner.ts` — only called inside `if (allStepsCompleted)` block
- `grep -n 'job.description' src/core/delegate.ts` — execute-phase only gets description when `^\d+$` matches
