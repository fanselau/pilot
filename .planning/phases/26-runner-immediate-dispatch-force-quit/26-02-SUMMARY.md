---
phase: 26-runner-immediate-dispatch-force-quit
plan: 02
subsystem: runner
tags: [runner, dispatch, multi-slot, fs-watch, sqlite, process-kill, reconciler]

# Dependency graph
requires:
  - phase: 26-01
    provides: claimNextLaunchable, forceQuitJob, getAllRunningJobs in db.ts
provides:
  - Immediate multi-slot dispatch drain loop in Runner.run()
  - reconcileStaleRunning() called on startup and each poll cycle
  - reconcileStaleJobs() called at startup and every N poll cycles
  - In-memory same-project serialization belt-and-suspenders guard
  - Event-driven DB file watcher wake-up via fs.watch on pilot.db
  - killJobSession() exported function (SIGTERM → SIGKILL via pgrep)
affects: [26-03, force-quit, runner-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inner drain loop: while activeJobs < maxParallel, call claimNextLaunchable() to fill all slots before sleeping"
    - "Event-driven wake: fs.watch on pilot.db + wakeOrTimeout() replaces fixed-interval sleep"
    - "Dual reconciliation: pgrep-based (reconcileStaleRunning) + DB-based (reconcileStaleJobs)"

key-files:
  created: []
  modified:
    - src/core/runner.ts

key-decisions:
  - "reconcileStaleJobs also called periodically (every RECONCILE_EVERY_N_CYCLES=10) not just on startup — belt-and-suspenders for long-running daemon"
  - "In-memory same-project guard added alongside claimNextLaunchable's DB-level guard — prevents edge cases from claiming already-active projects"
  - "markRunning() is imported but never called inside launch() — explicitly documented with comment explaining why"

patterns-established:
  - "Task 1 features (dispatch drain, reconciler) committed atomically as one logical unit — both were in same diff from prior work session"

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 26 Plan 02: Runner Immediate Dispatch + Event-Driven Wake Summary

**Immediate multi-slot dispatch drain loop + reconcileStaleRunning + fs.watch wake-up + killJobSession export in runner.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-03T18:29:00Z
- **Completed:** 2026-03-03T18:37:25Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Runner dispatch loop now drains ALL available slots per iteration (inner `while activeJobs < maxParallel` loop) instead of one slot per poll cycle
- `reconcileStaleRunning()` (pgrep-based) called on startup and each poll cycle to kill orphaned running jobs whose process is gone
- `reconcileStaleJobs()` (DB-based, from 26-01) called at startup + every 10 cycles to reset ghost-running jobs to pending for retry
- Event-driven wake-up: `fs.watch` on `pilot.db` fires `triggerWake()` → resolves `wakeOrTimeout()` early instead of sleeping full poll interval
- `killJobSession(job)` exported: parses `sessionTitles` JSON, uses `pgrep -f` to find PID, SIGTERM → 5s wait → SIGKILL
- `markRunning()` is NOT called inside `launch()` — `claimNextLaunchable()` already sets `status=running` atomically

## Task Commits

Each task was committed atomically:

1. **Task 1: Immediate multi-slot dispatch loop + stale-running reconciler** - `6f33464` (feat)
2. **Task 2: Event-driven wake-up + killJobSession** - already committed in prior session (part of 26-01 work wave)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/core/runner.ts` — dispatch drain loop, reconcileStaleRunning, reconcileStaleJobs, wakeOrTimeout/dbWatcher/triggerWake, killJobSession export

## Decisions Made

- Added periodic `reconcileStaleJobs()` every `RECONCILE_EVERY_N_CYCLES=10` (in addition to startup call) — provides ongoing DB-level cleanup for long-running daemons where process-check reconciliation may miss DB-only ghost state
- In-memory same-project serialization guard (`projectAlreadyActive` check) added as belt-and-suspenders alongside `claimNextLaunchable`'s SQL-level guard — prevents a claimed job from being double-launched in race conditions between DB and in-memory state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added in-memory same-project serialization guard**
- **Found during:** Task 1 (dispatch drain loop implementation)
- **Issue:** `claimNextLaunchable()` enforces project serialization at the DB level, but the in-memory `activeJobs` map could be slightly out of sync between DB commit and `activeJobs.set()` call
- **Fix:** Added `projectAlreadyActive` check that scans `activeJobs` values before adding a job — breaks out of drain loop if same-project job is already running in memory
- **Files modified:** src/core/runner.ts
- **Verification:** Lint + all 202 tests pass
- **Committed in:** 6f33464

**2. [Rule 2 - Missing Critical] Added periodic reconcileStaleJobs call every N cycles**
- **Found during:** Task 1 (startup reconciliation)
- **Issue:** Plan called for startup + per-cycle reconcileStaleRunning, but DB-level `reconcileStaleJobs` was only wired at startup — a long-running daemon could accumulate ghost jobs between restarts
- **Fix:** Added `pollCycle` counter and `RECONCILE_EVERY_N_CYCLES=10` static — calls `reconcileStaleJobs` periodically through the daemon lifetime
- **Files modified:** src/core/runner.ts
- **Verification:** Lint + all 202 tests pass
- **Committed in:** 6f33464

---

**Total deviations:** 2 auto-fixed (both Rule 2 - Missing Critical)
**Impact on plan:** Both additions strengthen reliability without changing the interface contract. No scope creep.

## Issues Encountered

None — Task 2 features (wakeOrTimeout, dbWatcher, killJobSession) were already committed in the prior work session. Task 1 additions (drain loop refinements, dual reconciler) committed cleanly as 6f33464.

## Next Phase Readiness

- Runner dispatch and force-quit infrastructure complete
- Plan 26-03 (if any) or consuming commands can import `killJobSession` from `runner.ts`
- All 202 tests pass, lint clean

---
*Phase: 26-runner-immediate-dispatch-force-quit*
*Completed: 2026-03-03*
