---
phase: 54-notify-prompt-design
plan: 01
subsystem: notifications
tags: [prompt-engineering, openclaw, agent-delivery, callback]

# Dependency graph
requires:
  - phase: 51-openclaw-notify
    provides: "OpenClaw agent --deliver trusted notification path"
  - phase: 32-job-completion-callback
    provides: "Job completion callback infrastructure"
provides:
  - "Action-oriented buildDeliveryPrompt that reliably triggers agent replies"
  - "Prompt regression test suite covering success, failure, verdict-absent, and truncation paths"
affects: [openclaw-skill, agent-behavior]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status-specific prompt guidance (success vs failure differentiated)"
    - "Explicit anti-NO_REPLY instruction in agent prompts"

key-files:
  created: []
  modified:
    - "src/core/callback.ts"
    - "test/core/callback.test.ts"

key-decisions:
  - "Opening instruction explicitly says 'Reply in your target chat' instead of passive 'Pilot job update:' header"
  - "Status-specific guidance: success path says 'Acknowledge success', failure path says 'Flag the failure'"
  - "Explicit 'Do NOT choose NO_REPLY' instruction to prevent silent swallowing"

patterns-established:
  - "Notification prompts use action-oriented framing, not passive context delivery"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 54 Plan 01: Notify Prompt Design Summary

**Rewritten buildDeliveryPrompt with explicit reply-inducing instruction, status-specific guidance, and anti-NO_REPLY directive**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T17:00:35Z
- **Completed:** 2026-03-11T17:02:39Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote `buildDeliveryPrompt()` to open with explicit "Reply in your target chat" action instruction instead of passive "Pilot job update:" header
- Added status-specific reply guidance: success path acknowledges completion, failure path flags the failure with concrete follow-up suggestions
- Added explicit "Do NOT choose NO_REPLY" anti-silence instruction
- Expanded test suite from 1 prompt test to 6 prompt tests covering success, failure, verdict-absent, and truncation scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite buildDeliveryPrompt for explicit reply behavior** - `d88ed62` (feat)
2. **Task 2: Update and expand prompt regression tests** - `ba9d315` (test)

## Files Created/Modified
- `src/core/callback.ts` - Rewritten `buildDeliveryPrompt()` with action-oriented prompt structure
- `test/core/callback.test.ts` - 5 new prompt regression tests (12 total tests in file)

## Decisions Made
- Opening instruction uses "A Pilot job just {completed/failed}. Reply in your target chat..." to prime the agent for action rather than passive context absorption
- Metadata section labeled "Job details:" as a clearly delimited data block
- Status-specific guidance kept to one line each (concise) — success: "Acknowledge success", failure: "Flag the failure clearly"
- Anti-NO_REPLY instruction placed as final line for maximum salience

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Prompt redesign complete, ready for live testing with OpenClaw agent delivery
- No blockers — all existing tests pass (899/899)
- Transport/routing/delivery code untouched as required

---
*Phase: 54-notify-prompt-design*
*Completed: 2026-03-11*
