---
phase: 100-managed-gsd-distribution
plan: 03
subsystem: cli
tags: [gsd, versions, drift, commander, vitest]
requires:
  - phase: 100-01
    provides: approved version authority and project GSD inspection helpers
provides:
  - dedicated approved-version show/set command surface
  - project detail approved/install/drift visibility
  - projects list drift summaries and JSON version fields
affects: [managed-project-visibility, rollout-ux, operator-controls]
tech-stack:
  added: []
  patterns: [dedicated gsd-version command group, live inspectProjectGsdState rendering]
key-files:
  created: [src/commands/gsd-version.ts, test/commands/gsd-version.test.ts]
  modified: [src/index.ts, src/commands/project.ts, src/commands/projects.ts, test/commands/project.test.ts]
key-decisions:
  - "Expose approved-version policy through a dedicated `pilot gsd-version` command instead of overloading `pilot update`."
  - "Render project and fleet GSD state from live `inspectProjectGsdState()` results so human and JSON surfaces stay truthful."
patterns-established:
  - "Managed version policy changes are explicit control-surface actions, separate from rollout execution."
  - "Managed project views include approved, installed, drift, checked-at, and error fields from the same inspection helper."
requirements-completed: [MGSD-01, MGSD-05, MGSD-07]
duration: 4 min
completed: 2026-03-26
---

# Phase 100 Plan 03: Operator Control and Drift Visibility Summary

**Dedicated `pilot gsd-version` controls plus live project/projects drift output for approved, installed, and mismatch state.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T16:04:58Z
- **Completed:** 2026-03-26T16:09:12Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `pilot gsd-version` with show/set handlers and JSON output for approved/runtime version state.
- Kept policy change separate from rollout by making `gsd-version set` persist config and point operators to `pilot update`.
- Added live approved/install/drift visibility to `pilot project` and concise `gsd:` summaries to `pilot projects`.
- Expanded command-level regression coverage for the new control surface and drift visibility paths.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: approved-version command tests** - `08f42d6` (test)
2. **Task 1 GREEN: approved-version command surface** - `a4309bd` (feat)
3. **Task 2 RED: drift visibility tests** - `7173301` (test)
4. **Task 2 GREEN: project/projects drift output** - `aeba55d` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `src/commands/gsd-version.ts` - Show/set command handlers for approved GSD policy.
- `src/index.ts` - Registers the top-level `gsd-version` command group.
- `test/commands/gsd-version.test.ts` - Regression tests for show/set human and JSON behavior.
- `src/commands/project.ts` - Adds live approved/install/drift output and JSON fields for one project.
- `src/commands/projects.ts` - Adds fleet-level `gsd:` summaries and JSON drift metadata.
- `test/commands/project.test.ts` - Regression tests for drift rendering and JSON payload coverage.

## Decisions Made
- Used a first-class `pilot gsd-version` command so approved-version policy stays separate from rollout execution.
- Used live `inspectProjectGsdState()` reads in both project views so operators do not depend on stale DB-only metadata.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Approved-version policy is now inspectable and intentionally changeable without changing project installs immediately.
- Managed-project views now expose approved/install/drift data needed for rollout and repair workflows.

## Self-Check: PASSED

---
*Phase: 100-managed-gsd-distribution*
*Completed: 2026-03-26*
