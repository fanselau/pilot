---
phase: 68-judge-system-move-into-pilot
plan: 01
subsystem: infra
tags: [judge, verdict, typescript, prompts, retry, inline-prompt]

# Dependency graph
requires:
  - phase: 66-delegation-pipeline-redesign
    provides: inline prompt pattern from src/prompts/delegate.md
  - phase: 31-automated-phase-verification
    provides: VERIFICATION.md format the judge reads as primary evidence
provides:
  - Canonical merged judge prompt at src/prompts/judge.md
  - pass/fail/partial verdict schema with retryRecommendation, retryHint, failureFingerprint
  - Evidence strategy specification (VERIFICATION.md primary, VALIDATION.md optional, transcript fallback)
affects:
  - 68-02 (runner.ts runJudge update depends on this prompt)
  - 68-03 (judge-signal.ts types depend on new verdict schema defined here)
  - 68-04 (tests depend on verdict schema)

# Tech tracking
tech-stack:
  added: []
  patterns:
  - "Inline prompt pattern: no YAML frontmatter, loaded by TypeScript code at runtime"
  - "Evidence-hierarchy pattern: primary artifact (VERIFICATION.md) + optional enrichment (VALIDATION.md) + fallback (transcript)"

key-files:
  created:
    - src/prompts/judge.md
  modified: []

key-decisions:
  - "Merged two divergent judge prompts (gsd-judge.md + pilot-judge.md) into ONE canonical format"
  - "Used pilot-judge.md richer structure as base, incorporated gsd-judge.md practical evidence-gathering approach"
  - "Verdict values: pass/fail/partial (not succeeded/failed/doubting) — cleaner, standard terminology"
  - "retryRecommendation: string 'retry-resume'/'retry-full'/'none' (not null) — explicit string safer for JSON parsing"
  - "No YAML frontmatter — inline prompt pattern matching src/prompts/delegate.md"
  - "VERIFICATION.md confidence ceiling: ≤ 40 when absent, prevents false passes from transcript alone"

patterns-established:
  - "Judge prompt: read-only, inline, no frontmatter — same as delegate.md pattern"
  - "Evidence hierarchy: primary disk artifact + optional enrichment + fallback transcript"

# Metrics
duration: 1min
completed: 2026-03-16
---

# Phase 68 Plan 01: Create Canonical Judge Prompt Summary

**Single canonical judge prompt at src/prompts/judge.md merging gsd-judge.md and pilot-judge.md with pass/fail/partial verdicts, retryRecommendation, retryHint, and failureFingerprint fields**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-16T00:49:13Z
- **Completed:** 2026-03-16T00:50:17Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `src/prompts/judge.md` — the single canonical judge prompt used for all phase verdict evaluation
- Merged two divergent prompts: `gsd-judge.md` (simpler, active, wrong verdict values) and `pilot-judge.md` (richer format, correct values but unused)
- Established new verdict schema: `pass`/`fail`/`partial` (replacing `succeeded`/`failed`/`doubting`)
- Added all three new required fields: `retryRecommendation`, `retryHint`, `failureFingerprint`
- Defined evidence hierarchy: VERIFICATION.md (primary) → VALIDATION.md (optional enrichment) → session transcript (fallback)
- Evidence-absent rule: confidence ≤ 40 when VERIFICATION.md missing, prevents false pass verdicts
- No YAML frontmatter — matches inline prompt pattern of `src/prompts/delegate.md`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create merged canonical judge prompt** - `cc5ff73` (feat)

**Plan metadata:** _(pending — final docs commit)_

## Files Created/Modified

- `src/prompts/judge.md` — Canonical judge prompt: role preamble, 6-step evidence gathering, assessment criteria, JSON verdict schema with all 6 required fields, evidence-absent rules, operational constraints

## Decisions Made

- **Merge into ONE prompt**: Two prompts with different formats creates drift and confusion. Pilot-judge.md's richer format (retryRecommendation, structured output) used as the structural base.
- **Verdict values `pass`/`fail`/`partial`**: Cleaner, shorter, standard terminology. Replaces `succeeded`/`failed`/`doubting`.
- **`retryRecommendation` as string not null**: Explicit string `'none'` | `'retry-resume'` | `'retry-full'` is safer than null for JSON parsing downstream.
- **No YAML frontmatter**: This is an inline prompt loaded by TypeScript code, not an opencode command. Matches `delegate.md` pattern.
- **Confidence ceiling ≤ 40 without VERIFICATION.md**: Prevents the judge from confidently passing a phase based solely on transcript parsing, which is lower-quality evidence.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/prompts/judge.md` is ready as the foundation for all Phase 68 work
- Plan 02: Update `runJudge()` in `runner.ts` to load from `src/prompts/` as inline prompt
- Plan 03: Update `judge-signal.ts` types for new verdict schema (`VERDICT_TO_OUTCOME`, `ParsedJudgeVerdictPayload`)
- Plan 04: Tests for all Phase 68 changes
- No blockers.

---
*Phase: 68-judge-system-move-into-pilot*
*Completed: 2026-03-16*
