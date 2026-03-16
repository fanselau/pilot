---
phase: 67-session-blocker-handling
plan: 04
subsystem: runner
tags: [sqlite, retry, hung-session, error-handling, notifications]

# Dependency graph
requires:
  - phase: 67-01
    provides: getSessionState() with 5-state detection
  - phase: 67-02
    provides: HungSessionError class + killHungSession helper
  - phase: 67-03
    provides: spawnAndWait state-based poll loop throwing HungSessionError
provides:
  - retry_budget, retry_count, hung_count, last_hung_reason fields on Job
  - incrementHungCount, incrementRetryCount, canRetry, isSameHungReason, resetRetryState in db.ts
  - Hung retry logic in runner launch() catch block with escalation and budget enforcement
  - Enriched notification prompt for hung failures in callback.ts
affects: [68-cleanup, future-phases-that-use-runner]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Same-error escalation: two consecutive same-reason hangs skip budget check → immediate fail"
    - "Silent retry: resetToPending without notification when budget remains"
    - "Budget-gated notification: notifyJobCompletion only on budget exhaustion or escalation"
    - "gaps-if-progress hint: interactive-prompt hang sets resume_hint for next attempt"

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/db.ts
    - src/core/runner.ts
    - src/core/callback.ts
    - test/core/runner.test.ts
    - test/core/db.test.ts
    - test/core/runner-recovery.test.ts

key-decisions:
  - "Same-error escalation requires isSameHungReason=true AND hungCount>=1 (not >=0) to avoid false positives on first hang"
  - "Escalation does NOT consume retry budget (no incrementRetryCount) — direct fail path"
  - "resetToPending used for hung retry, NOT markFailed — preserves normal retry flow"
  - "retry() (pilot retry CLI) calls resetRetryState to give fresh budget on manual operator retry"
  - "gaps-if-progress hint only on interactive-prompt (not stuck-tool) — phase jobs need gaps awareness"

patterns-established:
  - "HungSessionError handled before generic catch-all in launch() — order matters"
  - "DB helpers used by runner to track retry state: incrementHungCount/incrementRetryCount/canRetry/isSameHungReason"
  - "Notification enriched with hung-specific context: hung_reason, hung_count, interactive prompt guidance"

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 67 Plan 04: Retry Budget and Hung Session Pipeline Summary

**Retry budget (default 3) on Job model with silent retries, same-error escalation, and budget-gated notifications completing the hung detection pipeline**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T00:03:09Z
- **Completed:** 2026-03-16T00:11:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Job model gains `retryBudget`, `retryCount`, `hungCount`, `lastHungReason` — persisted via 4 new DB migration columns
- 5 new DB helpers exported: `incrementHungCount`, `incrementRetryCount`, `canRetry`, `isSameHungReason`, `resetRetryState`
- Runner `launch()` catch block now handles `HungSessionError` before generic catch-all: silent retry OR escalation OR budget exhaustion
- `buildDeliveryPrompt()` in callback.ts enriched with hung-specific guidance when job fails due to hung sessions
- `pilot retry` CLI now resets retry state so operators get a fresh budget on manual retry

## Task Commits

Each task was committed atomically:

1. **Task 1: Add retry fields to Job type, DB schema, and helpers** - `087bd2d` (feat)
2. **Task 2: Integrate hung retry logic in runner and enrich notifications** - `e02c985` (feat)

## Files Created/Modified

- `src/core/types.ts` — Added `retryBudget`, `retryCount`, `hungCount`, `lastHungReason` to Job interface
- `src/core/db.ts` — 4 migration columns + 5 new helpers + updated `rowToJob()` + `retry()` calls `resetRetryState`
- `src/core/runner.ts` — HungSessionError catch block with escalation/budget logic; imports 4 new db helpers
- `src/core/callback.ts` — `buildDeliveryPrompt()` enriched with hung-specific context for budget-exhaustion failures
- `test/core/db.test.ts` — 6 new tests (109 total): retry budget fields, incrementHungCount, incrementRetryCount, canRetry, isSameHungReason, resetRetryState
- `test/core/runner.test.ts` — 5 new unit tests for hung retry logic (40 total): retry path, budget exhaustion, escalation, different reason, silent retry
- `test/core/runner-recovery.test.ts` — [Deviation fix] Added missing `getSessionState` to opencode-db mock; added `retryBudget/retryCount/hungCount/lastHungReason` to `makeJob()`

## Decisions Made

- `isSameHungReason` requires `hungCount >= 1` (not `>= 0`) before escalating — first hang is never an escalation even if reason is repeated, since there's no prior hang to compare against
- Escalation path does NOT call `incrementRetryCount` — it's an immediate escalation, not a budget-consuming retry
- `resetToPending` used for hung retry path (not `markFailed`) so the job re-enters queue naturally
- `pilot retry` (via `retry()`) calls `resetRetryState` giving the operator a fresh budget on manual intervention
- `gaps-if-progress` resume hint only set on `interactive-prompt` hangs — phase jobs that hung on prompts benefit from gap-closure retries; `stuck-tool` hangs don't need this

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing test failure in runner-recovery.test.ts**

- **Found during:** Task 2 (full suite verification)
- **Issue:** `runner-recovery.test.ts` opencode-db mock was missing `getSessionState` export (added in plan 67-03); `makeJob()` was missing `retryBudget/retryCount/hungCount/lastHungReason` fields added in Task 1
- **Fix:** Added `getSessionState: vi.fn(() => ({ state: 'done' }))` to mock; added 4 new retry fields to `makeJob()`
- **Files modified:** `test/core/runner-recovery.test.ts`
- **Verification:** All 7 runner-recovery tests pass after fix
- **Committed in:** `e02c985` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix in existing test file. No scope creep — the fix was required for test suite health.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 67 complete: 4/4 plans done
- Full hung session pipeline: DB state detection (67-01) → error type (67-02) → state-based poll loop (67-03) → retry budget and pipeline (67-04)
- Hung sessions are now handled autonomously: up to 3 retries per job, same-error escalation, budget-gated notifications
- No blockers for next phase

---
*Phase: 67-session-blocker-handling*
*Completed: 2026-03-16*
