# Opencode SQLite DB Integration + Stuck Detection

## Problem
The current codebase calls `opencode session list`, `opencode export`, and counts messages via CLI output parsing. This is slow, unreliable, and prevents proper stuck detection:
- Sub-agent tasks: parent exits after dispatching, runner sees 5 messages → "flaky"
- Question prompts: process hangs forever waiting for stdin (which is /dev/null)
- Rate limits / slow APIs: no activity for minutes, but not stuck

## Goal
Replace heuristic-based detection with **direct DB queries** against opencode's SQLite database at `~/.local/share/opencode/opencode.db`.

One function: `isStuck(sessionId): { stuck: boolean, reason: string }`

## How It Works

Opencode stores everything in SQLite:
- `session` table: `id`, `parent_id`, `title`, `time_created`, `time_updated`
- `part` table: every tool call with `type`, `tool`, `state.status`, timestamps
- `parent_id` links child sessions (sub-agents from `task` tool) to their parent

### The `part` table is the source of truth

Each tool call is a row in `part` with `json_extract(data, '$.state.status')` being one of:
- `completed` — tool finished normally
- `running` — tool currently executing
- `error` — tool failed
- `pending` — tool queued

### Stuck Detection Logic

Given a session ID, query the **last part** (by `time_created`) for that session:

```sql
SELECT json_extract(p.data, '$.tool') as tool,
       json_extract(p.data, '$.state.status') as status,
       p.time_updated
FROM part p
WHERE p.session_id = ?
ORDER BY p.time_created DESC
LIMIT 1
```

**Decision tree:**

1. **Last part is `question` + `running`** → **STUCK** (waiting for user input, stdin is /dev/null, will never resolve)
   - Reason: `"waiting_for_user_input"`

2. **Last part is `task` + `running`** → **Check child session**
   - Find child: `SELECT id FROM session WHERE parent_id = ?`
   - Recursively call `isStuck(childSessionId)`
   - If child is stuck → parent is stuck
   - If child's last part is actively running (bash, read, etc.) → NOT stuck, still working

3. **Last part is `bash` + `running`** → **Check duration**
   - If running for > `stuckThreshold` (default 30 min) → **STUCK** (reason: `"long_running_command"`)
   - Otherwise → NOT stuck, let it cook

4. **Last part is any other tool + `running`** → **Check duration**
   - Same threshold logic as bash

5. **Last part is `completed`/`error` + no `step-start` after it** → Session is **DONE** (not stuck, process should have exited)

6. **No parts at all** → Session hasn't started yet, NOT stuck

### Finding the Session ID

The runner launches opencode with `--title <unique-title>`. After the process starts, find the session:

```sql
SELECT id FROM session 
WHERE title = ? 
ORDER BY time_created DESC 
LIMIT 1
```

## Requirements

### Part 1: Replace CLI calls with DB queries in `src/core/sessions.ts`

This is the central module — all other files consume session data through it.

- [ ] Add `better-sqlite3` as dependency (synchronous, fast, no async overhead)
- [ ] Create `src/core/opencode-db.ts` — thin wrapper for DB access
  - DB path: `~/.local/share/opencode/opencode.db` (or `$XDG_DATA_HOME/opencode/opencode.db`)
  - Open read-only, WAL mode safe for concurrent reads
- [ ] Rewrite `listSessions()` (line ~35) — `SELECT id, title, time_created, time_updated, parent_id, directory FROM session ORDER BY time_updated DESC`
- [ ] Rewrite `exportSession(id)` (line ~91) — query `message` + `part` tables, reconstruct the export format
- [ ] Rewrite `getSessionMessageCount(id)` (line ~101-131) — `SELECT COUNT(*) FROM message WHERE session_id = ?` (drop the 60s cache, DB is <1ms)
- [ ] Rewrite `findSession(title)` (line ~56-80) — `SELECT ... WHERE title = ? UNION SELECT ... WHERE title LIKE '%' || ? || '%' ORDER BY time_created DESC LIMIT 1`
- [ ] Remove `messageCountCache` and `extractMessageCount()` — no longer needed
- [ ] All consumers auto-fixed: `status.ts`, `log.ts`, `useStatusData.ts`

### Part 2: Stuck detection via DB

- [ ] `isStuck(sessionId)` function in `src/core/opencode-db.ts`
- [ ] Returns `{ stuck: boolean, reason: string, detail: string }`
- [ ] Handles recursive sub-agent checking (task → child session → isStuck)
- [ ] Configurable `stuckThreshold` (default 30 minutes for running tools)
- [ ] `question` + `running` = immediately stuck (no threshold)
- [ ] Wire into `src/core/stuck.ts` to replace message-count scoring (signal 3, line ~90-111)
- [ ] Find session by title (how the runner identifies its opencode sessions)

### Nice to Have
- [ ] `getSessionStatus(sessionId)` — richer status: idle, working, stuck, done
- [ ] Detect `error` status on last part as potential failure signal
- [ ] Log the actual question text when stuck on user input (helps debugging)

## Technical Notes
- DB path: `~/.local/share/opencode/opencode.db` (or `$XDG_DATA_HOME/opencode/opencode.db`)
- Use `better-sqlite3` (synchronous, no async overhead) — already common in Node CLIs
- DB is WAL mode, safe for concurrent reads while opencode writes
- Part data is JSON — use `json_extract()` in SQLite for efficient queries

## Evidence from Real Data

**Stuck on question (resume-roast map-codebase):**
- Session `ses_3813b900a...` — last part: `question | running` — hung forever
- The question asked "codebase map exists, refresh?" but stdin was /dev/null

**Killed mid-sub-agent (pilot claude-cleanup):**  
- Parent `ses_37e79d0d8...` — last part: `task | running`
- Child `ses_37e793ba9...` — last part: `bash | running` (killed at 5s)
- Runner saw 5 messages, called it "flaky", retried 3x with same result

**Successful task completion:**
- Session `ses_37ec55a94...` — task parts transition to `completed`
- Child sessions run to completion (117s+), parent gets result

## Do NOT
- Use message count as a signal for anything
- Use `time_updated` on the session as a staleness proxy (rate limits, slow APIs break this)
- Use PID as the primary stuck signal (process alive ≠ making progress)
- Add `better-sqlite3` as a runtime dep if it would bloat install — consider spawning `sqlite3` CLI as fallback
