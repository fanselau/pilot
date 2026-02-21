---
phase: 13-daemon-mode-runner
plan: 03
subsystem: cli
tags: [daemon, systemd, build, add, run, stop, tty-detection]

# Dependency graph
requires:
  - phase: 13-02
    provides: Refactored runner with daemon watch loop, signal handling, PID key change
provides:
  - Daemon-aware CLI commands (run/stop/add/build)
  - Synchronous blocking build command
  - systemd service file generator
  - Fire-and-forget add with runner status hint
affects: [13-04-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [TTY detection for daemon output routing, silent mode for command composition, in-process runner for blocking build]

key-files:
  created: [src/commands/init-service.ts]
  modified: [src/commands/run.ts, src/commands/stop.ts, src/commands/add.ts, src/commands/build.ts, src/index.ts]

key-decisions:
  - "TTY detection via process.stdout.isTTY gates all human output in run.ts"
  - "stop --force sends immediate SIGKILL (no SIGTERM first) for clean daemon management"
  - "build runs runner in-process with --once mode rather than spawning detached process"
  - "add is pure fire-and-forget — shows runner hint but never starts runner"
  - "silent mode on addCommand enables build to suppress double output"

patterns-established:
  - "Silent mode pattern: opts['silent'] === true suppresses outputHuman for composition"
  - "In-process runner: createRunner + runner.start() blocks in calling process"

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 13 Plan 03: Command Layer for Daemon Mode Summary

**Daemon-aware CLI commands: TTY-gated run output, 15s stop timeout with force-kill, fire-and-forget add with runner hints, synchronous blocking build via in-process runner, and systemd service generator**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T12:41:11Z
- **Completed:** 2026-02-21T12:46:51Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `pilot run` suppresses stdout when not TTY (daemon-friendly), announces mode on startup, exit message only for --once
- `pilot stop` uses 15s timeout (was 30s), `--force` sends immediate SIGKILL without SIGTERM first
- `pilot add` is fire-and-forget: checks runner status and shows hint, supports silent mode and --timeout
- `pilot build` runs runner in-process with --once, blocks until specific item completes, reports success/failure
- `pilot init-service` generates systemd user service file with correct PATH and environment

## Task Commits

Each task was committed atomically:

1. **Task 1: Update run.ts, stop.ts, add.ts for daemon mode** - `0bda68c` (feat)
2. **Task 2: Rewrite build.ts + create init-service.ts + update index.ts** - `6480625` (feat)

## Files Created/Modified
- `src/commands/run.ts` - TTY detection, mode announcement, conditional exit message
- `src/commands/stop.ts` - 15s timeout, immediate SIGKILL on --force
- `src/commands/add.ts` - Silent mode, runner status hint, --timeout support
- `src/commands/build.ts` - Synchronous in-process runner, blocks until completion
- `src/commands/init-service.ts` - systemd user service file generator (89 lines)
- `src/index.ts` - init-service registration, --timeout option on add, runner_active in JSON

## Decisions Made
- TTY detection (`process.stdout.isTTY`) gates all human output — daemon mode logs to file only
- `--force` on stop sends immediate SIGKILL — no SIGTERM first for clean daemon management
- build runs runner in-process (`createRunner` + `runner.start()`) rather than spawning detached child
- add is fire-and-forget — shows hint but never starts runner (decoupled from runner lifecycle)
- silent mode via `opts['silent']` enables clean composition between build and add

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All command-layer daemon mode changes complete
- Ready for 13-04 (tests)
- Zero type errors confirmed

---
*Phase: 13-daemon-mode-runner*
*Completed: 2026-02-21*
