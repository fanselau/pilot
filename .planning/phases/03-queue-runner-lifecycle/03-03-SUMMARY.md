---
phase: 03-queue-runner-lifecycle
plan: 03
subsystem: infra
tags: [queue-runner, state-machine, lifecycle, tree-kill, execa, proper-lockfile, process-management]

# Dependency graph
requires:
  - phase: 03-01
    provides: lock.ts, spawn.ts, phase-state.ts, postmortem.ts
  - phase: 01-02
    provides: queue-parser.ts (parseQueueFile, markEntry)
  - phase: 01-03
    provides: process.ts (writePidFile, removePidFile, isProcessAlive)
provides:
  - Queue runner state machine (createRunner, Runner)
  - Lifecycle mode implementations (runLifecycleMode, runPhaseCycle, findNextPhase)
  - Scan → launch → reap automation loop
  - Phase cycle engine with gap closure
affects: [03-04 queue management commands, tui dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [EventEmitter state machine, synchronous vs detached spawning, polling-based reaping]

key-files:
  created: [src/core/runner.ts, src/core/lifecycle.ts]
  modified: []

key-decisions:
  - "Polling-based reap instead of exit events for detached processes"
  - "markEntryPending helper for retry (queue-parser only has running/done/failed)"
  - "spawnAndWait synchronous spawning for lifecycle inner steps vs detached for runner top-level"
  - "MAX_GAP_CYCLES=3 with best-effort acceptance on exhaustion"

patterns-established:
  - "Runner EventEmitter pattern: scan/launch/reap/complete/error/shutdown events"
  - "Lifecycle dispatch: switch on mode string to typed handler functions"
  - "Phase cycle loop: while(true) with state switch driving transitions"

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 3 Plan 3: Queue Runner + Lifecycle Modes Summary

**Queue runner state machine with scan→launch→reap cycle and 6 lifecycle mode implementations including phase cycle engine with gap closure**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T17:15:33Z
- **Completed:** 2026-02-20T17:19:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Queue runner state machine with full scan→launch→reap loop, same-project sequential enforcement, cross-project parallel execution up to maxParallel
- Success detection using commits OR .planning changes (explicitly NOT ≥8 messages per spec)
- Graceful shutdown: SIGTERM → 15s wait → SIGKILL via tree-kill for entire process trees
- All 6 lifecycle modes: build-full (with .planning/ rejection), continue, continue-all, build-to-phase, add-and-build, run-command
- Phase cycle engine: plan → execute → verify → gap closure (max 3 cycles) with stale UAT renaming
- Per-job timeout support (default 60 min) with process tree kill on expiry
- Post-mortem JSONL logging on every job completion

## Task Commits

Each task was committed atomically:

1. **Task 1: Queue runner state machine** - `a753fed` (feat)
2. **Task 2: Lifecycle mode implementations** - `8458605` (feat)

## Files Created/Modified
- `src/core/runner.ts` - Queue runner state machine (scan→launch→reap loop, graceful shutdown, per-job timeout, EventEmitter events)
- `src/core/lifecycle.ts` - Lifecycle mode dispatch + phase cycle engine with gap closure

## Decisions Made
- Polling-based reap (2s interval) instead of relying on exit events for detached processes — detached processes may not reliably emit events
- Created `markEntryPending` helper in runner.ts since queue-parser's markEntry only supports running/done/failed status transitions
- Lifecycle inner spawning uses synchronous `spawnAndWait` (execa with await, not detached) while runner top-level uses detached `spawnSession` — lifecycle steps must complete before proceeding to next phase state
- Gap closure capped at MAX_GAP_CYCLES=3 with best-effort acceptance when exhausted (logs warning, marks as verified)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added markEntryPending helper for retry flow**
- **Found during:** Task 1 (Queue runner state machine)
- **Issue:** queue-parser's markEntry only accepts 'running' | 'done' | 'failed' but retry needs to set entry back to pending (no prefix)
- **Fix:** Created markEntryPending function that strips status prefix from header line
- **Files modified:** src/core/runner.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** a753fed (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for retry flow to work. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Runner and lifecycle modules ready for queue management commands (03-04-PLAN.md)
- Commands `pilot run`, `pilot stop`, `pilot add`, `pilot build` can now import from runner.ts and lifecycle.ts
- All core infrastructure for Phase 3 is complete

---
*Phase: 03-queue-runner-lifecycle*
*Completed: 2026-02-20*
