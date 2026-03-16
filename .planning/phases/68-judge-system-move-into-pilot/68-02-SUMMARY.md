---
phase: 68-judge-system-move-into-pilot
plan: 02
subsystem: judge
tags: [judge, verdicts, types, runner, backward-compat, retry]

# Dependency graph
requires:
  - phase: 68-01
    provides: judge system scaffolding and initial types
provides:
  - Dual-format JudgeVerdictValue supporting both legacy (succeeded/failed/doubting) and new (pass/fail/partial) formats
  - retryRecommendation, retryHint, failureFingerprint fields on JudgeSignal and ParsedJudgeVerdictPayload
  - Extended JudgeVerdict interface in runner.ts with optional retry fields
  - parseJudgeVerdict validating all 6 verdict values
  - runJudgeAndHandleResult routing pass/partial/fail correctly
affects: [68-03, 68-04, judge-runner, verdict-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-format type union for backward-compatible verdict values"
    - "Optional retry fields on verdict types for progressive enrichment"

key-files:
  created: []
  modified:
    - src/core/judge-signal.ts
    - src/core/runner.ts

key-decisions:
  - "retryRecommendation/retryHint/failureFingerprint are optional (?) in JudgeVerdict to allow legacy verdicts without these fields"
  - "VERDICT_TO_OUTCOME maps both old and new verdict strings in a single Record"
  - "partial verdict with confidence >= 50 treated as pass in runJudgeAndHandleResult"

patterns-established:
  - "Backward-compat via union type expansion: add new values to existing union rather than replacing"

# Metrics
duration: 2min
completed: 2026-03-16
---

# Phase 68 Plan 02: Extend Judge Types for Dual-Format Verdict Support Summary

**Extended JudgeSignal, ParsedJudgeVerdictPayload, and JudgeVerdict with retry fields and dual-format verdict values (pass/fail/partial alongside legacy succeeded/failed/doubting)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-16T00:53:13Z
- **Completed:** 2026-03-16T00:55:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `JudgeSignalOutcome` to include `'partial'` alongside existing values
- Added `retryRecommendation`, `retryHint`, `failureFingerprint` to both `ParsedJudgeVerdictPayload` and `JudgeSignal`
- Updated `VERDICT_TO_OUTCOME` to map all 6 verdict values (3 legacy + 3 new)
- Extended `JudgeVerdict` interface in runner.ts with optional retry fields for progressive enrichment
- Updated `parseJudgeVerdict` to validate all 6 verdict string values
- Updated `runJudgeAndHandleResult` to handle `pass` and `partial` alongside legacy `succeeded`/`doubting`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend judge-signal.ts with new verdict values and retry fields** - `a1d8b2e` (feat)
2. **Task 2: Extend JudgeVerdict in runner.ts and update parseJudgeVerdict for dual-format support** - `39b8ea9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/core/judge-signal.ts` - Added `'partial'` to `JudgeSignalOutcome`, extended `JudgeVerdictValue` union, added retry fields to `ParsedJudgeVerdictPayload` and `JudgeSignal`, updated `VERDICT_TO_OUTCOME` and `buildJudgeSignal`
- `src/core/runner.ts` - Extended `JudgeVerdict` interface with optional retry fields and new verdict values, updated `parseJudgeVerdict` validation, updated `runJudgeAndHandleResult` verdict routing

## Decisions Made

- **retryRecommendation/retryHint/failureFingerprint are optional (`?`)** in `JudgeVerdict` to allow legacy judge output without these fields — the parser must not reject old-format verdicts
- **VERDICT_TO_OUTCOME single map** handles both old and new values in a single `Record` — clean, no branching logic needed
- **`partial` verdict routing**: `partial` with confidence >= 50 is treated the same as `doubting` >= 50 (treated as pass), `partial` with low confidence falls to the failure branch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test infrastructure issue: `test/core/runner.test.ts` fails with `vi.importActual is not a function` — this failure exists before this plan's changes and is unrelated to the type updates made here. The failure was confirmed present on the original code via `git stash` test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Type layer complete — Plan 03 can now use the extended types to rewrite `runJudge` to call the embedded judge prompt
- Both old format (`succeeded`/`failed`/`doubting`) and new format (`pass`/`fail`/`partial`) are handled in all paths
- `bun test test/core/judge-signal.test.ts` passes (10/10)
- `npx tsc --noEmit` passes cleanly

---
*Phase: 68-judge-system-move-into-pilot*
*Completed: 2026-03-16*
