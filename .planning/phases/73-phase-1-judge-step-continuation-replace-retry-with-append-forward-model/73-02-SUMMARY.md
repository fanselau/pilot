---
phase: 73-phase-1-judge-step-continuation
plan: 02
subsystem: judge
tags: [judge, verdict, gaps, append-forward]

# Dependency graph
requires:
  - phase: 68-judge-system
    provides: "Judge prompt and signal infrastructure"
provides:
  - "Updated judge verdict schema: passed/gaps_found/failed"
  - "Gaps array in judge signal for gap-closure routing"
  - "Backward-compatible verdict mapping for legacy values"
affects: [73-03-runner-step-loop, 73-04-delegation-requery]

# Tech tracking
tech-stack:
  added: []
  patterns: ["append-forward verdict model (gaps_found → re-delegate instead of retry)"]

key-files:
  created: []
  modified:
    - src/prompts/judge.md
    - src/core/judge-signal.ts
    - test/core/judge-signal.test.ts

key-decisions:
  - "doubting and partial legacy verdicts now map to 'gaps' outcome (not 'doubt'/'partial') for append-forward model alignment"
  - "Retry fields (retryRecommendation, retryHint, failureFingerprint) kept in signal types for backward compat with old DB verdicts"
  - "Evidence-absent rules updated: 'partial' → 'gaps_found', empty transcript → 'failed'"

patterns-established:
  - "Verdict transition mapping: legacy values coexist with new canonical values in VERDICT_TO_OUTCOME"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 73 Plan 02: Judge Verdict Schema Update Summary

**Judge verdict schema updated to passed/gaps_found/failed with gaps array, legacy doubting/partial mapped to gaps for append-forward model**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T13:30:10Z
- **Completed:** 2026-03-20T13:34:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Judge prompt now uses `passed`/`gaps_found`/`failed` verdicts with concrete `gaps` array
- Removed `retryRecommendation`, `retryHint`, `failureFingerprint` from judge prompt output schema
- `judge-signal.ts` handles all 8 verdict values (5 legacy + 3 new) with proper outcome mapping
- Legacy `doubting`/`partial` verdicts transition to `gaps` outcome for append-forward compatibility
- All 15 existing judge-signal tests pass (2 updated for transition mapping)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update judge prompt for new verdict schema** - `00ef7fb` (feat)
2. **Task 2: Update judge-signal.ts for new verdict values** - `8f55778` (feat)

## Files Created/Modified
- `src/prompts/judge.md` - Updated verdict schema, removed retry fields, added backward compat guidance
- `src/core/judge-signal.ts` - Added gaps_found/passed verdict values, gaps field, updated VERDICT_TO_OUTCOME
- `test/core/judge-signal.test.ts` - Updated doubting→gaps and partial→gaps test expectations

## Decisions Made
- **Legacy verdict transition**: `doubting` and `partial` now map to `'gaps'` outcome instead of `'doubt'`/`'partial'`. This aligns with the append-forward model where any incomplete work triggers gap closure, not retries.
- **Kept retry fields in types**: `retryRecommendation`, `retryHint`, `failureFingerprint` remain in `ParsedJudgeVerdictPayload` and `JudgeSignal` interfaces for backward compatibility with old verdicts stored in the database. Removed from the judge prompt only.
- **Evidence-absent rules**: Updated from `"partial"` to `"gaps_found"` default when VERIFICATION.md absent, and from `"partial"` to `"failed"` when transcript also unavailable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing tests for verdict mapping transition**
- **Found during:** Task 2 (judge-signal.ts update)
- **Issue:** Two existing tests expected `doubting` → `'doubt'` and `partial` → `'partial'` outcomes, which now map to `'gaps'`
- **Fix:** Updated test expectations to match new VERDICT_TO_OUTCOME mapping
- **Files modified:** test/core/judge-signal.test.ts
- **Verification:** All 15 tests pass
- **Committed in:** 8f55778 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Expected consequence of changing verdict mapping. Tests correctly updated to reflect new behavior.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Judge verdict schema is ready for Plan 03 (runner step execution loop)
- Runner can now check for `gaps_found` verdict and `gaps` array to trigger re-delegation
- Legacy verdict backward compat ensures old DB records still parse correctly

---
*Phase: 73-phase-1-judge-step-continuation*
*Completed: 2026-03-20*
