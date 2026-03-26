---
phase: 100-managed-gsd-distribution
plan: 02
subsystem: infra
tags: [gsd, setup, refresh, rollout, update, vitest]

# Dependency graph
requires:
  - phase: 100-01
    provides: approved GSD config authority, drift inspection helpers, project GSD persistence
provides:
  - approved-version-aware setup and refresh behavior with ahead-project safety
  - controlled `pilot update` rollout actions and per-project reporting
  - setup/update regression coverage for behind, ahead, blocked, and unknown-version flows
affects: [100-03, setup-output, project-drift-surfaces]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Setup converges the local installer to the approved version before per-project work"
    - "Refresh inspects project drift first and never silently downgrades ahead projects"
    - "Update classifies each managed project into already-current, blocked, ahead, update, or repair actions"

key-files:
  created: []
  modified:
    - src/core/setup.ts
    - src/commands/setup.ts
    - test/core/setup.test.ts
    - test/commands/setup.test.ts
    - src/commands/update.ts
    - test/commands/update.test.ts

key-decisions:
  - "Setup always prepares the approved runtime once, then decides installer work from project drift state"
  - "Ahead-of-approved projects are reported and skipped during refresh and fleet update instead of being downgraded"
  - "Update JSON output exposes approvedVersion, runtimeVersion, and per-project rollout records for downstream tooling"

patterns-established:
  - "Managed GSD setup summary: human and JSON output both surface approved/install/drift state"
  - "Controlled rollout pattern: inspect -> classify -> optionally reinstall -> persist final state -> continue loop"

requirements-completed: [MGSD-03, MGSD-04, MGSD-07]

# Metrics
duration: 9 min
completed: 2026-03-26
---

# Phase 100 Plan 02: Setup and Rollout Semantics Summary

**Approved-version-aware setup refresh behavior and controlled per-project update rollouts for managed GSD installs**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-26T16:06:06Z
- **Completed:** 2026-03-26T16:15:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `setupProject()` now prepares the approved runtime, inspects refresh drift, skips ahead projects safely, and persists managed GSD state after setup outcomes.
- `pilot setup` now reports approved version, installed version, and drift in human output and JSON output.
- `pilot update` now performs a controlled rollout with explicit blocked, already-current, ahead-skipped, update-to-approved, and repair-to-approved actions.
- Focused regressions now cover fresh setup, behind refresh, ahead safety, unknown VERSION handling, and per-project rollout reporting.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforce approved-version setup and refresh semantics** - `a14bdfe` (test), `f1c2d8d` (feat)
2. **Task 2: Turn `pilot update` into a controlled rollout** - `39b76e6` (test), `35220d3` (feat), `54fb5c6` (test)

**Plan metadata:** pending final docs commit

_Note: TDD tasks produced separate red/green commits._

## Files Created/Modified

- `src/core/setup.ts` - Adds approved-version setup/refresh decision logic, ahead-project safety, and managed state persistence.
- `src/commands/setup.ts` - Exposes approved/install/drift output in both human and JSON setup responses.
- `test/core/setup.test.ts` - Covers approved-version setup, behind refresh, ahead skip, and unknown VERSION handling.
- `test/commands/setup.test.ts` - Verifies setup output and JSON reporting for managed GSD state.
- `src/commands/update.ts` - Rewrites update into approved-version rollout classification with per-project results.
- `test/commands/update.test.ts` - Covers rollout classification, blocked/ahead behavior, failure continuation, and JSON output.

## Decisions Made

- Setup now calls `ensureApprovedGsdPackage()` once before any installer work so package-manager state becomes a derived cache, not the policy source.
- Refresh inspects drift before reinstalling and skips GSD mutation when a project is ahead of the approved version, while still allowing the rest of setup maintenance to continue.
- Update persists inspected and post-install project GSD state per project so blocked, ahead, repair, and failure outcomes remain visible after rollout.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Existing update command tests assumed the old `bun update get-shit-done-cc` flow; they were rewritten to match the new approved-version rollout contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Approved-version behavior now governs the commands that mutate project installs.
- Managed setup/update surfaces are ready for Plan 03 operator controls and broader drift visibility work.

## Self-Check: PASSED

---
*Phase: 100-managed-gsd-distribution*
*Completed: 2026-03-26*
