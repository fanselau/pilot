---
phase: 48-fix-new-project-setup-critical-bugs
plan: 01
subsystem: infra
tags: [git-submodule, setup, validation, pilot-gsd]

# Dependency graph
requires:
  - phase: 47
    provides: AGENTS.md integration + doctor + lessons commands
provides:
  - Updated pilot-gsd submodule pointing to fanselau/pilot-gsd fork (dev branch)
  - Post-symlink command layout validation in setupProject()
  - Sentinel check for gsd-delegate.md with clear error messaging
affects: [48-02, setup, doctor, new-project-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinel file validation after symlink creation in setup"

key-files:
  created: []
  modified:
    - ".gitmodules"
    - "src/core/setup.ts"

key-decisions:
  - "Use gsd-delegate.md as sentinel file for command layout validation"
  - "Return error result (not throw) when validation fails for consistency with setupProject() pattern"
  - "Add existsSync import from node:fs for synchronous check (async not needed for single file existence)"

patterns-established:
  - "Sentinel file check: verify critical file exists after symlink creation to catch stale/broken GSD installations"

# Metrics
duration: 2min
completed: 2026-03-08
---

# Phase 48 Plan 01: Fix pilot-gsd Submodule + Command Layout Validation Summary

**Updated pilot-gsd submodule to fanselau/pilot-gsd fork with flat command layout and added gsd-delegate.md sentinel validation in setupProject()**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T14:01:34Z
- **Completed:** 2026-03-08T14:04:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Updated `.gitmodules` to point to `fanselau/pilot-gsd` fork on `dev` branch with correct flat command layout
- Added post-symlink validation in `setupProject()` that checks `gsd-delegate.md` exists as sentinel
- Setup now fails loudly with clear error when GSD installation is outdated or missing delegate command
- All 799 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Update pilot-gsd submodule to working fork** - `7720245` (fix)
2. **Task 2: Add gsd-delegate.md validation in setupProject()** - `e404c4a` (fix)

## Files Created/Modified
- `.gitmodules` - Updated submodule URL to fanselau/pilot-gsd, added branch = dev
- `src/core/setup.ts` - Added existsSync import, sentinel validation block after symlink creation, success verification message

## Decisions Made
- Used `gsd-delegate.md` as sentinel file — it's pilot-specific and only exists in the correct flat layout
- Used `existsSync` (sync) from `node:fs` rather than async `access()` — single file check, simpler code
- Validation returns error in `result.errors` array (not throws) — consistent with `setupProject()` error handling pattern
- Validation runs AFTER symlink creation but BEFORE project command linking — early exit prevents further broken setup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 48-02-PLAN.md (tests for command layout validation + path normalization regression tests)
- Submodule is updated and verified — tests can assert on the validation behavior

---
*Phase: 48-fix-new-project-setup-critical-bugs*
*Completed: 2026-03-08*
