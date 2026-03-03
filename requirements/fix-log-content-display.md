# Fix pilot log — Show actual message content

## Problem
`pilot log <id>` shows timestamps and roles but NO content. Output looks like:
```
11:36:55 [user]
11:36:55 [assistant]
11:37:12 [assistant]
```

## Root Cause
`getSessionMessages()` in `src/core/opencode-db.ts` reads the `message` table's `data` column and expects a `content` field. But opencode stores message metadata in `message.data` and actual content in the `part` table.

### opencode DB schema:
- `message` table: `{role, time, tokens, cost, modelID, ...}` — NO content field
- `part` table: `{type: "text", text: "actual content", ...}` — content lives here
  - Parts reference messages via `message_id`
  - Part types: `text`, `tool`, `step-start`, etc.

## Requirements

### Must Have
- [ ] `getSessionMessages()` joins `message` + `part` to get text content
- [ ] For each message, concatenate all `part` rows where `type = 'text'` (ordered by `time_created`)
- [ ] Content from `part.data` is in `json_extract(data, '$.text')`
- [ ] Truncate to 200 chars in `formatMessage()` (already done, just needs actual content)
- [ ] `pilot log <id>` displays readable session transcripts

### Nice to Have
- [ ] Show tool calls summary (part type = "tool", show tool name + status)
- [ ] `--full` flag to show complete content without truncation

## Technical Notes
- DB path: `~/.local/share/opencode/opencode.db`
- Read-only access (WAL mode)
- Part table has `message_id` foreign key to `message.id`
- Part data JSON structure: `{"type": "text", "text": "...", "time": {"start": ..., "end": ...}}`

## Do NOT
- Write to the opencode DB
- Change the SessionMessage interface (just populate the content field correctly)
- Break existing `isStuck()` which correctly reads from `part` table already
