---
phase: 65-gsd-config-pre-seeding-for-autonomous-execution
plan: 02
subsystem: infra
tags: [setup, gsd-config, autonomous-mode, vitest, merge-policy]

# Dependency graph
requires:
  - phase: 65-01
    provides: centralized autonomous config helper with deep merge, PILOT_WINS enforcement, lock safety, and atomic writes
provides:
  - setup lifecycle now enforces autonomous `.planning/config.json` policy for Node projects after installer execution
  - setup regressions covering fresh config creation, non-critical key preservation, and PILOT_WINS drift repair
affects: [65-03, setup, runner]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setup.ts delegates all `.planning/config.json` policy to `ensureAutonomousGsdConfig()`"
    - "setup regressions validate autonomous config behavior using realistic temp project runs"

key-files:
  created: []
  modified:
    - src/core/setup.ts
    - test/core/setup.test.ts

key-decisions:
  - "Run autonomous config enforcement directly in setupProject() after installer path for every Node setup run (fresh + refresh)"
  - "Keep merge/atomic policy centralized in src/core/gsd-config.ts and avoid duplicate config logic in setup.ts"
  - "Use vitest-hoisted execa mock wiring in setup tests so fallback verification remains deterministic when bun is unavailable"

patterns-established:
  - "Pattern: setup integration points call centralized lifecycle helpers rather than reimplementing merge/write behavior"
  - "Pattern: setup tests assert `.planning/config.json` semantics via real temp directories and installer side-effect mocks"

# Metrics
duration: 3 min
completed: 2026-03-15
---

# Phase 65 Plan 02: Setup-Time Autonomous Config Enforcement Summary

**Integrated autonomous config preseeding into `setupProject()` so Node project setup now always repairs or creates `.planning/config.json` in headless-safe mode while preserving non-critical user customizations.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T21:14:40Z
- **Completed:** 2026-03-15T21:17:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired `setupProject()` to invoke `ensureAutonomousGsdConfig(absDir)` after the installer path for Node projects, covering both fresh setup and refresh execution paths
- Added setup regressions validating required autonomous key presence, merge-preservation of non-critical custom keys, and automatic repair of drifted PILOT_WINS values
- Preserved existing setup lifecycle behavior (installer, opencode config, gitignore, git init, shell exposure) while centralizing all planning-config policy in the Phase 65 helper module

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire setupProject to enforce autonomous `.planning/config.json` after installer flow** - `0924151` (feat)
2. **Task 2: Extend setup regression tests for autonomous config creation and merge behavior** - `979c7ca` (test)

## Files Created/Modified

- `src/core/setup.ts` - Imports and calls `ensureAutonomousGsdConfig()` in the Node installer branch and reports enforcement success/failure through setup result semantics
- `test/core/setup.test.ts` - Adds focused coverage for setup-time planning config creation, merge-preservation, and PILOT_WINS drift repair under temp-dir installer mocks

## Decisions Made

- Setup now calls the centralized autonomous config helper after installer execution instead of embedding any config merge/write policy in `setup.ts`
- Autonomous config enforcement errors are appended to `SetupResult.errors` (without aborting unrelated setup steps) to preserve established setup error-handling behavior
- Setup tests use a hoisted `mockExeca` declaration to keep fallback vitest runs reliable when bun is unavailable in the execution environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed setup test execa mock hoisting incompatibility in fallback vitest execution**
- **Found during:** Task 2 verification
- **Issue:** `vi.mock('execa', ...)` referenced `mockExeca` before initialization under fallback `npx vitest`, causing the suite to fail before tests ran
- **Fix:** Switched to `vi.hoisted(() => ({ mockExeca: vi.fn() }))` so mocked execa wiring is hoist-safe in vitest
- **Files modified:** `test/core/setup.test.ts`
- **Verification:** `npx vitest run test/core/setup.test.ts` passes with all tests green
- **Committed in:** `979c7ca`

**2. [Rule 3 - Blocking] Bun unavailable in environment, used equivalent verification commands**
- **Found during:** Task 1 + Task 2 + final verification
- **Issue:** Required `bun run build` and `bun test ...` commands failed with `bun: command not found`
- **Fix:** Executed environment-equivalent fallbacks: `npm run build` and `npx vitest run test/core/setup.test.ts`
- **Files modified:** None
- **Verification:** Build passed and setup test suite passed using fallback commands
- **Committed in:** N/A (execution environment workaround)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** No scope increase; fixes were required to keep setup verification reliable in this environment.

## Issues Encountered

- `bun` binary was not available in the execution environment; all required verification ran successfully via npm/vitest fallbacks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Setup-time autonomous config preseeding is complete and regression-covered
- Runner-time pre-spawn config assertion work can proceed in `65-03` using the same centralized helper contract
- Ready for `65-03-PLAN.md`

---
*Phase: 65-gsd-config-pre-seeding-for-autonomous-execution*
*Completed: 2026-03-15*
