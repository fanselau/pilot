---
phase: 61-pilot-web-ui-phase-1
plan: 01
subsystem: core-query
tags: [query-backbone, dto, compact-model, web-ui, job-detail]
dependency-graph:
  requires: [17-02, 17-03, 45-01, 45-02]
  provides: [compact-query-backbone, job-detail-snapshot, session-summary-cards, paginated-activity, incremental-events]
  affects: [61-02, 61-03]
tech-stack:
  added: []
  patterns: [root-based-non-recursive-query, cursor-pagination, compact-dto]
file-tracking:
  key-files:
    created:
      - src/core/job-detail-query.ts
      - test/core/job-detail-query.test.ts
    modified:
      - src/core/types.ts
decisions:
  - id: d61-01-01
    decision: "Named getSessionChildSummaries instead of getSessionChildren to avoid import conflict with opencode-db.ts"
    rationale: "opencode-db.ts already exports getChildSessions; avoiding name collision keeps imports clean"
  - id: d61-01-02
    decision: "Session status determined as done/active/unknown based on isSessionDone() and getAssistantMessageCount()"
    rationale: "Three-state model distinguishes sessions that finished (done), sessions with activity (active), and sessions that may have crashed (unknown)"
  - id: d61-01-03
    decision: "Activity preview capped at 10 items from last 20 parts of first root session"
    rationale: "Compact preview without overwhelming the UI; takes from recent parts only"
  - id: d61-01-04
    decision: "Cursor is opaque timestamp string (String(Date.now()))"
    rationale: "Gives future flexibility to change cursor format without breaking clients"
metrics:
  duration: 5m 30s
  completed: 2026-03-13
---

# Phase 61 Plan 01: Compact Query Backbone Summary

**One-liner:** 5 query functions with 8 concrete DTO interfaces for root-based non-recursive job detail, session summaries, paginated activity, and incremental event deltas.

## What Was Done

### Task 1: Compact DTO interfaces in types.ts
Added 8 TypeScript interfaces to `src/core/types.ts`:
- **JobDetailSnapshot** — root return type with job, steps, sessions, subagents, activity preview, cursor
- **JobStepSummary** — compact step timeline entry
- **SessionSummary** — session card with role, status, tokens, models, child count
- **ActivityPreviewItem** — truncated activity snippet
- **SessionActivityPage** — paginated parts with hasMore/nextCursor
- **SessionActivityOptions** — cursor, limit, includeToolDetails
- **JobDetailEvent** — incremental update delta (4 event types)
- **JobDetailEventsResponse** — events array + new cursor

### Task 2: Query functions in job-detail-query.ts
Created `src/core/job-detail-query.ts` with 5 exported functions:
1. **getJobDetail(jobId)** — loads job + steps + root sessions + subagent cards + activity preview + parsed verdict. Returns null for missing jobs.
2. **summarizeSession(...)** — builds SessionSummary with tokens, models, message count, child count, status inference
3. **getSessionActivity(sessionId, options)** — paginated parts with cursor, limit, and tool detail exclusion
4. **getSessionChildSummaries(sessionId)** — immediate children only as summary cards (not recursive)
5. **getJobDetailEvents(jobId, sinceCursor)** — compact deltas for job-update, step-update, activity-new events

### Task 3: Unit tests
Created `test/core/job-detail-query.test.ts` with 30 tests covering:
- getJobDetail: happy path (8 assertions), null job, null verdict, no sessions
- summarizeSession: correct fields, truncation, child count, token total, 3 status states
- getSessionActivity: pagination, tool detail exclusion, cursor computation, empty results
- getSessionChildSummaries: returns 2 children not 4 (grandchildren excluded), each with childCount=1
- getJobDetailEvents: all 4 event types, empty events, non-existent job, cursor freshness

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` — passes
- `npx vitest run test/core/job-detail-query.test.ts` — 30/30 tests pass
- `npx vitest run` — 970/970 tests pass across 49 test files (no regressions)
- All 8 DTO interfaces exported from types.ts
- All 5 functions exported from job-detail-query.ts

## Key Design Decisions

1. **Root-based non-recursive model**: Subagents appear as summary cards with counts (childCount, tokenTotal), NOT as inline transcripts. This is the key architectural difference from the TUI's recursive rendering model.

2. **Cursor-based pagination**: Session activity uses opaque string cursors (epoch ms) for forward-only pagination. The cursor format is intentionally opaque for future flexibility.

3. **Tool detail exclusion**: `includeToolDetails: false` (default) strips toolInput/toolOutput from parts for compact views. The tool name is always preserved.

4. **Incremental events**: `getJobDetailEvents` returns compact deltas by comparing timestamps against the cursor — NOT full job re-serialization. Activity events capped at 20 per poll cycle.

## Next Phase Readiness

This plan provides the shared data contract that Plan 02 (HTTP API layer) and Plan 03 (React web UI) will consume. All DTO types and query functions are stable and tested.
