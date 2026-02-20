---
phase: 03-queue-runner-lifecycle
plan: 04
subsystem: cli
tags: [commander, queue-runner, tree-kill, proper-lockfile, execa]

# Dependency graph
requires:
  - phase: 03-01
    provides: lock.ts, spawn.ts, types.ts (RunnerOptions, SpawnOptions)
  - phase: 03-02
    provides: lifecycle command wrappers, scope.ts with deferred --build
  - phase: 03-03
    provides: runner.ts (createRunner), lifecycle.ts
provides:
  - "pilot run CLI command wiring queue runner to commander"
  - "pilot stop CLI command with SIGTERM→SIGKILL graceful shutdown"
  - "pilot add CLI command with mode validation and queue locking"
  - "pilot build CLI command with mode detection and runner auto-start"
  - "scope --build flag wired to queue runner"
affects: [phase-4-tui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detached process spawn for runner from build command"
    - "Mode validation with const array + includes check"

key-files:
  created: []
  modified:
    - src/commands/run.ts
    - src/commands/stop.ts
    - src/commands/add.ts
    - src/commands/build.ts
    - src/commands/scope.ts

key-decisions:
  - "Detached execa spawn for runner from build (survives parent exit)"
  - "scope --build wired as add-and-build mode (was deferred from 03-02)"

patterns-established:
  - "Queue command pattern: validate → lock → mutate → output"
  - "Runner event listener pattern for human-readable output"

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 3 Plan 4: Queue Management Commands Summary

**CLI commands run/stop/add/build wired to queue runner state machine with mode validation, file locking, and --json support**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T17:23:35Z
- **Completed:** 2026-02-20T17:26:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- All 4 queue management commands (run, stop, add, build) fully implemented replacing stubs
- add validates modes against const array, locks QUEUE.md via proper-lockfile before append
- stop gracefully shuts down runner: SIGTERM → 30s wait → SIGKILL with --force via tree-kill
- run creates Runner with parsed options, listens for events, formats human-readable output
- build auto-detects mode from .planning/ existence, spawns detached runner process
- scope --build flag now wired to queue runner (was deferred from Plan 02)

## Task Commits

Each task was committed atomically:

1. **Task 1: add + stop commands** - `dc022a3` (feat)
2. **Task 2: run + build commands + scope --build** - `06418b9` (feat)

## Files Created/Modified
- `src/commands/add.ts` - Queue entry append with mode validation and QUEUE.md locking
- `src/commands/stop.ts` - Runner shutdown with SIGTERM/SIGKILL and PID cleanup
- `src/commands/run.ts` - Runner start with event listeners and human/json output
- `src/commands/build.ts` - Mode detection, queue append, detached runner spawn
- `src/commands/scope.ts` - Wired --build flag to add-and-build + runner start

## Decisions Made
- Detached execa spawn for runner from build: `execa('node', [pilotBin, 'run'], { detached: true, stdin/stdout/stderr: 'ignore' }).unref()` — runner survives parent exit
- scope --build uses add-and-build mode matching spec §9 add-and-build lifecycle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired scope --build flag (deferred from 03-02)**
- **Found during:** Task 2 (build command implementation)
- **Issue:** scope --build was deferred to Plan 04 per 03-02 decisions ("Queue runner not yet implemented"). Now that runner exists, this should be wired.
- **Fix:** Updated scope.ts to add entry to QUEUE.md and start runner when --build is passed
- **Files modified:** src/commands/scope.ts
- **Verification:** tsc --noEmit passes, scope --build adds to queue and starts runner
- **Committed in:** 06418b9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to deliver the deferred feature now that the dependency exists. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 complete — all 4 plans executed
- All queue runner infrastructure, lifecycle modes, and CLI commands implemented
- Ready for Phase 4: TUI Dashboard
- Only tui.ts stub remains in src/commands/ (Phase 4)

---
*Phase: 03-queue-runner-lifecycle*
*Completed: 2026-02-20*
