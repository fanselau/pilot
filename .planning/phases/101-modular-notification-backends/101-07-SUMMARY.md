---
phase: 101-modular-notification-backends
plan: 07
subsystem: testing
tags: [vitest, mocking, runner, debug-lane, skills, runtime-agent-skills]

# Dependency graph
requires:
  - phase: 99-pilot-runtime-agent-skills-patching
    provides: runtime-agent-skills.ts exports used by runner.ts
provides:
  - Fixed debug-lane integration tests (18/18 passing)
  - Updated mock factories matching current runner.ts imports
affects: [101-modular-notification-backends]

# Tech tracking
tech-stack:
  added: []
  patterns: [vi.doMock factory completeness pattern for runner tests]

key-files:
  created: []
  modified:
    - test/core/runner-debug-lane.test.ts

key-decisions:
  - "Added cleanupInstalledSkills to skills.js mock, applyRuntimeAgentSkillsPatch/restoreRuntimeAgentSkillsPatch to runtime-agent-skills.js mock, and updateJobRuntimeSkillSnapshot to db.js mock — all missing exports that runner.ts imports"

patterns-established:
  - "Runner test mocks must include all exports imported by runner.ts, even if the test doesn't exercise them directly"

requirements-completed: [NBACK-TESTS]

# Metrics
duration: 1min
completed: 2026-03-30
---

# Phase 101 Plan 07: Fix Debug-Lane Tests Summary

**Fixed 15 failing runner-debug-lane tests by adding missing vi.doMock exports for cleanupInstalledSkills, runtime-agent-skills.js, and updateJobRuntimeSkillSnapshot**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-30T12:35:58Z
- **Completed:** 2026-03-30T12:37:39Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- All 18 runner-debug-lane tests now pass (was 15 failing, 3 passing)
- Added `cleanupInstalledSkills` to skills.js mock factory
- Added complete `runtime-agent-skills.js` mock with `applyRuntimeAgentSkillsPatch` and `restoreRuntimeAgentSkillsPatch`
- Added `updateJobRuntimeSkillSnapshot` to db.js mock factory

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix stale vi.doMock factories in runner-debug-lane.test.ts** - `83975b5` (fix)

## Files Created/Modified
- `test/core/runner-debug-lane.test.ts` - Added missing mock exports for skills.js, runtime-agent-skills.js, and db.js

## Decisions Made
- Added `updateJobRuntimeSkillSnapshot` to db.js mock — the runtime-agent-skills restore path calls this db function, and the missing mock was causing all test failures (the error message pointed to skills/runtime-agent-skills but the actual blocker was the db export)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added updateJobRuntimeSkillSnapshot to db.js mock**
- **Found during:** Task 1 (Fix stale vi.doMock factories)
- **Issue:** Plan only identified missing exports in skills.js and runtime-agent-skills.js mocks, but runner.ts also imports `updateJobRuntimeSkillSnapshot` from db.js which was missing from the db mock. The restore path in runner.ts calls this function, causing "No export is defined on mock" errors that crashed all 15 tests.
- **Fix:** Added `updateJobRuntimeSkillSnapshot: vi.fn()` to the db.js mock factory
- **Files modified:** test/core/runner-debug-lane.test.ts
- **Verification:** All 18 tests pass
- **Committed in:** 83975b5

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Debug-lane tests fully passing
- Ready for next plan in Phase 101

---
*Phase: 101-modular-notification-backends*
*Completed: 2026-03-30*
