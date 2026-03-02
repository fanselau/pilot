---
phase: quick-001
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/opencode-db.ts
  - test/core/opencode-db.test.ts
autonomous: true

must_haves:
  truths:
    - "pilot log <id> shows actual message text, not just timestamps and roles"
    - "Text content is sourced from the part table, not from message.data"
    - "isStuck() and other part-table consumers remain unaffected"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "getSessionMessages joins message + part for text content"
      contains: "part"
    - path: "test/core/opencode-db.test.ts"
      provides: "Tests verifying content comes from part table"
  key_links:
    - from: "src/core/opencode-db.ts"
      to: "part table"
      via: "SQL JOIN or subquery in getSessionMessages and parseMessageRow"
      pattern: "json_extract.*\\$\\.text"
---

<objective>
Fix `pilot log` to show actual message content instead of empty lines.

Purpose: `pilot log <id>` currently shows timestamps and roles but NO content because
`getSessionMessages()` reads `message.data.content` which doesn't exist in opencode's schema.
The actual text lives in the `part` table (type='text', `json_extract(data, '$.text')`).

Output: Working `pilot log` that displays readable session transcripts with message text.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/fix-log-content-display.md
@src/core/opencode-db.ts
@src/commands/log.ts
@src/core/types.ts
@test/core/opencode-db.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix getSessionMessages to join part table for text content</name>
  <files>src/core/opencode-db.ts</files>
  <action>
Modify `getSessionMessages()` (line ~270) and `parseMessageRow()` (line ~241) to fetch
actual content from the `part` table instead of `message.data.content`.

The fix requires changing the SQL query in `getSessionMessages` to LEFT JOIN or subquery
the `part` table, concatenating all text parts per message. Specifically:

1. **Change the SQL in `getSessionMessages`** to join with the `part` table. For each message,
   get all parts where `json_extract(data, '$.type') = 'text'`, extract `json_extract(data, '$.text')`,
   and concatenate them (GROUP_CONCAT or equivalent). Order parts by `time_created` within each message.

   Recommended approach — use a subquery or CTE:
   ```sql
   SELECT m.id, m.data, m.time_created,
     (SELECT GROUP_CONCAT(json_extract(p.data, '$.text'), char(10))
      FROM part p
      WHERE p.message_id = m.id
        AND json_extract(p.data, '$.type') = 'text'
      ORDER BY p.time_created ASC
     ) as text_content
   FROM message m
   WHERE m.session_id = ?
   ORDER BY m.time_created ASC
   ```

2. **Update `parseMessageRow`** to accept and use the `text_content` column from the query
   result instead of trying to parse `content` from `message.data`. The `text_content` from
   the subquery becomes the `content` field on SessionMessage.

   Signature change: add `text_content?: string` to the row type parameter, then:
   ```typescript
   content: row.text_content ?? '',
   ```

3. **Also fix `getLastMessage`** (line ~298) — it calls `parseMessageRow` directly.
   Its SQL query also needs the same part-table subquery to populate text_content.

4. **Also fix `exportSessionFromDb`** (line ~167) — it returns raw message data and is used
   by legacy code paths. Add the same part content JOIN so exported messages have content.
   For exportSessionFromDb, inject a `content` field into each parsed message object from
   the part table text.

Do NOT:
- Change the `SessionMessage` interface in types.ts (it already has `content: string`)
- Touch `isStuck()` — it correctly reads from `part` table already
- Touch `isSessionActive()` — it also correctly uses `part` table
- Modify the `since` parameter logic in getSessionMessages
  </action>
  <verify>
Run `npx vitest run test/core/opencode-db.test.ts` — existing tests will likely need updating
since they insert `content` in `message.data` which won't be read anymore. The tests in Task 2
will validate the new behavior. Existing tests that check `content` will break (expected) and
get fixed in Task 2.

Build check: `npx tsc --noEmit` passes.
  </verify>
  <done>
getSessionMessages, getLastMessage, and exportSessionFromDb all source text content from the
part table via json_extract(data, '$.text') where type='text', not from message.data.content.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update tests to use part table for content</name>
  <files>test/core/opencode-db.test.ts</files>
  <action>
Update the existing tests in `test/core/opencode-db.test.ts` to match the new behavior where
content comes from the `part` table, not `message.data`.

For each test that currently inserts messages with `content` in the data JSON:

1. **Remove `content` from `insertMessage` data** — message.data should only have `role`,
   `tokens`, etc. (matching real opencode schema).

2. **Add `insertPart` calls** for text content — after each message insert, add corresponding
   part rows with `{ type: 'text', text: 'the content' }`.

   Example transformation:
   ```typescript
   // BEFORE:
   insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user', content: 'Hello' });

   // AFTER:
   insertMessage(db, 'msg1', 'sess1', 1000, { role: 'user' });
   insertPart(db, 'part-msg1', 'msg1', 'sess1', 1000, { type: 'text', text: 'Hello' });
   ```

3. **Add new test cases:**
   - Message with multiple text parts → content is concatenated with newlines
   - Message with non-text parts only (tool, step-start) → content is empty string
   - Message with mixed parts (text + tool) → only text parts appear in content
   - `getLastMessage` returns content from part table

4. **Keep all existing assertions** about role, createdAt, ordering, etc. Only change
   how content is seeded (via parts instead of message.data).

5. **Keep the `handles messages with missing content gracefully` test** — update it to test
   messages that have no parts at all (content should be empty string).
  </action>
  <verify>
`npx vitest run test/core/opencode-db.test.ts` — all tests pass.
`npx tsc --noEmit` — no type errors.
  </verify>
  <done>
All opencode-db tests pass with content sourced from the part table. New tests cover
multi-part concatenation, non-text parts, mixed parts, and empty parts edge cases.
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run test/core/opencode-db.test.ts` — all tests pass
2. `npx tsc --noEmit` — no type errors
3. Manual smoke test: `npx tsx src/index.ts log <any-job-id>` shows actual message text
   (not just timestamps and roles)
</verification>

<success_criteria>
- `pilot log <id>` displays message content (text from part table)
- All existing tests updated and passing
- New edge case tests for multi-part messages, non-text parts
- No changes to SessionMessage interface or isStuck/isSessionActive
- Build passes with no type errors
</success_criteria>

<output>
After completion, create `.planning/quick/001-fix-pilot-log-show-actual-message-content/001-SUMMARY.md`
</output>
