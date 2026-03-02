---
phase: quick-001
plan: 01
subsystem: core-db
tags: [sqlite, opencode-db, session-messages, part-table]
dependency-graph:
  requires: []
  provides: [message-content-from-part-table]
  affects: []
tech-stack:
  added: []
  patterns: [sql-subquery-for-part-content]
key-files:
  created: []
  modified:
    - src/core/opencode-db.ts
    - test/core/opencode-db.test.ts
decisions:
  - parseMessageRow reads text_content from part-table subquery instead of message.data.content
  - GROUP_CONCAT with newline separator for multi-part message content
  - exportSessionFromDb injects content field from part table into parsed message data
metrics:
  duration: 4m
  completed: 2026-03-02
---

# Quick 001: Fix pilot log — Show actual message content

**One-liner:** Join message + part tables via subquery so pilot log displays text content from json_extract(data, '$.text') where type='text'.

## What Was Done

### Task 1: Fix getSessionMessages to join part table for text content
- Modified `getSessionMessages()` SQL to use a correlated subquery on the `part` table that concatenates all text parts per message via `GROUP_CONCAT(json_extract(p.data, '$.text'), char(10))`
- Updated `parseMessageRow()` to accept a `text_content` column from the subquery result instead of parsing `content` from `message.data`
- Updated `getLastMessage()` with the same part-table subquery
- Updated `exportSessionFromDb()` to inject `content` from part table into exported message objects

### Task 2: Update tests to use part table for content
- Removed `content` from `insertMessage` data in all tests — message.data now only has `role`, `tokens`, etc.
- Added `insertPart` calls after each message insert to seed text content via the part table
- Added 3 new edge case tests:
  - Multiple text parts concatenated with newlines
  - Non-text parts only (tool, step-start) → empty content
  - Mixed parts (text + tool) → only text parts in content
- Updated missing-content test to test messages with no parts at all

## Deviations from Plan

None — plan executed exactly as written.

## Verification

1. `npx vitest run test/core/opencode-db.test.ts` — 28/28 tests pass
2. `npx tsc --noEmit` — no type errors
3. `npx tsx src/index.ts log 5qqj` — shows actual message text with timestamps and roles

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | af67005 | fix(quick-001): source message content from part table instead of message.data |
| 2 | 8153e7d | test(quick-001): update tests to source content from part table |
