---
phase: 64-gsd-installation-switch
plan: 03
subsystem: testing
tags: [vitest, bun, execa, mock, setup, doctor, update, config, get-shit-done-cc]

# Dependency graph
requires:
  - phase: 64-01
    provides: gsdDir removed from PilotConfig, get-shit-done-cc added as dependency
  - phase: 64-02
    provides: setup.ts rewritten for upstream installer, doctor.ts with new GSD checks, update.ts with per-project installer

provides:
  - Test suite updated for upstream installer-based GSD workflow
  - setup.test.ts: 29 tests covering fresh install, refresh, migration cleanup, error handling
  - doctor.test.ts: 16 tests including get-shit-done-cc binary check
  - update.test.ts: 11 tests for new npm update + per-project installer workflow
  - config.test.ts: 66 tests with gsdDir references removed
  - All stale gsdDir references removed from 8 test files

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bun-compatible vi.mock: use direct imports instead of vi.importActual()"
    - "Execa mock pattern: vi.fn() that creates sentinel files to simulate installer"
    - "Test isolation: bun mock contamination is a known pre-existing issue, not new"

key-files:
  created:
    - test/commands/update.test.ts
  modified:
    - test/core/setup.test.ts
    - test/commands/doctor.test.ts
    - test/core/config.test.ts
    - test/commands/add.test.ts
    - test/commands/models.test.ts
    - test/commands/doctor-agents.test.ts
    - test/core/runner-lock.test.ts
    - test/core/runner.test.ts
    - test/core/runner-recovery.test.ts

key-decisions:
  - "Removed gsdDir resolution describe block from config.test.ts (gsdDir deleted from PilotConfig)"
  - "Fixed vi.importActual() calls in doctor.test.ts to use direct imports (bun compatibility)"
  - "GSD_BIN_PATH computed via import.meta.url in doctor tests to match runtime path"
  - "Installer timeout test uses exitCode: null (simulates reject:false behavior, not throw)"
  - "Sentinel file creation in execa mock simulates real installer side effects"

patterns-established:
  - "Mock pattern for execa installer: create sentinel files as side effect in mock"
  - "Bun-compatible node:fs mock: import * as nodeFs and spread manually"

# Metrics
duration: 13min
completed: 2026-03-15
---

# Phase 64 Plan 03: Test Suite Update for Upstream GSD Installer Summary

**Test suite rewritten for upstream installer workflow: 122 tests across 4 files pass in isolation; gsdDir removed from all test mocks; new update.test.ts covers npm update + per-project installer flow**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-15T20:10:39Z
- **Completed:** 2026-03-15T20:23:57Z
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments

- Rewrote `test/core/setup.test.ts` from scratch (symlink-based → installer-based): 29 tests covering fresh install, refresh mode, migration cleanup (removes pilot-gsd symlinks), no-package.json skip, installer failure/timeout, and verifySetup with real/broken/valid symlinks
- Updated `test/commands/doctor.test.ts`: removed all 17 `pilot-gsd` path references, fixed `vi.importActual` bun compatibility issue, added 2 new tests for `get-shit-done-cc` binary check (pass + fail paths)
- Cleaned `test/core/config.test.ts`: removed `gsdDir` resolution describe block (5 tests) and `config file sets gsdDir` test since `gsdDir` no longer exists on `PilotConfig`
- Created `test/commands/update.test.ts`: 11 tests for the new update command (bun update + per-project installer, no-projects path, individual failure continuation, blocked project skipping, JSON output)
- Cleaned `gsdDir` from 5 additional test mock objects (add, models, doctor-agents, runner-lock, runner, runner-recovery)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite setup.test.ts for upstream installer behavior** - `eb1dca2` (test)
2. **Task 2: Update doctor/config tests + remove gsdDir references** - `3a6c16b` (test)

## Files Created/Modified

- `test/core/setup.test.ts` - Fully rewritten: 29 tests, installer mock pattern, migration cleanup, verifySetup
- `test/commands/doctor.test.ts` - Removed pilot-gsd refs, fixed bun mocks, added get-shit-done-cc check tests
- `test/core/config.test.ts` - Removed gsdDir resolution tests (field deleted in Plan 01)
- `test/commands/update.test.ts` - New: 11 tests for bun update + per-project installer workflow
- `test/commands/add.test.ts` - Removed gsdDir from mock
- `test/commands/models.test.ts` - Removed gsdDir from mock
- `test/commands/doctor-agents.test.ts` - Removed gsdDir from mock
- `test/core/runner-lock.test.ts` - Removed gsdDir from mock
- `test/core/runner.test.ts` - Removed gsdDir from mock
- `test/core/runner-recovery.test.ts` - Removed gsdDir from mock

## Decisions Made

1. **vi.importActual incompatibility with bun**: Fixed by importing real modules at file top and manually spreading. Pattern: `import * as nodeFs from 'node:fs'` then `vi.mock('node:fs', () => ({ ...nodeFs, accessSync: vi.fn(...) }))`.
2. **Installer timeout simulation**: With `reject: false`, execa returns `{ exitCode: null }` (not throws). Mock returns this shape instead of throwing.
3. **GSD_BIN_PATH in doctor tests**: Computed via `import.meta.url` to match the runtime path that `doctor.ts` uses for accessSync check.
4. **Sentinel file creation mock**: The execa mock for the installer creates real sentinel files (gsd-help.md, gsd-tools.cjs) in the temp dir, simulating actual installer behavior so verifySetup checks work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `vi.importActual` calls incompatible with bun**
- **Found during:** Task 2 (doctor.test.ts update)
- **Issue:** `vi.importActual` is not a function in the bun test runner. The doctor.test.ts was completely broken (0 tests passing) before our changes.
- **Fix:** Rewrote `vi.mock('node:fs', ...)` and `vi.mock('node:os', ...)` to use direct module imports instead of `vi.importActual`. This also fixed the pre-existing test breakage.
- **Files modified:** test/commands/doctor.test.ts
- **Verification:** All 16 doctor tests now pass
- **Committed in:** 3a6c16b

**2. [Rule 1 - Bug] Fixed missing `fix=true` argument in --fix test**
- **Found during:** Task 2 (doctor.test.ts update)
- **Issue:** Test `calls ensureShellExposure and shows Fixed status when --fix and issues exist` called `doctorCommand(undefined, false, true)` without `fix=true`, causing it to fail.
- **Fix:** Added missing 4th argument `true` to `doctorCommand` call.
- **Files modified:** test/commands/doctor.test.ts
- **Verification:** Test passes with fix=true argument
- **Committed in:** 3a6c16b

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for tests to work. No scope creep.

## Issues Encountered

Cross-test contamination: when running all 4 target files together (vs. individually), bun's module mock state bleeds between test files. This is a pre-existing bun behavior documented in many tests across the project — our changes did not introduce this issue. All 4 test files pass cleanly in isolation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 64 complete: all 3 plans executed
  - Plan 01: Config schema cleanup (gsdDir removed)
  - Plan 02: Source rewrites (setup/update/doctor for upstream installer)
  - Plan 03: Test suite updated to match new behavior
- Full test suite improved: 337 → 334 failing tests (baseline was pre-existing issues unrelated to Plan 64 scope)
- Build passes: `bun run build` success
- Lint passes: `bun run lint` (tsc --noEmit) success

---
*Phase: 64-gsd-installation-switch*
*Completed: 2026-03-15*
