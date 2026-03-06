---
quick: 066
subsystem: runner
tags: [judge, gsd-judge, runner, callback, tests]
key-files:
  created: []
  modified:
    - src/core/runner.ts
    - src/core/callback.ts
    - test/core/runner.test.ts
decisions:
  - "runJudge extracts JSON from last assistant message of judge session (same pattern as delegation)"
  - "Verdict mapping: succeeded→pass, failed→fail, doubting≥50→pass, doubting<50→fail"
  - "Judge crash or unparseable → benefit of doubt (succeeded, confidence 0, reason 'judge unavailable')"
  - "Callback payload includes verdict/confidence/reason as structured fields alongside message text"
metrics:
  completed: "2026-03-06"
---

# Quick Task 066: Judge Integration — Runner Adapts to gsd-judge

**One-liner:** Replace VERIFICATION.md disk-parsing with gsd-judge AI session producing structured JSON verdicts (succeeded/failed/doubting).

## What Was Done

Replaced the runner's brittle VERIFICATION.md file-parsing verification step with a `gsd-judge` AI session that outputs structured JSON. The judge spawns after execute-phase completes, its JSON verdict determines job outcome, and its reason string flows into the callback webhook payload.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace runVerification with runJudge, update types | 427e4ea | src/core/runner.ts |
| 2 | Add verdict/reason/confidence to callback webhook payload | 505ef22 | src/core/callback.ts |
| 3 | Update tests for new judge verdict shape, remove verification tests | 3ef8a61 | test/core/runner.test.ts |

## Changes Made

### src/core/runner.ts
- **JudgeVerdict interface** updated: `verdict: 'succeeded' | 'failed' | 'doubting'`, `confidence: number`, `reason: string` — removed `retryRecommendation`, `retryHint`, `summary`
- **VerificationResult interface** deleted (dead type)
- **runVerification method** deleted (replaced by runJudge)
- **parseVerificationResult function** deleted (dead code)
- **runJudge method** added: spawns `gsd-judge <jobId> <phaseNum>`, extracts JSON from last assistant message via `exportSessionFromDb` + `findSessionByTitle` (same pattern as delegation)
- **Verdict mapping** in `launch()`: succeeded→pass, failed→throw, doubting≥50→pass, doubting<50→throw, null→benefit of doubt
- **isJudge check** updated: `command === 'gsd-judge'` only (removed `gsd-verify-phase` and `pilot-judge`)
- **exportSessionFromDb** added to opencode-db.js import
- **VerificationResult** removed from type exports

### src/core/callback.ts
- Judge verdict parsed from `job.judgeVerdict` JSON
- Verdict/confidence/reason lines appended to human-readable message
- Structured `verdict`, `confidence`, `reason` fields added to POST body

### test/core/runner.test.ts
- Module doc comment updated (removed parseVerificationResult mention)
- `parseVerificationResult` removed from imports
- All `parseJudgeVerdict` tests updated: `pass`→`succeeded`, `fail`→`failed`, `partial`→`doubting`, `summary`→`reason`, removed `retryRecommendation`/`retryHint`
- Entire `parseVerificationResult` describe block deleted (111 lines)
- "no auto-retry" describe renamed to "judge verdict edge cases" with updated tests
- New `doubting` verdict test added

## Verification

- `npx tsc --noEmit` passes ✓
- `npx vitest run` passes: 479 tests ✓
- `grep -r 'gsd-verify-phase' src/` returns nothing ✓
- `grep -r 'VERIFICATION.md' src/core/runner.ts` returns nothing ✓
- `grep -r 'parseVerificationResult' src/ test/` returns nothing ✓
- `grep -r 'VerificationResult' src/ test/` returns nothing ✓
- `grep 'gsd-judge' src/core/runner.ts` finds new command name ✓

## Deviations from Plan

None — plan executed exactly as written.
