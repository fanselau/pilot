---
phase: 12-critical-fixes-per-requirements-overnight-fixes-md
plan: 01
subsystem: core
tags: [opencode, sessions, execa, timeout, types]

# Dependency graph
requires:
  - phase: 01
    provides: sessions.ts and types.ts foundation
provides:
  - Working session listing/export via opencode binary with timeout protection
  - Optional message_count in SessionInfo for opencode compatibility
affects: [status, stuck, log, tail, tui]

# Tech tracking
tech-stack:
  added: []
  patterns: [5s subprocess timeout for all CLI calls]

key-files:
  created: []
  modified:
    - src/core/types.ts
    - src/core/sessions.ts
    - test/core/sessions.test.ts
    - test/fixtures/sessions.json

key-decisions:
  - "message_count made optional (number | undefined) rather than defaulting to 0"
  - "5s timeout on all execa calls — prevents indefinite hangs"

patterns-established:
  - "execa calls to external binaries should always include timeout option"

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 12 Plan 01: Fix Sessions for Opencode Binary Summary

**Replaced claude binary calls with opencode in sessions.ts, added 5s timeout protection, and made message_count optional for opencode compatibility**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T02:44:40Z
- **Completed:** 2026-02-21T02:46:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- sessions.ts now calls `opencode` binary instead of `claude` — prevents hangs on systems without `claude`
- All execa calls have 5-second timeout — prevents `pilot status`, `pilot stuck`, `pilot log` from hanging indefinitely
- SessionInfo.message_count is optional — opencode output doesn't include message_count, sessions now parse successfully
- Test fixtures updated to match actual opencode session list format (no message_count, has projectId/directory)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update types.ts and sessions.ts for opencode binary** - `f16a750` (fix)
2. **Task 2: Update test fixtures and session tests for opencode** - `5c0aee5` (test)

## Files Created/Modified
- `src/core/types.ts` - Made SessionInfo.message_count optional
- `src/core/sessions.ts` - Replaced claude with opencode, added 5s timeouts
- `test/core/sessions.test.ts` - Updated assertions for opencode binary and timeout
- `test/fixtures/sessions.json` - Removed message_count, added projectId/directory

## Decisions Made
- Made `message_count` optional (`number | undefined`) rather than defaulting to 0 — preserves the distinction between "no data" and "zero messages"
- Used 5000ms timeout on all execa calls — balances responsiveness with allowing slow network conditions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sessions module is now compatible with opencode binary
- Ready for 12-02-PLAN.md (next critical fixes)
- All 20 session tests pass

---
*Phase: 12-critical-fixes-per-requirements-overnight-fixes-md*
*Completed: 2026-02-21*
