# Pilot: opencode DB as Ground Truth

## Problem
Pilot maintains parallel state (PID files, /tmp log files, process table scanning, JSON history in queue.json) instead of reading from opencode's SQLite DB which already contains all session data. This causes:
- `pilot log` / `pilot tail` showing empty or stale data
- `pilot status` not knowing what's actually running vs stuck
- TUI showing incomplete information
- Runner tracking processes via PID polling instead of DB queries

## Goal
Pilot becomes a thin orchestration layer:
- **opencode DB** = ground truth for sessions, logs, status, messages
- **pilot-gsd `.planning/`** = ground truth for project state, phases, roadmap
- **queue.json** = simple "what to run next" queue (this is fine as-is)
- Pilot does NOT maintain its own shadow state for anything opencode already tracks

## Requirements

### Must Have

- [ ] `pilot log <session>` reads session messages directly from opencode's SQLite DB (`session` + `message` tables), not from /tmp log files
- [ ] `pilot tail <session>` watches the opencode DB for new messages (poll `message` table by session ID, ordered by created_at)
- [ ] `pilot status` gets running/completed/failed sessions from opencode DB, not from PID scanning + JSON history
- [ ] `pilot stuck` uses DB-based detection (already partially in `opencode-db.ts` — make it the primary path, not fallback)
- [ ] TUI panels (Running, Completed, Log) read from opencode DB
- [ ] Remove /tmp log file creation from spawn.ts — opencode already stores everything
- [ ] Remove PID file management — query DB for active sessions instead
- [ ] Runner completion detection: poll opencode DB for session status changes instead of watching child process exit codes

### Nice to Have
- [ ] `pilot log` supports `--follow` flag (replaces `pilot tail` — one command, not two)
- [ ] `pilot status` shows token usage per session (available in opencode DB)
- [ ] `pilot status` shows last N messages preview per running session
- [ ] Session search: `pilot log --grep "error"` searches message content in DB
- [ ] Remove the `history` array from queue.json entirely — opencode DB has all historical sessions

### Project State (No Change Needed)
- `.planning/STATE.md`, `ROADMAP.md`, phase files — these stay as-is
- `pilot projects` and `pilot progress` keep reading from `.planning/` — that's correct
- The queue.json file stays for queue management — it's a simple job queue, not session state

## Technical Notes

### opencode DB schema (key tables)
- `session` — id, title, project_dir, created_at, updated_at, model
- `message` — id, session_id, role, content, created_at, tool calls embedded
- `part` — message parts (text, tool_call, tool_result) with detailed content

### DB location
- `$XDG_DATA_HOME/opencode/opencode.db` or `~/.local/share/opencode/opencode.db`
- Read-only access, WAL mode, safe for concurrent reads
- `opencode-db.ts` already has connection logic — extend it

### Session title mapping
- Pilot sets `--title` when spawning sessions. This title is stored in the `session` table.
- Use title matching to correlate queue items → opencode sessions
- Fallback: match by project_dir + created_at window

### Runner changes
- Runner currently: spawn child process → watch PID → read exit code → check /tmp log
- Runner should: spawn child process → poll DB for session completion → read status from DB
- Child process exit code is still useful as a fast signal, but DB is authoritative

## Do NOT
- Add a new database — use opencode's existing SQLite
- Break the queue.json format — it's fine for queue management
- Change pilot-gsd's .planning/ file structure
- Make Pilot depend on opencode being installed in a specific location (keep DB path configurable)
- Remove the `opencode-db.ts` module — extend it
