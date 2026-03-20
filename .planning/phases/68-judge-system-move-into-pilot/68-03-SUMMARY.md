---
phase: 68-judge-system-move-into-pilot
plan: 03
subsystem: runner
tags: [judge, inline-prompt, opencode, runner, verification, evidence]

# Dependency graph
requires:
  - phase: 68-02
    provides: judge.md prompt created in src/prompts/
  - phase: 68-01
    provides: JudgeVerdict schema and judge system foundation
provides:
  - runJudge() using inline prompt from src/prompts/judge.md
  - VERIFICATION.md + VALIDATION.md evidence reading from disk
  - Judge spawned via inline prompt (no --command gsd-judge)
  - spawnAndWait() extended with inlinePrompt parameter
affects:
  - 68-04  # Next plan in phase

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline prompt pattern for judge (mirrors delegation pattern)"
    - "Evidence context injection: pre-read disk files, append to prompt"
    - "inlinePrompt flag on spawnAndWait() to route between --command and positional arg modes"

key-files:
  created: []
  modified:
    - src/core/runner.ts

key-decisions:
  - "Used simpler refactor approach: added inlinePrompt optional param to spawnAndWait() rather than duplicating polling logic"
  - "isJudge detection now checks inlinePrompt !== undefined (not command === 'gsd-judge')"
  - "VERIFICATION.md validated: must be >100 bytes to count as valid evidence"
  - "readFileSync + readdirSync for evidence reading (avoids globSync Node 22+ dep)"

patterns-established:
  - "Judge: inline prompt with pre-loaded evidence context, same as delegation"
  - "Evidence absent: VERIFICATION.md absent → note in prompt, default partial confidence ≤40"

# Metrics
duration: 3min
completed: 2026-03-16
---

# Phase 68 Plan 03: runJudge() Inline Prompt Rewrite Summary

**Rewrote runJudge() to load judge.md inline prompt, pre-read VERIFICATION.md + VALIDATION.md evidence from disk, and spawn judge via positional arg (no --command gsd-judge), eliminating pilot-gsd dependency for judge sessions.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T00:57:55Z
- **Completed:** 2026-03-16T01:01:38Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added module-level `JUDGE_PROMPT` loading from `src/prompts/judge.md` via `fileURLToPath` + `import.meta.url`
- Added `readVerificationEvidence()` and `readValidationEvidence()` helpers that scan `.planning/phases/<N>-*/` for evidence files
- Rewrote `runJudge()` to build inline evidence context and pass to `spawnAndWait` as `inlinePrompt`
- Extended `spawnAndWait()` with optional `inlinePrompt` param — when provided, spawns with positional arg (no `--command` flag); when absent, uses standard `--command gsdCommand` path
- Updated `isJudge` detection from `command === 'gsd-judge'` to `inlinePrompt !== undefined`
- Removed all `gsd-judge` references from `src/`

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite runJudge() to use inline prompt with evidence context** - `c1aafb9` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/core/runner.ts` - Added JUDGE_PROMPT loading, evidence helpers, rewrote runJudge(), extended spawnAndWait()

## Decisions Made

- **Simpler refactor approach**: Added `inlinePrompt` optional param to existing `spawnAndWait()` rather than duplicating the polling logic in a separate method. Cleaner, less code, same functionality.
- **isJudge via inlinePrompt flag**: More explicit and less fragile than checking command string value.
- **readFileSync + readdirSync for evidence**: Avoids `globSync` (Node 22+ only) dependency; simple and reliable.
- **VERIFICATION.md validation**: Files must be >100 bytes to count as valid evidence, matches judge.md spec.

## Deviations from Plan

None — plan executed exactly as written. Chose the "simpler alternative approach" suggested in the plan (refactor `spawnAndWait` rather than duplicate polling logic).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 complete: runJudge() now uses inline prompt pattern, identical to delegation
- No `--command gsd-judge` calls remain anywhere in `src/`
- Ready for Plan 04 (final plan in phase 68)

---
*Phase: 68-judge-system-move-into-pilot*
*Completed: 2026-03-16*
