---
phase: 05-integration-fixes
plan: 03
subsystem: runner, cli
tags: [runner, queue, git, lifecycle, once-mode, update-command]

# Dependency graph
requires:
  - phase: 03-queue-runner
    provides: Runner mainLoop state machine and lifecycle automation
  - phase: 02-cli-commands
    provides: Update command implementation
provides:
  - "Fixed --once mode that properly waits for launched jobs to drain"
  - "Update command that works on repos without upstream tracking"
affects: [phase-08, CI-automation, production-runner]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unconditional wait-for-all block after main loop (safe for both modes)"
    - "Explicit remote/branch in git pull for fresh-clone compatibility"

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - src/commands/update.ts

key-decisions:
  - "Made wait-for-all block unconditional — safe because normal mode only breaks when activeJobs is empty"
  - "Best-effort upstream tracking before explicit pull — graceful degradation"

patterns-established:
  - "Runner loop exit always drains active jobs regardless of mode"

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 5 Plan 3: Runner --once Fix + Update Command Fix Summary

**Fixed runner --once mode to wait for all launched jobs before exiting, and update command to use explicit remote/branch for fresh-clone compatibility**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T10:23:11Z
- **Completed:** 2026-02-21T10:24:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Runner `--once` mode now launches all launchable entries, then waits for ALL active jobs to complete before exiting
- Removed dead code in mainLoop (unreachable `opts.once && entry === null` branch)
- `pilot update` detects current branch and uses `git pull origin <branch>` instead of bare `git pull`
- Upstream tracking set as best-effort before pull (graceful on fresh clones)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix --once mainLoop to wait for job completion** - `2078d76` (fix)
2. **Task 2: Fix update command to use explicit remote/branch** - `1eaac28` (fix)

## Files Created/Modified
- `src/core/runner.ts` - Added --once early-break in null-entry branch, removed dead code, made wait-for-all unconditional
- `src/commands/update.ts` - Detect branch, set upstream tracking (best effort), explicit `git pull origin <branch>`

## Decisions Made
- Made the wait-for-all block unconditional rather than --once-only. Safe because in normal mode, the loop only breaks when `entry === null && activeJobs.size === 0`, making the while condition immediately false (no-op).
- Default branch fallback to 'dev' when `git branch --show-current` returns empty (detached HEAD edge case).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TSC error in `src/commands/status.ts` (references `computeStuckScoreFast` but import uses old name) — this is from uncommitted work in another plan (05-02), not related to this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Runner --once mode is production-ready for CI/automation use cases
- Update command works on fresh clones without upstream tracking
- Ready for 05-04-PLAN.md

---
*Phase: 05-integration-fixes*
*Completed: 2026-02-21*
