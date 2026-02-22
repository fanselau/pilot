---
phase: 17-pilot-v2-complete-rewrite
plan: 03
subsystem: database
tags: [sqlite, better-sqlite3, opencode-db, session-queries, token-aggregation]

requires:
  - phase: 17-01
    provides: v2 types (SessionInfo, SessionMessage), opencode-db.ts base with cachedDb pattern

provides:
  - getSessionMessages — query messages by session with optional since filter
  - getLastMessage — most recent message for monitoring
  - isSessionActive — check running parts (replaces PID tracking)
  - getSessionTokens — aggregate input/output tokens from messages
  - getRecentSessions — last N sessions with message counts

affects: [17-05-runner, 17-06-cli-commands, 17-07-remaining-commands]

tech-stack:
  added: []
  patterns: [parseMessageRow helper for DRY message parsing, json_extract SQL for structured data queries, COALESCE for safe token aggregation]

key-files:
  created: [test/core/opencode-db.test.ts]
  modified: [src/core/opencode-db.ts]

key-decisions:
  - "Token aggregation via SQL json_extract + COALESCE, not JS-side iteration"
  - "isSessionActive queries part table state.status field, not process table"
  - "parseMessageRow helper extracted to DRY message parsing across functions"

patterns-established:
  - "In-memory SQLite test DB with real opencode schema for query testing"
  - "Safe defaults pattern: empty arrays, null, false, {0,0} when DB unavailable"

duration: 3min
completed: 2026-02-22
---

# Phase 17 Plan 03: Extended opencode DB Queries Summary

**5 new query functions for opencode-db.ts — session messages, activity detection, token aggregation, recent sessions — all tested with in-memory DB matching real schema**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T20:54:51Z
- **Completed:** 2026-02-22T20:58:39Z
- **Tasks:** 3 (RED → GREEN → REFACTOR)
- **Files modified:** 2

## Accomplishments
- getSessionMessages with optional `since` filter for monitoring
- getLastMessage for real-time session tracking
- isSessionActive using part table state (replaces PID tracking)
- getSessionTokens aggregating input/output tokens via SQL
- getRecentSessions with message counts for dashboard
- 25 test cases covering all functions + edge cases + DB-unavailable defaults

## Task Commits

Each TDD phase was committed atomically:

1. **RED: Failing tests for v2 queries** - `6f4aedd` (test)
2. **GREEN: Implement v2 query functions** - `ff6bace` (feat)
3. **REFACTOR: Extract parseMessageRow helper** - `8548ea7` (refactor)

## Files Created/Modified
- `src/core/opencode-db.ts` - Added 5 new query functions + parseMessageRow helper (569 lines total)
- `test/core/opencode-db.test.ts` - 25 tests with in-memory DB matching opencode schema (387 lines)

## Decisions Made
- Token aggregation done in SQL via `json_extract` + `COALESCE` rather than fetching all messages and summing in JS — more efficient for large sessions
- `isSessionActive` queries the `part` table for `state.status = 'running'` — this replaces PID tracking entirely per v2 architecture
- Extracted `parseMessageRow` helper to share JSON parsing between `getSessionMessages` and `getLastMessage`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v2 query functions implemented and tested
- Ready for 17-04-PLAN.md (Delegation AI module)
- Runner (17-05) will use getSessionMessages, isSessionActive, getLastMessage for session monitoring
- CLI commands (17-06) will use getRecentSessions, getSessionTokens for status/log display

---
*Phase: 17-pilot-v2-complete-rewrite*
*Completed: 2026-02-22*
