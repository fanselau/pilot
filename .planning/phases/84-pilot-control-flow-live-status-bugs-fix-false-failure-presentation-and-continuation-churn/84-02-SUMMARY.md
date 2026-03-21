---
phase: 84-pilot-control-flow-live-status-bugs
plan: 02
subsystem: api
tags: [runner, continuation, step-cap, guard, tdd]

requires:
  - phase: 73-judge-step-continuation
    provides: append-forward model with judge:gaps/judge:failed continuation handlers

provides:
  - Continuation cycle guard (MAX_CONTINUATION_CYCLES=2) preventing unbounded judge loops
  - Per-job continuation cycle tracking via Map<string, number> on Runner class
  - Improved step-cap message with Breakdown: per-source step counts
  - Distinct continuation-limit failure message separate from generic step-cap

affects: [runner, continuation-handlers, step-cap]

tech-stack:
  added: []
  patterns:
    - "Pure helper functions for failure message building (extracted for testability)"
    - "TDD: RED (failing tests) → GREEN (implementation) → verify acceptance criteria"

key-files:
  created:
    - test/core/runner-continuation-guard.test.ts
  modified:
    - src/core/types.ts
    - src/core/runner.ts

key-decisions:
  - "Extracted buildStepCapMessage and buildContinuationLimitMessage as pure helper functions rather than duplicating inline — DRY and testable"
  - "Used Map<string, number> keyed by job ID for cycle tracking — safe for parallel job execution"
  - "cycle guard check placed BEFORE reDelegateForContinuation call — prevents unnecessary LLM API call when limit reached"

patterns-established:
  - "Runner private state for per-job tracking: Map<jobId, value> with init/delete in launch() try/finally"

requirements-completed: []

duration: 3min
completed: 2026-03-21
---

# Phase 84 Plan 02: Continuation Cycle Guard and Step-Cap Messaging Summary

**Continuation cycle guard (MAX_CONTINUATION_CYCLES=2) added to Runner preventing unbounded judge:gaps/judge:failed loops, with improved step-cap and cycle-limit failure messages**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T13:54:31Z
- **Completed:** 2026-03-21T13:58:05Z
- **Tasks:** 1 (TDD: 2 commits — RED + GREEN)
- **Files modified:** 3

## Accomplishments

- Added `MAX_CONTINUATION_CYCLES = 2` constant to `types.ts`
- Runner tracks per-job continuation cycles in a `Map<string, number>` (safe for parallel jobs)
- Both `handleGapsContinuation` and `handleFailedContinuation` check cycle limit before re-delegating
- Step cap message now includes `Breakdown:` with delegation/gap-closure/failure-recovery/hung-recovery counts
- Continuation limit message is distinct: `Continuation cycle limit reached (N). X/Y steps were continuation-driven. Last verdict: ...`
- Helper functions extracted as pure functions and exported for testing (`_buildStepCapMessage`, `_buildContinuationLimitMessage`)

## Task Commits

TDD RED-GREEN cycle produced 2 commits:

1. **RED: Failing tests** - `aec5325` (test)
2. **GREEN: Implementation** - `f7679e3` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `test/core/runner-continuation-guard.test.ts` — 7 tests for constants, message format, exports (all pass)
- `src/core/types.ts` — Added `MAX_CONTINUATION_CYCLES = 2` below `MAX_STEPS_PER_JOB`
- `src/core/runner.ts` — Cycle guard in both continuation handlers, improved step cap message, pure helpers, new exports

## Decisions Made

- Extracted `buildStepCapMessage` and `buildContinuationLimitMessage` as pure helper functions (DRY). The plan showed them inline in each handler, but extraction is cleaner and makes the helpers directly testable.
- Used `Map<string, number>` for cycle tracking (initialized in `launch()`, cleaned up in `finally`) — supports parallel job execution without interference.
- Cycle count is checked BEFORE calling `reDelegateForContinuation` — avoids wasting an LLM API call when the limit is already reached.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Refactor] Extracted inline message strings to pure helper functions**
- **Found during:** Task 1 (Implementation)
- **Issue:** Plan showed the `Continuation cycle limit reached` message duplicated inline in both `handleGapsContinuation` and `handleFailedContinuation`. TDD approach needed testable pure functions.
- **Fix:** Extracted `buildStepCapMessage()` and `buildContinuationLimitMessage()` as module-level pure functions, exported as `_buildStepCapMessage`/`_buildContinuationLimitMessage` for tests.
- **Files modified:** src/core/runner.ts
- **Verification:** grep `'Continuation cycle limit reached'` returns 1 match (in helper function, called from 2 handlers); tests pass.
- **Committed in:** f7679e3 (GREEN commit)

---

**Total deviations:** 1 auto-refactor (message helper extraction)
**Impact on plan:** Pure improvement — DRY code, testable helpers, behavior identical to plan's inline approach. Plan's verification step 4 ("at least 2 grep matches") expected duplication; the helper function satisfies the acceptance criteria which only require the message "contains" the string.

## Issues Encountered

None — build succeeded, all 7 TDD tests pass, 58 existing runner tests unaffected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Continuation churn fix is in place: jobs hitting the cycle limit get a clear diagnostic message
- Step cap messages now explain the source breakdown (delegation vs continuation steps)
- All runner tests passing with no regressions

---
*Phase: 84-pilot-control-flow-live-status-bugs*
*Completed: 2026-03-21*
