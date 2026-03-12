---
phase: 58-pilot-failure-notifications-should-guide-agents-to-unblock-and-read-logs
plan: 01
subsystem: notifications
tags: [prompt, callback, failure-recovery, blocked, notifications]

requires:
  - phase: 54
    provides: delivery prompt foundation (buildDeliveryPrompt)
provides:
  - Failure notification prompts with blocked-awareness, log guidance, and recovery steps
affects: []

tech-stack:
  added: []
  patterns: [directive-prompt-design]

key-files:
  created: []
  modified:
    - src/core/callback.ts
    - test/core/callback.test.ts

key-decisions:
  - "Prompt text changes only — no structural/API/signature changes"

duration: 2min
completed: 2026-03-12
---

# Phase 58 Plan 01: Failure Notification Prompt Improvement Summary

**Failure prompts now explicitly state the project is blocked, direct agents to `pilot log <id>` for transcript inspection, and guide toward `pilot retry <id>` for recovery.**

## Performance
- **Duration:** 2min
- **Started:** 2026-03-12T00:02:34Z
- **Completed:** 2026-03-12T00:04:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Updated `nextStepGuidance()` failure branch to state project is blocked and provide `pilot log`/`pilot retry` commands
- Updated `buildDeliveryPrompt()` failure guidance block to mention blocked state and direct agents to inspect and retry
- Added 3 new focused tests covering blocked-awareness, log guidance, and retry/unblock recovery
- Updated existing failure prompt tests with new assertion coverage
- All 928 tests passing with zero regressions

## Task Commits
1. **Task 1: Update failure notification prompt** - `2e88839` (feat)
2. **Task 2: Update and add tests for new failure prompt content** - `524b513` (test)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/core/callback.ts` - Updated `nextStepGuidance()` and `buildDeliveryPrompt()` failure branches with blocked/log/retry prompt text
- `test/core/callback.test.ts` - 3 new tests + updated existing assertions for blocked/log/retry content

## Decisions Made
- Prompt text changes only — no structural, API, or function signature changes required

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 58 complete (1/1 plan). Failure notifications now teach agents recovery behavior by default.

---
*Phase: 58-pilot-failure-notifications-should-guide-agents-to-unblock-and-read-logs*
*Completed: 2026-03-12*
