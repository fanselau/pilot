---
phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration
plan: 03
subsystem: runner
tags: [debug-lane, model-routing, scope-resolution, spawnAndWait, regression-test]

requires:
  - phase: 91-02
    provides: debug lane executeDebugFlow + continueDebugAfterVerify implementation

provides:
  - Fixed spawnAndWait scope resolution using job.scope first (not inlinePrompt heuristic)
  - Regression test ensuring debug sessions resolve 'debug' scope for model selection

affects:
  - runner scope resolution for all inline-prompt sessions (judge and debug)

tech-stack:
  added: []
  patterns:
    - "Job-scope-first resolution: read job.scope before falling back to inlinePrompt heuristic"

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - test/core/runner-debug-lane.test.ts

key-decisions:
  - "Use jobEntry?.job.scope as primary scope source in spawnAndWait — inline prompt presence alone does not imply judge scope"
  - "Fallback chain: job.scope → (inlinePrompt ? 'judge' : 'quick') — preserves backward compat for edge case where no activeJob entry exists"
  - "Expose mockResolveTopLevelModel from buildDebugEnv to enable scope-call inspection in regression tests"

patterns-established:
  - "Scope resolution pattern: always prefer job's explicit scope over session-type heuristics"

requirements-completed:
  - DBG-01
  - DBG-05

duration: 3min
completed: 2026-03-23
---

# Phase 91 Plan 03: Debug Scope Model Resolution Fix Summary

**Fixed spawnAndWait to use job.scope for model resolution — debug sessions now correctly resolve 'debug' scope instead of being hardcoded to 'judge' scope via the inlinePrompt heuristic.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T17:04:31Z
- **Completed:** 2026-03-23T17:08:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed spawnAndWait scope resolution: reads `job.scope` first, falls back to `'judge'` only when no job scope AND inlinePrompt present
- Debug sessions now correctly resolve `'debug'` scope → `_top:quick` model in resolveTopLevelModel (instead of `_top:judge`)
- Added regression test that inspects resolveTopLevelModel mock calls to assert debug scope (not judge scope) is used
- All 18 debug-lane tests pass; full suite 1317 tests pass

## Task Commits

1. **Task 1: Fix spawnAndWait scope resolution for inline-prompt sessions** - `0ae29be` (fix)
2. **Task 2: Add regression test for debug-scope model resolution in spawnAndWait** - `c5ba5d9` (test)

## Files Created/Modified

- `src/core/runner.ts` - Replaced `isJudge` heuristic with `jobScope` variable; scope now reads from job first
- `test/core/runner-debug-lane.test.ts` - Exposed `mockResolveTopLevelModel` from buildDebugEnv; added 'debug scope model selection' describe block with regression test

## Decisions Made

- Used `jobEntry?.job.scope` as primary scope, with `inlinePrompt !== undefined ? 'judge' : 'quick'` as fallback. This preserves backward compatibility for any edge case where the job isn't in activeJobs, while fixing the primary bug where debug sessions incorrectly got judge scope.
- Chose to expose `mockResolveTopLevelModel` from `buildDebugEnv` (vs. inspecting execa `--model` args) because the mock returns the same model regardless of scope — the only reliable way to verify scope is to inspect the call arguments directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 complete: debug sessions now correctly use 'debug' scope for model selection
- Ready for Plan 04 (if any)

---
*Phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration*
*Completed: 2026-03-23*
