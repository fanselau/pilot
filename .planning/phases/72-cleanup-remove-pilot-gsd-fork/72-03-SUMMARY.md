---
phase: 72-cleanup-remove-pilot-gsd-fork
plan: 03
subsystem: infra
tags: [git, submodule, setup, symlink-migration, regression-tests]

# Dependency graph
requires:
  - phase: 72-cleanup-remove-pilot-gsd-fork
    provides: migration-order gate evidence from 72-05 before destructive fork cleanup
  - phase: 64-gsd-installation-switch
    provides: upstream installer-owned .opencode layout used by setup migration cleanup
provides:
  - Removed active pilot-gsd submodule metadata and gitlink from repository state
  - Fork-agnostic setup migration cleanup for installer-owned legacy symlink paths
  - Regression tests asserting generic legacy symlink cleanup and broken-link verification guidance
affects: [72-04, cleanup-finalization, setup-refresh-reliability]

# Tech tracking
tech-stack:
  added: []
  patterns: [installer-owned symlink cleanup, fork-agnostic migration semantics, deterministic filesystem regression tests]

key-files:
  created: [.planning/phases/72-cleanup-remove-pilot-gsd-fork/72-03-SUMMARY.md]
  modified: [.gitmodules, src/core/setup.ts, test/core/setup.test.ts, pilot-gsd]

key-decisions:
  - "Treat any symlink under installer-owned .opencode paths as legacy and unlink before installer run"
  - "Keep verifySetup broken-symlink findings and refresh remediation wording unchanged"
  - "Use behavior-driven setup regression assertions instead of fork-name fixture coupling"

patterns-established:
  - "Migration cleanup targets installer-owned paths (.opencode/command, agents, get-shit-done) without target-name matching"
  - "Setup tests validate replacement behavior and reporting with temp-dir symlink fixtures"

requirements-completed: []

# Metrics
duration: 3 min
completed: 2026-03-16
---

# Phase 72 Plan 03: Submodule Removal + Fork-Agnostic Setup Cleanup Summary

**Repository-level pilot-gsd submodule tracking was removed, setup migration cleanup now unlinks legacy installer-path symlinks generically, and setup regressions were rewritten around behavior-based legacy semantics.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T09:47:42Z
- **Completed:** 2026-03-16T09:51:03Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Removed active `pilot-gsd` submodule registration by deinitializing the submodule, clearing `.gitmodules`, and deleting the gitlink path.
- Refactored `setupProject()` migration cleanup in `src/core/setup.ts` to remove fork-name checks and safely unlink legacy symlinks in installer-owned `.opencode` paths.
- Updated `test/core/setup.test.ts` migration regressions to use generic legacy fixtures while preserving coverage for cleanup reporting and `verifySetup` broken symlink detection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove active `pilot-gsd` submodule metadata from repository** - `24ce429` (chore)
2. **Task 2: Refactor setup migration cleanup to fork-agnostic legacy symlink handling** - `fea19f3` (fix)
3. **Task 3: Update setup regression tests for generic migration semantics** - `4dfc165` (test)

**Plan metadata:** pending final docs commit for this plan.

## Files Created/Modified
- `.gitmodules` - Cleared active `pilot-gsd` submodule declaration.
- `pilot-gsd` - Removed submodule gitlink path from repository tracking.
- `src/core/setup.ts` - Replaced target-name matching with installer-path symlink cleanup.
- `test/core/setup.test.ts` - Reworked migration fixtures/assertions to generic legacy semantics.

## Decisions Made
- Use installer-owned path membership (not target string matching) as deterministic legacy cleanup criteria.
- Preserve `verifySetup` broken-symlink remediation (`pilot setup --refresh`) to keep migration guidance stable.
- Assert migration behavior through filesystem outcomes and cleanup reporting instead of fork-name text checks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated stale migration assertion during Task 2 verification**
- **Found during:** Task 2 (fork-agnostic setup migration cleanup)
- **Issue:** `test/core/setup.test.ts` asserted cleanup messages contained `pilot-gsd`, causing the required Task 2 test verification to fail after removing fork coupling.
- **Fix:** Updated the blocking assertion to match generic legacy cleanup messaging so Task 2 verification could complete.
- **Files modified:** `test/core/setup.test.ts`
- **Verification:** `npm test -- test/core/setup.test.ts` and `npm run lint` passed.
- **Committed in:** `fea19f3` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix was required to keep verification green while removing fork-coupled expectations; no scope creep.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Fork-coupled submodule metadata and setup migration logic are now cleaned up and verified.
- Ready for remaining Phase 72 cleanup plans that depend on generic setup semantics and submodule removal state.

---
*Phase: 72-cleanup-remove-pilot-gsd-fork*
*Completed: 2026-03-16*
