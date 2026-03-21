---
phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure
plan: 02
subsystem: runner
tags: [runner, review-states, cli, callback, notifications, tdd]

# Dependency graph
requires:
  - phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure
    provides: completed_pending_review/review_hold DB functions from plan 01

provides:
  - isHumanOnlyRemaining() helper detects human-only judge verdict gaps
  - Runner executeJudgeStep transitions to completed_pending_review when appropriate
  - Runner launch() notifies on review state completion
  - pilot review CLI command with --approve and --reject flows
  - Callback notifications use review-appropriate language (not "failed/blocked")

affects:
  - tui (review states visible via getQueue/getRecent)
  - web UI (review state job display)
  - operator workflows (pilot review command is new tooling)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isHumanOnlyRemaining: heuristic keyword detection (human/manual/visual vs bug/error/crash)"
    - "TDD RED-GREEN-REFACTOR with separate commits per phase"
    - "Review state commands: --approve transitions state, --reject accepts-as-is or cancels"

key-files:
  created:
    - src/commands/review.ts
  modified:
    - src/core/runner.ts
    - src/core/callback.ts
    - src/index.ts
    - test/core/runner.test.ts
    - test/core/callback.test.ts

key-decisions:
  - "isHumanOnlyRemaining exported as module-level function (not private class method) — enables direct unit testing following runner.ts pattern"
  - "pilot review --reject on completed_pending_review transitions to completed (not failed) — per requirement no auto-queue"
  - "pilot review --reject on review_hold cancels — operator chose to abandon mid-phase hold"
  - "review states detected in launch() notification branch — only triggers if not already 'running'"

patterns-established:
  - "Pattern: Review state detection in executeJudgeStep — check isHumanOnlyRemaining before gap continuation"
  - "Pattern: Callback statusWord pattern for extensible job status display language"

requirements-completed: [REVIEW-07, REVIEW-08, REVIEW-09, REVIEW-10, REVIEW-11, REVIEW-12]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 81 Plan 02: Runner Integration + Review CLI Summary

**Runner detects human-only judge gaps → completed_pending_review; `pilot review` approve/reject CLI; callbacks say "review pending" not "failed/blocked"**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T10:58:11Z
- **Completed:** 2026-03-21T11:05:11Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments

- Added `isHumanOnlyRemaining(verdict)` — heuristic keyword detection: gaps/reason with human/manual/visual/UX keywords but no bug/error/crash/compile keywords → true
- Modified `executeJudgeStep` in runner: `gaps_found/doubting/partial` branch now checks `isHumanOnlyRemaining` first; if all human-only, calls `markCompletedPendingReview` instead of delegating for gap closure
- Updated `launch()` completion logic to notify when job ends in `completed_pending_review` or `review_hold` state
- Created `src/commands/review.ts`: `pilot review <id> --approve` (transitions to completed or running), `--reject <reason>` (accepts-as-is or cancels), no-flag shows review info
- Registered `review` command in `src/index.ts`
- Updated `callback.ts`: `nextStepGuidance()` returns `pilot review` commands for review states; `buildDeliveryPrompt()` uses "pending human review"/"paused for human review" language; closing guidance says "NOT a failure — NOT blocked"

## Task Commits

Each task was committed atomically following TDD RED-GREEN-REFACTOR:

1. **Task 1: Update runner verdict handling + mid-phase review detection**
   - `b3bc9fd` (test): RED — failing tests for isHumanOnlyRemaining (import fails)
   - `458f6ef` (feat): GREEN — isHumanOnlyRemaining + executeJudgeStep + launch() updates

2. **Task 2: Review CLI command + callback notification update**
   - `d7d6a32` (test): RED — failing tests for review state callback notifications
   - `c362c49` (feat): GREEN — review.ts + index.ts registration + callback.ts updates

## Files Created/Modified

- `src/core/runner.ts` — Added `isHumanOnlyRemaining` (exported module-level), new DB imports, executeJudgeStep review branch, launch() review state notification
- `src/commands/review.ts` — New: `pilot review <id> --approve/--reject` command
- `src/index.ts` — Registered `review` command with `--approve` and `--reject <reason>` options
- `src/core/callback.ts` — `nextStepGuidance()` review branches, `buildDeliveryPrompt()` review status words and closing guidance
- `test/core/runner.test.ts` — 8 new tests for `isHumanOnlyRemaining` in `review state detection` describe
- `test/core/callback.test.ts` — 7 new tests for review state notification language

## Decisions Made

- **isHumanOnlyRemaining as exported helper**: Following the existing runner.ts pattern of exporting pure helpers (parseJudgeVerdict, getDynamicMaxParallel, hasSystemdRunUser), `isHumanOnlyRemaining` is a module-level function exported at the bottom. This enables direct unit testing without complex mocking.
- **`--reject` on `completed_pending_review` → completed**: Per the requirement "never auto-queue new jobs for review handling", reject still transitions to completed (accepted with note). Operator must manually queue follow-up work.
- **`--reject` on `review_hold` → cancelled**: A mid-phase hold that the operator explicitly rejects should be cancelled, not left running.
- **`markReviewHold` not yet wired in runner**: The plan only specified wiring for `isHumanOnlyRemaining` → `markCompletedPendingReview` in the judge step. `markReviewHold` is imported but not yet called from runner (reserved for future mid-phase checkpoint detection).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runner + CLI + callbacks fully wired for review states
- `pilot review --approve/--reject` handles both `completed_pending_review` and `review_hold` jobs
- Ready for Phase 81-03: TUI/web UI display for review states (if planned)
- `markReviewHold` is available in runner.ts imports — mid-phase checkpoint pausing can be wired when needed

## Self-Check

- ✅ src/core/runner.ts — exists, contains `isHumanOnlyRemaining`, `markCompletedPendingReview(job.id`, `completed_pending_review` in launch check
- ✅ src/commands/review.ts — exists, exports `reviewCommand`
- ✅ src/index.ts — contains `.command('review`
- ✅ src/core/callback.ts — contains `completed_pending_review`, `pending human review`
- ✅ test/core/runner.test.ts — contains `review state`
- ✅ test/core/callback.test.ts — contains `completed_pending_review`
- ✅ All 79 tests pass (55 runner + 24 callback)
- ✅ `npx tsc --noEmit` exits 0
- ✅ `pilot review --help` shows `--approve` and `--reject` options

---
*Phase: 81-pilot-human-review-semantics-autonomy-first-no-false-failure*
*Completed: 2026-03-21*
