---
phase: 87-pilot-ui-phase-first-class-delegation-step-for-async-runner-mode
plan: 02
subsystem: api
tags: [runner, delegation, ui-phase, typescript, intent, async-safe]

# Dependency graph
requires:
  - phase: 87-pilot-ui-phase-first-class-delegation-step-for-async-runner-mode
    provides: DelegationIntent plan-and-execute with uiPhase boolean field (Plan 01)
provides:
  - findExistingUiSpec() helper for UI-SPEC existence check in phase directory
  - intentToSteps plan-and-execute case conditionally inserts ui-phase step before plan-phase
  - Deterministic UI-phase skip when UI-SPEC already exists with stderr log
affects:
  - runner step execution pipeline for any plan-and-execute intent with uiPhase=true

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UI-SPEC existence check via readdirSync phase directory scan before inserting runner step"
    - "Gap closure guard: uiPhase && !isGapClosure prevents UI-phase on gap-closure intents"
    - "Stderr log for skipped ui-phase step: observability without failing"

key-files:
  created: []
  modified:
    - src/core/runner.ts

key-decisions:
  - "findExistingUiSpec scans by phase number prefix match (e.g. '87-') to find the phase directory, then looks for *-UI-SPEC.md inside"
  - "Gap closure intents never get ui-phase step (isGapClosure guard) — gap closure fixes existing plans, not new designs"
  - "command: 'ui-phase' maps to gsd-ui-phase via spawnAndWait's gsd-${command} pattern"
  - "reason field on the step provides observability in pilot info step display"

patterns-established:
  - "UI-SPEC existence check pattern: readdirSync phases dir, match phase prefix, find *-UI-SPEC.md file"

requirements-completed:
  - UI-PHASE-RUNNER
  - UI-PHASE-ASYNC-SAFE
  - UI-PHASE-OBSERVABILITY

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 87 Plan 02: Runner UI-Phase Integration Summary

**`intentToSteps` now conditionally inserts `ui-phase` step before `plan-phase` when `intent.uiPhase` is true, with idempotent UI-SPEC existence check and stderr observability**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T22:48:47Z
- **Completed:** 2026-03-22T22:50:55Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `findExistingUiSpec()` module-level helper scans `.planning/phases/` for an existing `*-UI-SPEC.md` before inserting the ui-phase step
- `intentToSteps` plan-and-execute case gains `if (intent.uiPhase && !intent.isGapClosure)` block between add-phase and plan-phase
- When UI-SPEC already exists: logs to stderr and skips the step (idempotent re-run safety)
- When UI-SPEC is absent: pushes `{ command: 'ui-phase', args: String(phaseNumber), reason: '...' }` step
- Gap closure intents are always excluded from UI-phase insertion
- All 1281 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add UI-SPEC existence check helper and modify intentToSteps** - `f8a593e` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/core/runner.ts` — Added `findExistingUiSpec()` helper (30 lines), modified `plan-and-execute` case in `intentToSteps` to conditionally insert ui-phase step

## Decisions Made
- **`findExistingUiSpec` scan by numeric prefix**: matches phase number `87` against directory entry prefix `87-pilot-ui-...` — same pattern as `getValidVerificationEvidence` already in the file
- **Gap closure exclusion**: `!intent.isGapClosure` is the correct guard — gap closure phases are fixing existing plans, not creating new UI designs
- **`command: 'ui-phase'`**: maps to `gsd-ui-phase` via `spawnAndWait`'s `gsd-${command}` auto-prefix pattern (verified in spawnAndWait at line 1622)
- **`reason` field on the step**: threads through to `pilot info` step display for observability

## Deviations from Plan

None — plan executed exactly as written.

---

**Total deviations:** 0

## Issues Encountered
None — TypeScript check clean, all 1281 tests pass.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 02 complete: runner integration wired
- The full ui-phase delegation pipeline is now end-to-end: delegation AI → `intent.uiPhase` → `intentToSteps()` → `ui-phase` step → `gsd-ui-phase` execution before `plan-phase`
- Phase 87 is complete (both plans done)

---
*Phase: 87-pilot-ui-phase-first-class-delegation-step-for-async-runner-mode*
*Completed: 2026-03-22*
