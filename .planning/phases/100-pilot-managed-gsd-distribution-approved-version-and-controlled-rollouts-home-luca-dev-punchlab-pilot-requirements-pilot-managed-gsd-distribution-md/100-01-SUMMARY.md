---
phase: 100-managed-gsd-distribution
plan: 01
subsystem: infra
tags: [gsd, versioning, sqlite, vitest, bun]

# Dependency graph
requires:
  - phase: 64-gsd-installation-switch
    provides: upstream get-shit-done-cc installer usage for setup and update flows
provides:
  - explicit approved GSD version policy in Pilot config
  - managed GSD drift inspection and local installer convergence helpers
  - durable per-project approved and installed GSD metadata in pilot.db
affects: [100-02, 100-03, setup, update, project-surfaces]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - approved GSD version comes from config, not local dependency resolution
    - managed projects persist last known GSD drift state alongside project metadata

key-files:
  created:
    - src/core/managed-gsd.ts
    - test/core/managed-gsd.test.ts
  modified:
    - src/core/types.ts
    - src/core/config.ts
    - src/core/db.ts
    - test/core/db.test.ts

key-decisions:
  - "Use config.gsd.approvedVersion with default 1.24.0 as the only approved-version policy source."
  - "Read project install state from .opencode/get-shit-done/VERSION and persist the last inspected result onto the project row."

patterns-established:
  - "Managed GSD helpers centralize validation, drift classification, project inspection, and bun installer convergence."
  - "Project GSD metadata is updated via updateProjectGsdState() instead of ad hoc SQL in command modules."

requirements-completed: [MGSD-01, MGSD-02, MGSD-06]

# Metrics
duration: 6 min
completed: 2026-03-26
---

# Phase 100 Plan 01: Approved Version Foundation Summary

**Explicit approved GSD version policy with drift inspection helpers and persisted project version metadata.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-26T15:54:30Z
- **Completed:** 2026-03-26T16:00:44Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `gsd.approvedVersion` config support with default `1.24.0` and resolved `approvedGsdVersion` in `PilotConfig`.
- Created `src/core/managed-gsd.ts` for version validation, VERSION inspection, drift classification, and local installer convergence.
- Extended project persistence so approved version, installed version, drift status, check timestamp, and error round-trip through `Project`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add approved-version authority and managed-GSD domain helpers** - `9b35ab7` (test), `eb1e5bf` (feat)
2. **Task 2: Persist managed project GSD state** - `bfbac29` (feat)

**Plan metadata:** _(pending docs commit)_

## Files Created/Modified
- `src/core/types.ts` - adds approved-version config contract and project GSD metadata fields.
- `src/core/config.ts` - resolves approved GSD version from config-only policy.
- `src/core/managed-gsd.ts` - validates approved versions, inspects project VERSION files, and syncs the local installer package.
- `src/core/db.ts` - stores project GSD metadata and exposes `updateProjectGsdState()`.
- `test/core/managed-gsd.test.ts` - covers default version policy, drift classification, VERSION inspection, and installer convergence.
- `test/core/db.test.ts` - covers project GSD state persistence, clearing, and legacy-row compatibility.

## Decisions Made
- Used `gsd.approvedVersion` in config as the explicit source of truth so Pilot policy no longer depends on incidental local package resolution.
- Compared project drift with exact `x.y.z` parsing only, returning `unknown` for missing or invalid VERSION content instead of guessing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Setup and update flows can now consume a single approved version authority and persist truthful per-project drift state.
- Operator-facing rollout and project visibility work can build on `ensureApprovedGsdPackage()`, `inspectProjectGsdState()`, and `updateProjectGsdState()`.

## Self-Check: PASSED
