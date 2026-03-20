---
phase: 70-phase-auto-retry-on-verification-failure
plan: 02
subsystem: runner
tags: [runner, retry, verification, gaps, fingerprint, vitest]

# Dependency graph
requires:
  - phase: 70-phase-auto-retry-on-verification-failure
    provides: persisted retry metadata and attempt archive helpers from 70-01
  - phase: 68-judge-system-move-into-pilot
    provides: judge verdict schema with retryRecommendation/retryHint/failureFingerprint
provides:
  - deterministic retryable-verification normalization for null/partial/fail verdict paths
  - budgeted plan-and-execute retry orchestration with retry-resume gap routing and fingerprint escalation
  - regression coverage for retry policy, evidence gating, and retry context propagation
affects: [phase-70-03-retry-controls, phase-70-04-retry-observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "retry-resume is gated by strict VERIFICATION evidence validation"
    - "same-fingerprint escalation short-circuits before retry budget consumption"
    - "retry orchestration reuses shared retry_count/retry_budget contract across failure types"

key-files:
  created: []
  modified: [src/core/runner.ts, test/core/runner.test.ts, test/core/runner-recovery.test.ts]

key-decisions:
  - "Treat null judge output as retryable fail with retry-full metadata instead of synthetic success."
  - "Honor retry-resume only when VERIFICATION evidence is well-formed and >100 bytes; otherwise force retry-full."
  - "Schedule retries by persisting retry metadata, resetting to pending, then relaunching in-process to keep lineage deterministic."

patterns-established:
  - "Plan-and-execute retry loops are strategy-driven by runner policy, not delegated heuristics."
  - "Retry context is persisted as retry_hint and mapped into resumeHint payloads for subsequent attempts."

# Metrics
duration: 11 min
completed: 2026-03-16
---

# Phase 70 Plan 02: Runner Verification Auto-Retry Orchestration Summary

**Runner-level verification failures now auto-retry deterministically with strict resume gating, same-fingerprint escalation, and shared retry-budget enforcement.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-16T03:26:28Z
- **Completed:** 2026-03-16T03:38:27Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Normalized judge outcomes so only `pass`/`succeeded` are terminal-pass; `null`, `partial`, and all failure outcomes become retryable verification failures.
- Added strict VERIFICATION evidence validation and forced `retry-full` fallback whenever `retry-resume` lacks well-formed evidence (>100 bytes + required structure).
- Implemented budgeted retry orchestration in `handlePlanAndExecute(...)`, including fingerprint escalation, persisted retry metadata updates, and in-process retry relaunch.
- Enforced gap-retry execution semantics with `plan-phase --gaps` + `execute-phase --gaps-only`.
- Added focused regressions for null/partial handling, malformed evidence fallback, same-fingerprint escalation, and retryHint propagation into retry context.

## Task Commits

Each task was committed atomically:

1. **Task 1: Normalize judge outcomes into strict retryable-verification policy** - `5550e62` (feat)
2. **Task 2: Add budgeted verification retry orchestration with fingerprint escalation** - `bab206e` (feat)
3. **Task 3: Lock retry behavior with focused regression tests** - `229f74d` (test)

**Plan metadata:** `0ffbfa8` (docs)

## Files Created/Modified

- `src/core/runner.ts` - Added strict verdict normalization, retry decision helpers, budgeted retry loop, fingerprint escalation, retry context wiring, and `--gaps-only` execution path.
- `test/core/runner.test.ts` - Added retry-metadata parsing regression for fail verdict payloads.
- `test/core/runner-recovery.test.ts` - Added verification retry orchestration regressions (null/partial handling, malformed evidence fallback, same-fingerprint escalation, budgeted retry path assertions).

## Decisions Made

- Null judge outcomes are no longer treated as benefit-of-doubt success; they now produce retryable fail metadata (`retry-full`) to preserve deterministic recovery behavior.
- Retry strategy is resolved in runner code (not delegation): `retry-resume` is accepted only when VERIFICATION evidence is structurally valid and substantial.
- Same failure fingerprints are treated as immediate escalation signals to avoid wasting remaining retry budget on identical defects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented false completion when verification path already reset job to pending**
- **Found during:** Task 2 (retry orchestration wiring)
- **Issue:** `launch()` always marked jobs completed after intent execution, even if verification handling had already reset status to `pending`.
- **Fix:** Added a status guard before completion to exit early when job is no longer `running`.
- **Files modified:** `src/core/runner.ts`
- **Verification:** `npm test -- test/core/runner.test.ts test/core/runner-recovery.test.ts` and `npm run lint`
- **Committed in:** `bab206e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was required to keep retry scheduling truthful and avoid completion-state corruption during retry/reset flows.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runner now handles verification retry routing deterministically and only blocks projects on explicit terminal outcomes.
- Ready for `70-03-PLAN.md` to wire queue-time retry controls and defaults into CLI/config surfaces.

---
*Phase: 70-phase-auto-retry-on-verification-failure*
*Completed: 2026-03-16*
