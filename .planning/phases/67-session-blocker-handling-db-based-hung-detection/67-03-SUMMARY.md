---
phase: 67-session-blocker-handling
plan: 03
subsystem: runner
tags: [runner, spawnAndWait, getSessionState, HungSessionError, state-machine, poll-loop]

# Dependency graph
requires:
  - phase: 67-01
    provides: getSessionState() with 5-state detection in opencode-db.ts
  - phase: 67-02
    provides: HungSessionError class in errors.ts + killHungSession helper in runner.ts
provides:
  - spawnAndWait poll loop rewritten with state-based routing (getSessionState switch)
  - hung-on-prompt detection with immediate kill + HungSessionError throw
  - hung-on-tool tolerance (continue polling — long-running tools allowed)
  - crashed state throws without waiting
  - WAL flush race handling (2s wait on PID death before declaring crash)
  - Per-poll structured logging via this.log() and PILOT_DEBUG mode
  - 8 new tests for state-based poll loop behavior
affects: [phase-68, session-blocker-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State-machine poll loop: switch on getSessionState() result in spawnAndWait"
    - "WAL flush race: brief 2s wait on PID death before declaring crashed"

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - test/core/runner.test.ts

key-decisions:
  - "Removed isSessionDone import from runner.ts — no longer called in poll loop"
  - "WAL flush race: recheck getSessionState(sessionId, false) before declaring crashed"
  - "Per-poll this.log() for every cycle to support daemon observability"
  - "PILOT_DEBUG mode retains full elapsed/state/tool/pid details"

patterns-established:
  - "State-based routing: switch on SessionStateResult.state for all poll decisions"
  - "pidAlive computed via process.kill(pid, 0) before each state check"

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 67 Plan 03: spawnAndWait State-Based Poll Loop Summary

**spawnAndWait poll loop rewritten with getSessionState() state machine: hung-on-prompt kills immediately, hung-on-tool continues polling, crashed/done route correctly, WAL flush race handled**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T23:55:36Z
- **Completed:** 2026-03-16T00:00:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced `isSessionDone()` poll loop with full 5-state `getSessionState()` switch in `spawnAndWait()`
- `hung-on-prompt` → immediate `killHungSession()` + `throw new HungSessionError(interactive-prompt)`
- `hung-on-tool` → continue polling (wall timeout serves as safety net for runaway bash)
- `crashed` → throw "Process died without clean completion" error
- `working` → continue polling
- `done` → return (success)
- WAL flush race: on PID death, do immediate recheck + optional 2s wait before declaring crash; fallback to `getAssistantMessageCount > 0` to treat as complete
- Removed unused `isSessionDone` import from runner.ts
- Added per-poll `this.log()` for daemon-level observability
- Updated `opencode-db.js` mock in existing dispatch wiring test to include `getSessionState`
- Added 8 new state-based poll loop tests (35 total in runner.test.ts, was 27)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite spawnAndWait poll loop with getSessionState routing** — `0154a76` (feat)
2. **Task 2: Update runner tests for state-based poll loop** — `23e3058` (feat)

## Files Created/Modified

- `src/core/runner.ts` — Poll loop replaced with state-based switch; `getSessionState` + `HungSessionError` imported; `isSessionDone` import removed
- `test/core/runner.test.ts` — 8 new tests for state-based poll, mock updated to include `getSessionState`

## Decisions Made

- **Removed `isSessionDone` import** — previously kept for debug logging, but the new PILOT_DEBUG log now shows `state=` from `getSessionState()` directly, making `isSessionDone` call redundant
- **WAL flush race handling preserved** — the original 2s+3s WAL wait from the old code is simplified: one immediate recheck + one 2s wait, both using `getSessionState(sessionId, false)` instead of `isSessionDone()`
- **`this.log()` on every poll cycle** — adds daemon log noise but needed for stuck-session diagnosis; PILOT_DEBUG mode provides the richer elapsed/tool/pid format

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Plan 67-04 (job-level error handling for HungSessionError) can proceed
- spawnAndWait is now fully state-machine driven — the integration point between Plans 01+02+03 is complete
- 4 pre-existing failing tests (doctor, update, web/actions, runner-recovery) were present before and after this plan — no regressions introduced

---
*Phase: 67-session-blocker-handling*
*Completed: 2026-03-16*
