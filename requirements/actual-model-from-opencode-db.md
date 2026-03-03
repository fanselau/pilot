# Show Actual Model Used (from OpenCode DB)

## Problem
Pilot shows the *intended* model (from profile resolution in `models.ts`), but never verifies what model opencode *actually* used. The actual model is stored in the opencode DB and should be queried and displayed.

## Goal
After a job session completes, read the actual model from opencode's DB and store/display it alongside the intended model. Highlight mismatches.

## Requirements

### Must Have

- [ ] **Query actual model from opencode DB**
  - The model is on the `message` table in opencode's SQLite DB
  - JSON path: `message.data` → `$.providerID` + `$.modelID`
  - Only on assistant messages (`$.role = 'assistant'`)
  - Query:
    ```sql
    SELECT DISTINCT json_extract(m.data, '$.providerID') || '/' || json_extract(m.data, '$.modelID') as model
    FROM message m JOIN session s ON m.session_id = s.id
    WHERE s.title = ? AND json_extract(m.data, '$.role') = 'assistant'
    ```
  - Add a function in `opencode-db.ts`: `getSessionModels(sessionTitle: string): string[]`
  - Returns array of unique `provider/model` strings used in that session

- [ ] **Store actual models on job in pilot DB**
  - Add column: `actual_models TEXT` on jobs table (JSON array of model strings)
  - Migration: `ALTER TABLE jobs ADD COLUMN actual_models TEXT`
  - Populate after session completes in runner.ts, before markCompleted/markFailed
  - Also query judge session's model and store separately or append
  - Add to Job type: `actualModels: string[] | null`

- [ ] **Display in TUI detail view**
  - Add a line below the existing Model line:
    - `Actual: anthropic/claude-opus-4-6` (from DB)
  - If actual differs from intended (resolved from profile), highlight in yellow/warning color
  - If multiple models used (subagents), show comma-separated list

- [ ] **Display in `pilot info`**
  - Add "Actual Models" section showing the real models from opencode DB
  - Show intended vs actual side by side

- [ ] **Display in `pilot log` header**
  - Add actual model to the log header alongside `Model: quality/claude-only`

### Nice to Have
- [ ] Per-step actual model (if multiple steps used different models)
- [ ] Warn on model drift in runner stderr output

## Technical Notes
- OpenCode DB path: `~/.local/share/opencode/opencode.db`
- `opencode-db.ts` already has functions querying this DB (`findSessionByTitle`, `getLastMessage`, `isSessionDone`)
- The session title is known — runner sets it via `--title` flag
- `message.data` JSON also has `$.agent` and `$.mode` fields if needed
- Multiple assistant messages in one session may use different models (unlikely but possible with agent switching)

## Do NOT
- Query opencode DB during active sessions (only after completion)
- Store raw message data — just the distinct model strings
- Remove the intended/resolved model display — show both
