---
phase: 50-setup-refresh-mode-and-fast-skill-installation
plan: 01
subsystem: infra
tags: [setup, symlinks, deep-merge, concurrency, skills, npx]

# Dependency graph
requires:
  - phase: 49-surface-judge-verdict-and-status-badges
    provides: stable codebase with 825+ passing tests
provides:
  - setupProject() with refresh/force options for symlink and config refresh
  - OPENCODE_JSON_TEMPLATE exported constant for reuse
  - deepMerge utility for non-destructive config merging
  - Parallel bootstrapDefaultSkills() with concurrency limit of 5
  - Already-installed skill detection to skip redundant installs
affects: [50-02 CLI wiring for --refresh/--force/--skip-skills flags]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Concurrency-limited parallel execution via runWithConcurrency()"
    - "Deep-merge for non-destructive config updates (template fills gaps, user values preserved)"
    - "Already-installed skill detection via loadManifest() before batch install"

key-files:
  created: []
  modified:
    - src/core/setup.ts
    - src/core/default-skills.ts
    - test/core/default-skills.test.ts

key-decisions:
  - "No new dependencies for deep-merge or concurrency — inline implementations"
  - "Concurrency limit of 5 balances speed vs npm registry pressure (1-2 batches for 5-8 skills)"
  - "deepMerge preserves all existing user values — template only fills missing keys"
  - "loadManifest() check before batch install skips already-installed skills entirely"

patterns-established:
  - "runWithConcurrency pattern: inline PromiseSettledResult-based concurrency limiter"
  - "SetupOptions interface for backward-compatible option expansion"

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 50 Plan 01: Setup Refresh Mode + Parallel Skill Bootstrap Summary

**setupProject() refresh mode with symlink re-creation and opencode.json deep-merge; bootstrapDefaultSkills() parallelized with concurrency limit 5 and single batch syncManifest**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T10:37:27Z
- **Completed:** 2026-03-09T10:41:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- setupProject() accepts optional `{ refresh, force }` parameter — backward compatible
- With refresh=true: symlinks deleted and re-created pointing to current gsdDir, opencode.json deep-merged with template
- With refresh+force: opencode.json overwritten entirely with template
- bootstrapDefaultSkills() runs installs concurrently (limit 5), calls syncManifest() once after batch
- Already-installed skills skipped before attempting npx install (loadManifest check)
- OPENCODE_JSON_TEMPLATE extracted as exported constant for reuse

## Task Commits

Each task was committed atomically:

1. **Task 1: Add refresh mode to setupProject()** - `7cf35f3` (feat)
2. **Task 2: Parallelize bootstrapDefaultSkills()** - `04c97a6` (feat)

## Files Created/Modified
- `src/core/setup.ts` - SetupOptions interface, OPENCODE_JSON_TEMPLATE constant, deepMerge() helper, refresh/force logic in symlinks and opencode.json sections
- `src/core/default-skills.ts` - runWithConcurrency() utility, parallel bootstrapDefaultSkills() with loadManifest skip check, single batch syncManifest
- `test/core/default-skills.test.ts` - Added mockLoadManifest to skills.js mock, updated syncManifest call count assertion from 6 to 1

## Decisions Made
- No new dependencies: deepMerge and runWithConcurrency are inline implementations (~30 lines each)
- Concurrency limit of 5 chosen to balance speed vs npm registry pressure — for 5-8 skills this means 1-2 batches, completing in <10 seconds
- deepMerge semantics: target (existing config) wins for all present keys, template only fills gaps — user values are NEVER overwritten
- Already-installed skills detected by comparing install ID short name against loadManifest() skill names

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test mock to include loadManifest**
- **Found during:** Task 2 (Parallelize bootstrapDefaultSkills)
- **Issue:** Test file mocked `skills.js` without `loadManifest` export, causing all bootstrap tests to fail
- **Fix:** Added `mockLoadManifest` to the `vi.mock()` factory and default return value in `beforeEach`
- **Files modified:** test/core/default-skills.test.ts
- **Verification:** All 41 tests pass
- **Committed in:** 04c97a6 (Task 2 commit)

**2. [Rule 3 - Blocking] Updated syncManifest call count assertion**
- **Found during:** Task 2 (Parallelize bootstrapDefaultSkills)
- **Issue:** Test asserted 6 syncManifest calls (5 per-install + 1 final), but new batch behavior produces only 1 call
- **Fix:** Changed assertion from 6 to 1 and renamed test to reflect batch sync behavior
- **Files modified:** test/core/default-skills.test.ts
- **Verification:** All 41 tests pass
- **Committed in:** 04c97a6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — test mock updates required by new import)
**Impact on plan:** Both fixes necessary for test compatibility with new loadManifest import and batch sync behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core refresh and parallel bootstrap logic complete
- Ready for 50-02-PLAN.md: CLI wiring (--refresh, --force, --skip-skills flags) + comprehensive tests

---
*Phase: 50-setup-refresh-mode-and-fast-skill-installation*
*Completed: 2026-03-09*
