---
phase: 02-cli-commands
plan: 01
subsystem: cli
tags: [commander, cli-table3, picocolors, status, queue, stuck, config]

# Dependency graph
requires:
  - phase: 01-scaffolding-core
    provides: core/ data layer (config, sessions, queue-parser, stuck, process), util/ helpers
provides:
  - CLI entry point with commander program and grouped help
  - status command (compact/verbose/JSON dashboard)
  - queue command (grouped QUEUE.md display)
  - stuck command (scored processes with --kill/--force)
  - config command (resolved env vars)
  - Stub files for all future commands
affects: [02-02, 02-03, 03-queue-runner, 04-tui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic imports in commander actions for fast CLI startup"
    - "mergeOpts() pattern for combining global + local opts"
    - "Custom formatHelp for grouped command sections"

key-files:
  created:
    - src/index.ts
    - src/commands/status.ts
    - src/commands/queue.ts
    - src/commands/stuck.ts
    - src/commands/config.ts
    - "src/commands/*.ts (20 stub files)"
  modified: []

key-decisions:
  - "Custom formatHelp override instead of addHelpText for clean grouped help layout"
  - "Stub files for all commands to satisfy tsc (dynamic imports still get checked)"
  - "computeStuckScore called sequentially per PID (CPU sampling is inherently serial)"

patterns-established:
  - "Command pattern: import from core/, check isJsonMode(), output via outputJson/outputHuman"
  - "mergeOpts() with setJsonMode() in every command action"

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 2 Plan 1: Entry Point + Core Commands Summary

**Commander CLI entry point with grouped help, plus status/queue/stuck/config commands supporting human and JSON output**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T16:14:12Z
- **Completed:** 2026-02-20T16:22:18Z
- **Tasks:** 2
- **Files modified:** 29 (1 entry point + 4 commands + 24 stubs)

## Accomplishments
- CLI entry point with commander, global --json/--verbose, custom grouped help matching spec
- `pilot status` with compact/verbose/JSON modes showing running/stuck/queued/completed
- `pilot queue` displaying QUEUE.md entries grouped by status with correct icons
- `pilot stuck` with weighted scoring and --kill/--force support
- `pilot config` showing resolved env vars and claude binary detection
- All 24 commands registered via dynamic imports, stubs for future plans
- Exit code 2 for unknown commands/bad args via commander exitOverride

## Task Commits

Each task was committed atomically:

1. **Task 1: Entry point + stubs** - `ba87953` (feat)
2. **Task 2: status/queue/stuck/config commands** - `51c55dc` (feat)

## Files Created/Modified
- `src/index.ts` - Commander entry point with grouped help and all command registrations
- `src/commands/status.ts` - Dashboard with compact/verbose/JSON output
- `src/commands/queue.ts` - QUEUE.md grouped display
- `src/commands/stuck.ts` - Scored stuck detection with --kill/--force
- `src/commands/config.ts` - Resolved configuration display
- `src/commands/*.ts` (20 files) - Stubs for log, tail, projects, progress, setup, update, and Phase 2/3/4 commands

## Decisions Made
- Custom `formatHelp` override for grouped help (avoids brittle `addHelpText` ordering)
- Created stub files for all 20 future commands to satisfy tsc strict module resolution on dynamic imports
- Used `as unknown as Record<string, unknown>` cast for outputJson with PilotStatusJson (index signature mismatch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created stub files for all 20 future commands**
- **Found during:** Task 1 (Entry point creation)
- **Issue:** tsc --noEmit fails with TS2307 for dynamic imports of non-existent command modules
- **Fix:** Created minimal stub files that export the expected function and exit with "not yet implemented"
- **Files modified:** 20 stub files in src/commands/
- **Verification:** tsc --noEmit passes clean
- **Committed in:** ba87953 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for tsc compilation. Stubs are minimal (10 lines each) and will be replaced by real implementations in future plans.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entry point and core commands ready for use
- Ready for 02-02-PLAN.md (log/tail/projects/progress commands)
- All Phase 2/3 command stubs in place for future implementation

---
*Phase: 02-cli-commands*
*Completed: 2026-02-20*
