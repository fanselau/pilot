---
phase: 11-finishing-touches
plan: 02
subsystem: infra
tags: [notifications, webhook, logging, runner, fetch, rotation]

# Dependency graph
requires:
  - phase: 03
    provides: Queue runner state machine with event emitter
  - phase: 11-01
    provides: index.ts with grouped help and doctor command
provides:
  - Runner log module with date-stamped files and rotation
  - Webhook notification system (fire-and-forget)
  - "pilot log runner" and "pilot tail runner" commands
affects: [11-03, 11-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget notifications, date-based log rotation]

key-files:
  created:
    - src/core/runner-log.ts
    - src/core/notifications.ts
    - test/core/runner-log.test.ts
    - test/core/notifications.test.ts
  modified:
    - src/commands/run.ts
    - src/commands/log.ts
    - src/commands/tail.ts
    - src/index.ts

key-decisions:
  - "No new dependencies — uses built-in fetch() for webhooks"
  - "Sync appendFileSync for runner log writes — infrequent, no interleaving risk"
  - "Filename date rotation instead of mtime — deterministic and testable"
  - "Notifications never throw — fire-and-forget with stderr logging on failure"

patterns-established:
  - "Runner log: ~/.pilot/logs/runner-YYYY-MM-DD.log date-stamped format"
  - "Config-driven notifications via ~/.pilot/config.json notifications section"

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 11 Plan 02: Runner Log + Notifications Summary

**Webhook notifications on job complete/fail + runner log to ~/.pilot/logs/ with 7-day rotation and `pilot log/tail runner` support**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T11:32:30Z
- **Completed:** 2026-02-21T11:37:29Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Runner writes persistent datestamped logs to ~/.pilot/logs/runner-YYYY-MM-DD.log
- Log rotation deletes files older than 7 days by filename date (deterministic)
- Webhook notification sender fires on complete/fail events via POST with 5s timeout
- `pilot log runner` displays latest runner log, `pilot tail runner` follows it
- `--notify` flag enables notifications, `--quiet` suppresses them
- 28 new tests covering all log operations and notification paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Runner log module + notifications module + tests** - `83fd9b7` (feat)
2. **Task 2: Wire runner log + notifications into runner and commands** - `a45382c` (feat)

## Files Created/Modified
- `src/core/runner-log.ts` - Runner log writer with rotation (createRunnerLogger, getRunnerLogPath, getLatestRunnerLogPath, rotateRunnerLogs)
- `src/core/notifications.ts` - Webhook notification sender (loadNotificationConfig, sendNotification)
- `test/core/runner-log.test.ts` - 14 tests for runner log module
- `test/core/notifications.test.ts` - 14 tests for notifications module
- `src/commands/run.ts` - Wired logger + notifications into runner event handlers
- `src/commands/log.ts` - Added "runner" session handling for runner log display
- `src/commands/tail.ts` - Added "runner" session handling for runner log following
- `src/index.ts` - Added --notify and --quiet flags to run command

## Decisions Made
- Used built-in fetch() (Node.js 20+) instead of adding HTTP library dependency
- Sync appendFileSync for runner log — infrequent writes, simplicity over async
- Filename date-based rotation (not mtime) for deterministic, testable behavior
- Notifications catch all errors and log to stderr — never crash the runner
- --notify without config creates minimal config (enabled=true, no webhook)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed createRunnerLogger crash on invalid logsDir**
- **Found during:** Task 1 (runner-log.ts implementation)
- **Issue:** ensureLogsDir threw EACCES when directory couldn't be created, crashing the caller
- **Fix:** Wrapped ensureLogsDir in try/catch — log writes already handle errors silently
- **Files modified:** src/core/runner-log.ts
- **Verification:** Test passes: silently handles write errors
- **Committed in:** 83fd9b7

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for robustness — runner should never crash over log setup.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Runner log and notifications operational
- Ready for 11-03-PLAN.md (next plan in phase)
- No blockers or concerns

---
*Phase: 11-finishing-touches*
*Completed: 2026-02-21*
