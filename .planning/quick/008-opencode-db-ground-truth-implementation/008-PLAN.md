---
phase: quick-008
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/opencode-db.ts
  - src/core/sessions.ts
  - src/core/stuck.ts
  - src/commands/status.ts
  - src/commands/stuck.ts
  - src/commands/tail.ts
  - src/tui/useStatusData.ts
  - src/tui/LogPanel.tsx
  - src/core/spawn.ts
  - src/core/types.ts
  - test/commands/status.test.ts
  - test/core/opencode-db.test.ts
autonomous: true

must_haves:
  truths:
    - "pilot status shows running sessions from opencode DB, not from PID file scanning"
    - "pilot stuck detects stuck sessions primarily via DB part-table analysis"
    - "pilot tail polls opencode DB for new messages instead of watching /tmp log files"
    - "TUI panels read running/completed/log data from opencode DB"
    - "spawn.ts no longer creates /tmp log files for session output"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "New DB queries: getActiveSessions, getRecentSessions, getNewMessagesSince"
    - path: "src/core/sessions.ts"
      provides: "DB-backed getRunning/getCompleted replacing PID scanning"
    - path: "src/commands/status.ts"
      provides: "Status command using DB sessions instead of scanPidFiles"
    - path: "src/commands/tail.ts"
      provides: "Tail command polling DB messages instead of fs.watch on log files"
  key_links:
    - from: "src/commands/status.ts"
      to: "src/core/opencode-db.ts"
      via: "getActiveSessions() replaces scanPidFiles()"
    - from: "src/commands/stuck.ts"
      to: "src/core/opencode-db.ts"
      via: "isStuck() is primary path, /proc signals are supplementary"
    - from: "src/tui/useStatusData.ts"
      to: "src/core/opencode-db.ts"
      via: "getActiveSessions() replaces scanPidFiles()"
---

<objective>
Replace PID files, /tmp log files, and process scanning with direct reads from opencode's SQLite DB across all monitoring commands and TUI.

Purpose: opencode's DB already contains all session data. Pilot currently maintains parallel shadow state (PID files, log files, process scanning) that drifts and causes stale/empty data. Make the DB the single source of truth.

Output: All monitoring commands (`status`, `stuck`, `tail`, `log`) and TUI panels read from opencode DB. Spawn no longer creates /tmp log files. Runner still tracks PIDs for process management (kill/timeout), but monitoring is DB-first.
</objective>

<execution_context>
@/home/luca/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/luca/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@requirements/opencode-db-ground-truth.md
@src/core/opencode-db.ts
@src/core/sessions.ts
@src/core/process.ts
@src/core/stuck.ts
@src/core/spawn.ts
@src/core/runner.ts
@src/core/types.ts
@src/commands/status.ts
@src/commands/stuck.ts
@src/commands/tail.ts
@src/commands/log.ts
@src/tui/useStatusData.ts
@src/tui/LogPanel.tsx
@src/tui/RunningPanel.tsx
@src/tui/CompletedPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend opencode-db.ts with new queries + refactor sessions.ts</name>
  <files>
    src/core/opencode-db.ts
    src/core/sessions.ts
    src/core/types.ts
  </files>
  <action>
Add the following new functions to opencode-db.ts:

1. `getActiveSessions()` — Returns sessions that are currently active (have recent `part` table activity with running status). Query: Find sessions where the last part has `status = 'running'` (from `json_extract(data, '$.state.status')`). Return array of `{ id, title, time_created, time_updated, directory }`. This replaces scanPidFiles() for monitoring commands. Only return sessions updated within the last 24 hours to avoid stale results.

2. `getRecentSessions(limit: number)` — Returns the N most recently updated sessions that are NOT currently active (their last part status is completed/error, or they have no recent running parts). This replaces the "completed" sessions logic that currently filters out PID-matched sessions.

3. `getNewMessagesSince(sessionId: string, afterTime: number)` — Returns messages created after `afterTime` (epoch ms) for a session. Used by the new `pilot tail` to poll for new messages. Returns `Array<{ id, data, time_created }>`.

4. `getSessionRuntime(sessionId: string)` — Returns runtime in seconds as `(time_updated - time_created) / 1000` from the session table. Replaces getProcessRuntime() for monitoring display. Return null if session not found.

5. `getSessionStaleness(sessionId: string)` — Returns seconds since last part activity: `(Date.now() - last_part.time_updated) / 1000`. Replaces getLogStaleness() for monitoring. If no parts, returns Infinity.

Update the SessionInfo interface in types.ts to add optional `directory?: string` field.

Update sessions.ts to add these new async wrappers:
- `getActiveSessions()` → calls `getActiveSessionsFromDb()` from opencode-db.ts, maps to SessionInfo[]
- `getRecentSessions(limit)` → calls `getRecentSessionsFromDb(limit)`, maps to SessionInfo[]
- `getSessionRuntime(sessionId)` → wraps `getSessionRuntimeFromDb()`
- `getSessionStaleness(sessionId)` → wraps `getSessionStalenessFromDb()`

IMPORTANT: Keep all existing functions in opencode-db.ts and sessions.ts. The new functions are additive. Do NOT remove listSessionsFromDb, findSessionFromDb, exportSessionFromDb, etc. — they're still used by `pilot log` and other commands.
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors.
Run `npx vitest run test/core/opencode-db.test.ts` — existing tests still pass.
Run `npx vitest run test/core/sessions.test.ts` — existing tests still pass.
  </verify>
  <done>
New DB query functions exist and are exported. SessionInfo type has optional directory field. All existing tests pass unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor status, stuck, tail commands + TUI to use DB</name>
  <files>
    src/commands/status.ts
    src/commands/stuck.ts
    src/commands/tail.ts
    src/tui/useStatusData.ts
    src/tui/LogPanel.tsx
    src/core/spawn.ts
    test/commands/status.test.ts
  </files>
  <action>
**status.ts changes:**
Replace the PID-scanning flow with DB-backed flow:
1. Remove `import { scanPidFiles, ... } from '../core/process.js'` (keep readPidFile and isProcessAlive for runner status check only)
2. Import `getActiveSessions, getRecentSessions, getSessionRuntime, getSessionStaleness` from `../core/sessions.js`
3. Import `isStuck, findSessionByTitle` from `../core/opencode-db.js`
4. Replace the "Scan PID files" block: call `getActiveSessions()` instead. This returns SessionInfo[] of active sessions.
5. For stuck detection on running sessions, call `isStuck(session.id)` from opencode-db.ts instead of computeStuckScoreFast. Build StuckAssessment from the IsStuckResult: if stuck=true, score=80; if not, score=0. For runtime use `getSessionRuntime(session.id)`. For log_staleness use `getSessionStaleness(session.id)`.
6. Replace "completed sessions" logic: call `getRecentSessions(5)` instead of filtering sessions by PID set.
7. For runner PID check: keep using readPidFile('pilot-runner') + isProcessAlive — the runner PID is still tracked via PID file (runner is pilot's own process, not an opencode session).
8. In human output, show session titles from DB (session.title) instead of pidEntry.session.

**stuck.ts changes:**
1. Remove `import { scanPidFiles, removePidFile } from '../core/process.js'`
2. Import `getActiveSessions` from `../core/sessions.js` and `isStuck` from `../core/opencode-db.js`
3. Replace scanPidFiles() call: use `getActiveSessions()` to get running sessions.
4. For each active session, call `isStuck(session.id, thresholdMinutes)` as primary detection. Map the result to a StuckAssessment:
   - `waiting_for_user_input` → score 80, verdict 'stuck'
   - `child_stuck` → score 70, verdict 'stuck'  
   - `long_running_command` → score 50, verdict 'suspect'
   - `not_stuck` → score 0, verdict 'healthy'
5. For --kill: Since we no longer have PIDs from PID files, we need to find the process. Use `pgrep -f "opencode.*--title.*${sessionTitle}"` to find the PID, then kill it. Import `execa` for this. Or better: keep the kill functionality as a TODO/warning that --kill requires the runner to be managing the session. For now, make --kill look up PIDs via pgrep.
6. Keep removePidFile import for cleanup after kill (best effort — PID file may not exist).

**tail.ts changes:**
Replace the fs.watch log file watcher with DB message polling:
1. Remove all fs.watch, createReadStream imports
2. Import `findSession, exportSession` from `../core/sessions.js` and `getNewMessagesSince` from opencode-db via sessions.ts (add a wrapper)
3. For `pilot tail <session>`:
   - Keep the special "runner" case (still reads runner log file — runner is pilot's own log, not in opencode DB)
   - For all other sessions: find session by fuzzy match via findSession()
   - Poll opencode DB every 1 second for new messages (using getNewMessagesSince with the last seen time_created)
   - Format and display new messages as they arrive (role: user → cyan prefix, role: assistant → green prefix, tool_use → dim brackets)
   - Keep Ctrl-C clean exit handler
4. This makes `pilot tail` effectively "follow" the DB for new messages rather than following a log file.

**useStatusData.ts changes:**
1. Remove `import { scanPidFiles, readPidFile, isProcessAlive, getProcessRuntime } from '../core/process.js'`
2. Remove `import { scoreFromSignals, getLogStaleness, getProcessRss, getSystemFreeMem } from '../core/stuck.js'`
3. Import `getActiveSessions, getRecentSessions, getSessionRuntime, getSessionStaleness` from `../core/sessions.js`
4. Import `isStuck` from `../core/opencode-db.js`
5. Import `readPidFile, isProcessAlive` from `../core/process.js` (still needed for runner status check only)
6. Replace PID scanning + stuck scoring loop with:
   - Call `getActiveSessions()` for running sessions
   - For each: get runtime via `getSessionRuntime()`, staleness via `getSessionStaleness()`
   - For stuck scoring: call `isStuck(session.id)` and map to verdict/score
7. Replace completed sessions logic with `getRecentSessions(10)`

**LogPanel.tsx changes:**
1. Replace log file reading with DB message reading:
   - Import `exportSessionFromDb, findSessionFromDb` from `../core/opencode-db.js`
   - Instead of reading `/tmp/gsd-*.log`, call `exportSessionFromDb(sessionId)` to get messages
   - Find session by title match using `findSessionFromDb(sessionName)`
   - Parse messages from the export data and display last N lines
   - Keep the 3-second refresh interval
2. The sessionName prop is a title string — use findSessionFromDb to get the ID, then exportSessionFromDb to get messages.

**spawn.ts changes:**
Remove log file creation from spawnSession():
1. The `opts.logFile` is currently passed to execa as stdout/stderr redirect. Remove this — opencode stores all output in its DB.
2. Change `spawnSession()`: Set stdout and stderr to `'pipe'` or `'ignore'` instead of `{ file: opts.logFile }`. Since we're detaching and unref'ing, `'ignore'` is appropriate (the output goes to opencode's DB, not our log files).
3. Keep the `logFile` field in SpawnOptions and SpawnResult for backward compat (the runner uses it for stuck detection log staleness checks), but make it optional. Or simpler: keep writing the log file BUT only as a fallback. Actually, the simplest change: keep the log file for now since the runner's daemon stuck scorer (`computeDaemonStuckScore`) still reads log staleness. Mark a TODO to remove in a future cleanup. INSTEAD: Change stdout/stderr from `{ file: opts.logFile }` to `'ignore'`. The daemon stuck scorer will get Infinity for log staleness (file won't exist) which is fine — it now relies on DB-based isStuck() which is the primary signal. Keep the logFile in SpawnOptions so runner.ts doesn't need changes to its job tracking structure.

**test/commands/status.test.ts changes:**
Update mocks to match new imports:
1. Mock `../core/sessions.js` to include `getActiveSessions` and `getRecentSessions`
2. Remove/reduce mocks for `scanPidFiles`, `getProcessRuntime` from `../core/process.js` (keep readPidFile, isProcessAlive for runner check)
3. Mock `../core/opencode-db.js` for `isStuck` and `findSessionByTitle`
4. Update test cases to use DB-backed data shapes
5. Ensure existing test scenarios (compact, verbose, JSON) still validate correct output

IMPORTANT things to NOT change:
- runner.ts: Keep PID tracking for the runner's own process management (spawn, kill, timeout). The runner needs to know its child PIDs. Don't touch runner.ts.
- process.ts: Keep all functions. They're still used by runner.ts, doctor.ts, and the runner PID check in status.ts. Don't remove any exports.
- The runner's PID file at `gsd-pilot-runner-pid` stays — it's for the runner daemon itself, not opencode sessions.
- log.ts: Already works via DB (sessions.ts → opencode-db.ts). No changes needed.
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors.
Run `npx vitest run` — all tests pass (update any failing tests).
Manually verify: `npx tsx src/index.ts status` runs without error (may show empty if no sessions).
Manually verify: `npx tsx src/index.ts status --json` outputs valid JSON.
  </verify>
  <done>
- `pilot status` queries opencode DB for running sessions, not PID files
- `pilot stuck` uses isStuck() from opencode-db.ts as primary detection
- `pilot tail` polls DB for new messages instead of watching /tmp log files
- TUI useStatusData uses DB queries instead of PID scanning
- TUI LogPanel reads messages from DB instead of log files
- spawn.ts no longer redirects stdout/stderr to log files
- All tests pass
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — no type errors across entire project
2. `npx vitest run` — all tests pass
3. `pilot status` shows running sessions from DB (if any opencode sessions exist)
4. `pilot status --json` outputs valid JSON with timestamp
5. `pilot stuck` detects stuck via DB part-table analysis
6. `pilot tail <session>` polls DB for new messages (test with active session)
7. Runner still starts/stops correctly via `pilot run --once` (PID tracking preserved)
</verification>

<success_criteria>
- All Must Have requirements from opencode-db-ground-truth.md are satisfied
- No regressions: all existing tests pass
- The runner still functions (PID tracking preserved for process management)
- Monitoring commands (status, stuck, tail) read exclusively from opencode DB
- TUI panels read from opencode DB
- spawn.ts no longer creates /tmp log files for session output
</success_criteria>

<output>
After completion, create `.planning/quick/008-opencode-db-ground-truth-implementation/008-SUMMARY.md`
</output>
