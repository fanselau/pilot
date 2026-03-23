---
phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration
plan: 01
subsystem: runner
tags: [debug, runner, orchestration, gsd-debugger, vitest, tdd]

# Dependency graph
requires:
  - phase: 67-session-blocker-handling
    provides: HungSessionError class used by executeDebugFlow catch handler
  - phase: 68-judge-system-move-into-pilot
    provides: inline prompt pattern (spawnAndWait with 6th param) used for debug sessions
provides:
  - debug-lane.ts module with buildDebugPrompt, parseDebugOutcome, buildContinuationPrompt
  - executeDebugFlow lifecycle in runner.ts for autonomous gsd-debugger orchestration
  - autonomous continuation after human-verify checkpoints
  - explicit blocking on truly interactive checkpoints (human-action/decision)
  - debug job safety guard in handleHungContinuation
affects:
  - runner.ts (all debug job execution paths)
  - any future debug job added via pilot add --scope debug

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Debug jobs bypass step loop entirely via intent.type === 'debug' guard in launch()"
    - "Inline prompt pattern for gsd-debugger (same as judge sessions, 6th spawnAndWait arg)"
    - "Discriminated union DebugOutcome for type-safe outcome handling"
    - "TDD: RED commit (test file) → GREEN commit (implementation) → no refactor needed"

key-files:
  created:
    - src/core/debug-lane.ts
    - test/core/debug-lane.test.ts
  modified:
    - src/core/runner.ts

key-decisions:
  - "debug-lane.ts as separate module (not inlined in runner.ts) for testability and clean separation"
  - "Empty intentToSteps debug case: debug jobs skip the step loop entirely via launch() guard"
  - "Human-verify auto-continuation: runner provides 'confirmed fixed' on debugger's behalf"
  - "Human-action/decision → markReviewHold (not markFailed): job is blocked, not errored"
  - "Unknown outcome → markCompleted: gsd-debugger may complete without structured return"
  - "HungSessionError in executeDebugFlow → markFailed with clear reason, no re-delegation"
  - "Safety guard in handleHungContinuation: debug scope never enters phase re-delegation path"

patterns-established:
  - "Debug lifecycle: executeDebugFlow → extractDebugOutcome → handleDebugOutcome (never touches phase judge)"
  - "Continuation lifecycle: continueDebugAfterVerify provides autonomous 'confirmed fixed' response"

requirements-completed:
  - DBG-01
  - DBG-02
  - DBG-03
  - DBG-04
  - DBG-05
  - DBG-06
  - DBG-07
  - DBG-08
  - DBG-09
  - DBG-10
  - DBG-11
  - DBG-12
  - DBG-13
  - DBG-14

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 91 Plan 01: Debug Lane — Caller-Side Autonomous gsd-debugger Orchestration Summary

**New `src/core/debug-lane.ts` module + runner.ts debug lifecycle rewire: Pilot now spawns `gsd-debugger` directly with prefilled inline prompts, parses all 4 structured outcome types, and auto-continues through human-verify checkpoints — eliminating interactive hangs and phase-judge failures for unattended debug jobs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T16:19:01Z
- **Completed:** 2026-03-23T16:24:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `src/core/debug-lane.ts` with `buildDebugPrompt`, `parseDebugOutcome`, `buildContinuationPrompt`, and `DebugOutcome` discriminated union — fully tested via TDD
- Rewired `intentToSteps` debug case to return `[]` (empty) — debug jobs now skip the step loop entirely
- Added `executeDebugFlow` in runner.ts: spawns gsd-debugger with inline prefilled prompt (6-arg spawnAndWait pattern, same as judge)
- All 4 gsd-debugger outcome types handled: `debug_complete` → completed, `root_cause_found` → completed_pending_review, `investigation_inconclusive` → failed with diagnostic, `checkpoint` → auto-continue (human-verify) or markReviewHold (human-action/decision)
- Safety guard in `handleHungContinuation`: debug scope jobs never enter phase re-delegation path
- 22 new debug-lane tests pass; all 1299 existing tests pass; TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): debug-lane tests** - `c8c3de6` (test)
2. **Task 1 (GREEN): debug-lane implementation** - `c560e16` (feat)
3. **Task 2: runner.ts debug lane rewire** - `8ddf78c` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified
- `src/core/debug-lane.ts` — New module: prompt builders and outcome parser for autonomous gsd-debugger orchestration
- `test/core/debug-lane.test.ts` — 22 TDD tests covering all public API functions and edge cases
- `src/core/runner.ts` — Debug lane rewire: import, intentToSteps change, debug flow bypass, 5 new private methods, safety guard

## Decisions Made
- **debug-lane.ts as separate module:** Clean separation from runner.ts enables unit testing without mocking the entire runner infrastructure
- **Empty intentToSteps debug case:** Makes the bypass point explicit — `launch()` checks `intent.type === 'debug'` before creating any steps, so the empty return is never used
- **Human-verify auto-continuation:** When debugger self-verifies and returns CHECKPOINT REACHED / human-verify, runner spawns a fresh continuation session providing "confirmed fixed" — fully autonomous
- **Human-action/decision → markReviewHold:** These are genuinely interactive checkpoints that cannot be automated; marking review_hold (not failed) is semantically correct
- **Unknown outcome → markCompleted:** gsd-debugger may complete valid work without structured return (e.g., in early investigation phases); treating as success prevents false failures

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled clean on first attempt, all tests passed immediately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01 complete — all debug lane requirements implemented
- Plan 02 (if it exists) can build on the debug-lane module
- Phase complete when all plans have SUMMARYs

## Self-Check: PASSED

- ✅ FOUND: src/core/debug-lane.ts
- ✅ FOUND: test/core/debug-lane.test.ts
- ✅ FOUND: .planning/phases/91-.../91-01-SUMMARY.md
- ✅ Commit c8c3de6 (test RED) exists
- ✅ Commit c560e16 (feat GREEN) exists
- ✅ Commit 8ddf78c (feat runner rewire) exists

---
*Phase: 91-pilot-debug-lane-caller-side-autonomous-gsd-debugger-orchestration*
*Completed: 2026-03-23*
