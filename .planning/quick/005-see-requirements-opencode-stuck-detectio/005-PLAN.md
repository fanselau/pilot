---
phase: quick-005
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/core/opencode-db.ts
  - src/core/sessions.ts
  - src/core/stuck.ts
  - src/core/types.ts
  - test/core/opencode-db.test.ts
  - test/core/sessions.test.ts
  - test/core/stuck.test.ts
autonomous: true

must_haves:
  truths:
    - "Session listing, finding, exporting, and message counting use SQLite queries instead of opencode CLI"
    - "Stuck detection identifies question+running sessions as immediately stuck"
    - "Stuck detection recursively checks sub-agent (task+running) child sessions"
    - "Long-running bash/tool commands are only stuck after threshold (30 min default)"
    - "All existing consumers (status.ts, log.ts, useStatusData.ts, stuck.ts, runner.ts) work without changes"
  artifacts:
    - path: "src/core/opencode-db.ts"
      provides: "SQLite DB wrapper + isStuck function"
      exports: ["openDb", "listSessionsFromDb", "findSessionFromDb", "exportSessionFromDb", "getSessionMessageCountFromDb", "isStuck", "IsStuckResult"]
    - path: "src/core/sessions.ts"
      provides: "Rewired session functions using DB queries"
    - path: "src/core/stuck.ts"
      provides: "Stuck detection wired to isStuck for signal 3"
  key_links:
    - from: "src/core/sessions.ts"
      to: "src/core/opencode-db.ts"
      via: "import and delegate to DB functions"
      pattern: "import.*opencode-db"
    - from: "src/core/stuck.ts"
      to: "src/core/opencode-db.ts"
      via: "isStuck replaces message count signal 3"
      pattern: "isStuck"
---

<objective>
Replace opencode CLI-based session queries and heuristic stuck detection with direct SQLite DB queries against opencode's database.

Purpose: The CLI approach (`opencode session list`, `opencode export`) is slow, unreliable, and prevents proper stuck detection. Sub-agent tasks, question prompts, and rate limits all cause false positives/negatives. Direct DB access gives us the `part` table — the actual source of truth for what opencode is doing.

Output: `src/core/opencode-db.ts` with DB wrapper + `isStuck()`, rewritten `sessions.ts`, and wired stuck detection in `stuck.ts`.
</objective>

<execution_context>
@/home/luca/.config/opencode/workflows/execute-plan.md
@/home/luca/.config/opencode/templates/summary.md
</execution_context>

<context>
@requirements/opencode-stuck-detection.md
@src/core/sessions.ts
@src/core/stuck.ts
@src/core/types.ts
@src/commands/status.ts
@src/commands/log.ts
@src/commands/stuck.ts
@src/tui/useStatusData.ts
@src/core/runner.ts
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create opencode-db.ts with SQLite wrapper and isStuck</name>
  <files>
    package.json
    src/core/opencode-db.ts
    src/core/types.ts
    test/core/opencode-db.test.ts
  </files>
  <action>
1. Add `better-sqlite3` as dependency and `@types/better-sqlite3` as devDependency:
   ```
   npm install better-sqlite3
   npm install -D @types/better-sqlite3
   ```

2. Create `src/core/opencode-db.ts` — thin wrapper for opencode's SQLite DB:

   **DB connection:**
   - DB path: `$XDG_DATA_HOME/opencode/opencode.db` or `~/.local/share/opencode/opencode.db`
   - Open **read-only** (`{ readonly: true, fileMustExist: true }`)
   - WAL mode safe for concurrent reads
   - Export `openDb()` that returns a Database instance (or null if DB doesn't exist)
   - Cache the connection at module level (single process, reuse)

   **Session queries (replacing CLI calls):**
   
   - `listSessionsFromDb(): SessionInfo[]` — `SELECT id, title, time_created, time_updated, parent_id, directory FROM session ORDER BY time_updated DESC`. Map: `time_created` → `created` (epoch ms), `time_updated` → `updated` (epoch ms). Note: opencode stores times as **ISO strings or Unix seconds** — check the actual format and convert to epoch ms as SessionInfo expects.
   
   - `findSessionFromDb(query: string): SessionInfo | null` — Two-step: exact title match, then LIKE '%query%' (case-insensitive), ordered by time_created DESC, LIMIT 1.
   
   - `exportSessionFromDb(sessionId: string): unknown` — Query `message` table for the session: `SELECT * FROM message WHERE session_id = ? ORDER BY time_created`. Return as array of message objects. Also query `part` table: `SELECT * FROM part WHERE session_id = ? ORDER BY time_created`. Reconstruct a format compatible with what `log.ts` expects (check what `exportSession` currently returns and match its shape — the `messages` array with role/content/tool_calls).
   
   - `getSessionMessageCountFromDb(sessionId: string): number` — `SELECT COUNT(*) FROM message WHERE session_id = ?`. No caching needed — DB queries are <1ms.

   **isStuck function:**
   
   ```typescript
   interface IsStuckResult {
     stuck: boolean;
     reason: string;  // 'not_stuck' | 'waiting_for_user_input' | 'long_running_command' | 'child_stuck'
     detail: string;  // human-readable detail
   }
   
   function isStuck(sessionId: string, stuckThresholdMinutes?: number): IsStuckResult
   ```
   
   Implementation per requirements decision tree:
   
   a. Query last part for session:
      ```sql
      SELECT json_extract(p.data, '$.tool') as tool,
             json_extract(p.data, '$.state.status') as status,
             p.time_updated
      FROM part p
      WHERE p.session_id = ?
      ORDER BY p.time_created DESC
      LIMIT 1
      ```
   
   b. Decision tree:
      1. `question` + `running` → `{ stuck: true, reason: 'waiting_for_user_input', detail: 'Session waiting for user input (stdin is /dev/null)' }`
      2. `task` + `running` → Find child session (`SELECT id FROM session WHERE parent_id = ?`), recurse `isStuck(childId)`. If child stuck → parent stuck with `reason: 'child_stuck'`.
      3. `bash` + `running` → Check duration: if `now - time_updated > stuckThreshold` → stuck with `reason: 'long_running_command'`, else not stuck.
      4. Any other tool + `running` → Same threshold check as bash.
      5. `completed` or `error` status → not stuck (session done or failing normally).
      6. No parts → not stuck (hasn't started).
   
   - `findSessionByTitle(title: string): string | null` — Find session ID by title for the runner integration:
     ```sql
     SELECT id FROM session WHERE title = ? ORDER BY time_created DESC LIMIT 1
     ```
   
   - Default `stuckThresholdMinutes` = 30. Use `getConfig().stuckThreshold` as fallback but the DB-based threshold should be shorter than the /proc-based one since it's more precise.

   - **Graceful fallback**: If DB doesn't exist or is unreadable, all functions should return safe defaults (empty arrays, null, `{ stuck: false }`) — same pattern as current sessions.ts. Log a warning to stderr on first failure.

3. Add `IsStuckResult` to `src/core/types.ts` if it's cleaner to share, OR keep it in opencode-db.ts and export it. Prefer keeping it in opencode-db.ts since it's specific to that module.

4. Create `test/core/opencode-db.test.ts`:
   - Use `better-sqlite3` to create an **in-memory** test DB with the opencode schema (session, message, part tables)
   - Test `isStuck` decision tree:
     - question + running → stuck
     - task + running with stuck child → stuck
     - task + running with healthy child → not stuck
     - bash + running under threshold → not stuck
     - bash + running over threshold → stuck
     - completed status → not stuck
     - No parts → not stuck
   - Test `listSessionsFromDb`, `findSessionFromDb`, `getSessionMessageCountFromDb`
   - Mock `openDb()` to return the in-memory DB for tests
  </action>
  <verify>
  `npx vitest run test/core/opencode-db.test.ts` passes all tests. `npx tsc --noEmit` compiles clean.
  </verify>
  <done>
  opencode-db.ts exists with all DB query functions and isStuck. All isStuck decision tree branches tested with in-memory SQLite.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewire sessions.ts and stuck.ts to use DB queries</name>
  <files>
    src/core/sessions.ts
    src/core/stuck.ts
    test/core/sessions.test.ts
    test/core/stuck.test.ts
  </files>
  <action>
1. **Rewrite `src/core/sessions.ts`** to delegate to opencode-db.ts:
   
   - `listSessions()` → call `listSessionsFromDb()`. Remove the `execa('opencode', ['session', 'list', ...])` call. Keep the same return type `Promise<SessionInfo[]>`. If DB unavailable, fall back to empty array (same behavior as current error catch).
   
   - `findSession(query)` → call `findSessionFromDb(query)`. Same 3-step fuzzy logic lives in opencode-db.ts now. Keep the async signature for API compat even though DB is sync.
   
   - `exportSession(sessionId)` → call `exportSessionFromDb(sessionId)`. Must return compatible format for `log.ts` consumption. Check what `log.ts` expects from the export (it looks for `.messages` array with role/content fields).
   
   - `getSessionMessageCount(session)` → call `getSessionMessageCountFromDb()`. Remove the 60s cache (`messageCountCache`, `CACHE_TTL_MS`, `CacheEntry` interface) — DB is fast enough. Remove `extractMessageCount()` helper.
   
   - `clearSessionCache()` → keep as no-op or remove. Check if tests call it — if so, keep as no-op for compat.
   
   - Remove `import { execa } from 'execa'` — no longer needed in sessions.ts.
   
   - Keep all exports identical so consumers don't change.

2. **Wire `isStuck` into `src/core/stuck.ts`** — replace Signal 3 (message count):
   
   Currently in `scoreFromSignals()` (lines 90-113), Signal 3 checks message count (0 messages → 40pts, <3 messages → 20pts). This is the heuristic the requirements say to replace.
   
   **In `computeStuckScore()`** and **`computeStuckScoreFast()`**:
   - After gathering /proc signals, also call `findSessionByTitle(session)` to get the DB session ID
   - Then call `isStuck(sessionId)` 
   - If `isStuck` returns `stuck: true`:
     - For `waiting_for_user_input` → add signal with 80 points (immediately stuck, no threshold needed)
     - For `long_running_command` → add signal with 40 points
     - For `child_stuck` → add signal with 70 points (child stuck = parent should be killed)
   - Remove the old Signal 3 from `scoreFromSignals` input (set messageCount to null always, or better: remove the Signal 3 block entirely from `scoreFromSignals` and replace with a new signal type)
   
   **Actually, cleaner approach:**
   - Keep `scoreFromSignals` as-is for backward compat (tests use it directly)
   - In `computeStuckScore` and `computeStuckScoreFast`, call `isStuck()` AFTER `scoreFromSignals`
   - If isStuck returns stuck, ADD its points to the score and its signal to the signals array
   - Set `messageCount: null` when calling `scoreFromSignals` (so Signal 3 never fires)
   - This way the old pure function stays testable, and the new DB signal is additive
   
   **In `computeDaemonStuckScore()`** (used by runner):
   - Same approach: after the existing scoring, call `isStuck()` using the session title
   - Use `findSessionByTitle(session)` to get the DB session ID
   - Add isStuck result as an additional signal
   - Remove Signal 4 (no output) since isStuck is more accurate
   - Actually, KEEP Signal 4 as fallback — isStuck may fail if DB unavailable

3. **Update `src/core/stuck.ts` StuckSignalInput:**
   - No changes needed if we keep the additive approach above
   - Add import for `isStuck` and `findSessionByTitle` from opencode-db.ts

4. **Update tests:**
   
   `test/core/sessions.test.ts`:
   - Mock `opencode-db.ts` instead of mocking `execa`
   - Test that `listSessions()` returns DB results
   - Test that `findSession()` does fuzzy matching
   - Test that `getSessionMessageCount()` works without cache
   - Remove cache-related tests
   
   `test/core/stuck.test.ts`:
   - Keep existing `scoreFromSignals` tests unchanged (pure function, still works)
   - Add tests for `computeStuckScoreFast` and `computeDaemonStuckScore` with mocked `isStuck`
   - Test: isStuck returns `waiting_for_user_input` → score includes 80pt signal
   - Test: isStuck returns `not_stuck` → no additional signal
   - Test: isStuck fails (DB unavailable) → graceful fallback, no crash
  </action>
  <verify>
  `npx vitest run test/core/sessions.test.ts test/core/stuck.test.ts` passes. `npx vitest run` (full suite) passes. `npx tsc --noEmit` compiles clean.
  </verify>
  <done>
  sessions.ts uses DB queries instead of CLI calls. stuck.ts uses isStuck() for stuck detection instead of message count heuristics. All existing consumers (status.ts, log.ts, useStatusData.ts, runner.ts) work without modification. Full test suite green.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. `npx vitest run` — full test suite passes
3. `npx tsx src/index.ts status --json` — produces valid JSON (if opencode.db exists on system)
4. `npx tsx src/index.ts stuck` — runs without errors
5. Verify no `execa('opencode'` calls remain in sessions.ts
6. Verify `better-sqlite3` is in package.json dependencies
</verification>

<success_criteria>
- opencode CLI calls removed from sessions.ts — all session data comes from SQLite
- isStuck() correctly identifies question+running as immediately stuck
- isStuck() recursively checks sub-agent child sessions
- isStuck() respects 30-min threshold for long-running commands
- Message count heuristic (Signal 3) no longer used for stuck scoring
- All existing tests pass, new tests cover isStuck decision tree
- Graceful fallback when DB is unavailable (empty arrays, not stuck)
</success_criteria>

<output>
After completion, create `.planning/quick/005-see-requirements-opencode-stuck-detectio/005-SUMMARY.md`
</output>
