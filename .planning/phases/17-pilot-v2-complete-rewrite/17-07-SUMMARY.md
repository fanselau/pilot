---
phase: 17-pilot-v2-complete-rewrite
plan: 07
subsystem: cli
tags: [commander, cancel, retry, bump, doctor, service, gc, systemd, entry-point]

# Dependency graph
requires:
  - phase: 17-02
    provides: SQLite queue DB (cancel/retry/bump/gc use db.ts)
  - phase: 17-05
    provides: Queue runner (run command wired in entry point)
  - phase: 17-06
    provides: Core CLI commands (status, queue, log, add, config)
provides:
  - cancel, retry, bump queue management commands
  - doctor health check command
  - service systemd daemon management
  - gc garbage collection placeholder
  - Complete v2 CLI entry point with all commands wired
affects: [17-08, 18-pilot-v2-tui-with-opentui]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-imports-for-fast-startup, systemd-user-unit-generation]

key-files:
  created:
    - src/commands/cancel.ts
    - src/commands/retry.ts
    - src/commands/bump.ts
    - src/commands/doctor.ts
    - src/commands/service.ts
    - src/commands/gc.ts
    - src/commands/setup.ts
    - src/commands/update.ts
  modified:
    - src/index.ts

key-decisions:
  - "service install generates systemd user unit with process.argv[1] for ExecStart"
  - "gc is placeholder reporting old jobs, full cleanup deferred"
  - "All commands use dynamic imports for <100ms CLI startup"

patterns-established:
  - "Command pattern: validate → mutate → output (json or human)"
  - "Systemd integration via user-level units for daemon management"

# Metrics
duration: 1min
completed: 2026-03-02
---

# Phase 17 Plan 7: Remaining Commands + Complete CLI Entry Point Summary

**Queue management commands (cancel/retry/bump), infrastructure commands (doctor/service/gc), and complete v2 entry point with all 14 commands wired via dynamic imports**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-02T10:15:04Z
- **Completed:** 2026-03-02T10:16:07Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Implemented cancel, retry, bump commands with status validation and JSON output
- Added doctor health check (opencode binary, pilot-gsd, pilot dir, memory)
- Added service command for systemd daemon management (install/start/stop/status)
- Added gc placeholder for future cleanup of old completed/failed jobs
- Rewired complete entry point replacing all stubs with dynamic imports to real modules
- Added setup and update commands for project configuration

## Task Commits

Each task was committed atomically:

1. **Task 1: Queue management + infrastructure commands** - `eabeab9` (feat)
2. **Task 2: Wire complete v2 entry point** - `28fd1bc` (feat)

## Files Created/Modified
- `src/commands/cancel.ts` - Cancel pending jobs with status validation
- `src/commands/retry.ts` - Retry failed/cancelled jobs, reset to pending
- `src/commands/bump.ts` - Move pending jobs to front via max(priority)+1
- `src/commands/doctor.ts` - Health checks: opencode binary, gsd dir, pilot dir, memory
- `src/commands/service.ts` - Systemd daemon management (install/start/stop/status)
- `src/commands/gc.ts` - Report old completed/failed jobs, placeholder for cleanup
- `src/commands/setup.ts` - Project setup with symlinks and --verify flag
- `src/commands/update.ts` - Git pull for pilot-gsd definitions
- `src/index.ts` - Complete v2 entry point with all 14 commands wired

## Decisions Made
- Service install generates systemd user unit file with `process.argv[1]` for ExecStart path
- GC is a placeholder reporting old jobs — full cleanup deferred to future iteration
- All commands use dynamic imports for fast CLI startup (<100ms)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v2 commands are wired and working
- Ready for 17-08-PLAN.md (test suite for all v2 commands)
- `pilot --help` shows full v2 command list
- Build succeeds, all commands invoke without crashes

---
*Phase: 17-pilot-v2-complete-rewrite*
*Completed: 2026-03-02*
