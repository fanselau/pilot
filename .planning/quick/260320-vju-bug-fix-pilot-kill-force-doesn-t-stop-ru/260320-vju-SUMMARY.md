---
phase: quick
plan: 260320-vju
subsystem: runner
tags: [spawnAndWait, kill, staleness, opencode-db, poll-loop]

# Dependency graph
requires: []
provides:
  - "DB status check in spawnAndWait poll loop for external kill detection"
  - "Child session staleness timeout (5 min) in getSessionState"
affects: [runner, opencode-db]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Poll loop bail-out on external DB status change"
    - "Staleness timeout for orphaned child sessions"

key-files:
  created: []
  modified:
    - src/core/runner.ts
    - src/core/opencode-db.ts
    - test/core/runner.test.ts
    - test/core/opencode-db.test.ts

key-decisions:
  - "time_created is INTEGER (epoch ms), not string — direct comparison with Date.now() instead of string parsing"
  - "5-minute staleness threshold chosen to match plan, conservative enough to avoid false positives"

patterns-established:
  - "DB status check at top of poll iteration, before session-level checks"
  - "Staleness timeout for child sessions uses MAX(part.time_created) subquery"

requirements-completed: [BUG-KILL-FORCE, BUG-STALE-CHILD]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Quick Task 260320-vju: Bug Fix — pilot kill --force + stale child sessions

**spawnAndWait poll loop now checks pilot DB for external kill/cancel, and stale child Task() sessions (>5 min inactive) no longer block parent completion**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T22:47:31Z
- **Completed:** 2026-03-20T22:52:05Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 4

## Accomplishments
- spawnAndWait poll loop checks getJob() each iteration — throws immediately when job status changes to 'failed' or 'cancelled' (e.g., `pilot kill`)
- getSessionState treats child sessions with no part activity for 5+ minutes as stale, returning 'done' instead of 'working' forever
- 5 new tests covering: external kill detection, external cancel detection, running-continues, stale child timeout, active child still blocks
- Zero test regressions (1 pre-existing failure in test/web/job-routes.test.ts unrelated to changes)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** Add failing tests — `4e98d31` (test)
2. **Task 1 (GREEN):** Implement DB status check + staleness timeout — `baf4a40` (fix)

## Files Created/Modified
- `src/core/runner.ts` — Added getJob() status check at top of spawnAndWait poll iteration
- `src/core/opencode-db.ts` — Modified child session query to include MAX(part.time_created) staleness check with 5-min timeout
- `test/core/runner.test.ts` — 3 new tests for external kill/cancel/running detection
- `test/core/opencode-db.test.ts` — 2 new tests for stale child (>5 min → done) and active child (<5 min → working)

## Decisions Made
- Used direct integer comparison for `time_created` (epoch ms) instead of plan's string-parsing approach with `+ 'Z'` suffix — the schema stores INTEGER, not timestamp strings
- Placed DB status check after `shuttingDown` check but before `findSessionByTitle` — minimal overhead, one SQLite read per poll

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed time_created comparison for INTEGER column**
- **Found during:** Task 1 (implementation)
- **Issue:** Plan suggested `new Date(lastActivity + 'Z').getTime()` for string timestamps, but `time_created` is INTEGER (epoch ms)
- **Fix:** Direct numeric comparison: `Date.now() - lastActivity > CHILD_STALE_TIMEOUT_MS`
- **Files modified:** src/core/opencode-db.ts
- **Verification:** Both stale and active child tests pass
- **Committed in:** baf4a40

---

**Total deviations:** 1 auto-fixed (1 bug in plan specification)
**Impact on plan:** Necessary correction for data type mismatch. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both bugs fixed and tested
- Ready for manual verification: `pilot service start`, queue a job, `pilot kill <id>` — runner immediately stops polling

---
*Quick task: 260320-vju*
*Completed: 2026-03-20*
