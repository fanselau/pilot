/**
 * Direct SQLite access to opencode's database for session queries and stuck detection.
 *
 * Replaces CLI-based session queries (`opencode session list`, `opencode export`)
 * with direct DB reads. Also provides `isStuck()` which uses the `part` table
 * to detect waiting-for-user-input, child-stuck, and long-running-command states.
 *
 * DB path: $XDG_DATA_HOME/opencode/opencode.db or ~/.local/share/opencode/opencode.db
 * Opened read-only, WAL mode safe for concurrent reads while opencode writes.
 *
 * Pure core module — no UI dependencies.
 */

import Database from './sqlite.js';
import type { Database as DatabaseType } from './sqlite.js';
import { homedir } from 'node:os';
import path from 'node:path';
import { accessSync, constants } from 'node:fs';
import type { SessionInfo, SessionMessage, SessionPart } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IsStuckResult {
  stuck: boolean;
  reason: 'not_stuck' | 'waiting_for_user_input' | 'long_running_command' | 'child_stuck';
  detail: string;
}

// ── Module-level cached DB connection ──────────────────────────────────────

let cachedDb: DatabaseType | null = null;
let dbOpenAttempted = false;

/**
 * Resolve the opencode DB path.
 * Uses $XDG_DATA_HOME/opencode/opencode.db or ~/.local/share/opencode/opencode.db.
 */
function resolveDbPath(): string {
  const xdgData = process.env['XDG_DATA_HOME'] || path.join(homedir(), '.local', 'share');
  return path.join(xdgData, 'opencode', 'opencode.db');
}

/**
 * Open the opencode SQLite database (read-only).
 * Returns a Database instance or null if DB doesn't exist or is unreadable.
 * Caches the connection at module level for reuse.
 */
function openDb(): DatabaseType | null {
  if (cachedDb !== null) {
    return cachedDb;
  }

  if (dbOpenAttempted) {
    return null;
  }

  dbOpenAttempted = true;

  const dbPath = resolveDbPath();

  try {
    accessSync(dbPath, constants.R_OK);
  } catch {
    process.stderr.write(`Warning: opencode DB not found at ${dbPath}\n`);
    return null;
  }

  try {
    cachedDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    return cachedDb;
  } catch (err) {
    process.stderr.write(`Warning: Failed to open opencode DB: ${String(err)}\n`);
    return null;
  }
}

// ── Session queries ────────────────────────────────────────────────────────

/**
 * List all sessions from the DB, ordered by time_updated DESC.
 * Returns SessionInfo[] matching the existing interface.
 */
function listSessionsFromDb(): SessionInfo[] {
  const db = openDb();
  if (db === null) {
    return [];
  }

  try {
    const rows = db.prepare(
      'SELECT id, title, time_created, time_updated, parent_id, directory FROM session ORDER BY time_updated DESC',
    ).all() as Array<{
      id: string;
      title: string;
      time_created: number;
      time_updated: number;
      parent_id: string | null;
      directory: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      created: row.time_created,   // already epoch ms
      updated: row.time_updated,   // already epoch ms
    }));
  } catch {
    return [];
  }
}

/**
 * Find a session by query string using 2-step matching:
 *   1. Exact title match (case-sensitive)
 *   2. LIKE '%query%' (case-insensitive), most recently created, LIMIT 1
 *
 * Returns SessionInfo or null.
 */
function findSessionFromDb(query: string): SessionInfo | null {
  const db = openDb();
  if (db === null) {
    return null;
  }

  try {
    // Step 1: Exact title match
    const exact = db.prepare(
      'SELECT id, title, time_created, time_updated FROM session WHERE title = ? ORDER BY time_created DESC LIMIT 1',
    ).get(query) as { id: string; title: string; time_created: number; time_updated: number } | undefined;

    if (exact) {
      return {
        id: exact.id,
        title: exact.title,
        created: exact.time_created,
        updated: exact.time_updated,
      };
    }

    // Step 2: LIKE contains match (case-insensitive), most recently updated
    const like = db.prepare(
      'SELECT id, title, time_created, time_updated FROM session WHERE title LIKE ? ORDER BY time_updated DESC LIMIT 1',
    ).get(`%${query}%`) as { id: string; title: string; time_created: number; time_updated: number } | undefined;

    if (like) {
      return {
        id: like.id,
        title: like.title,
        created: like.time_created,
        updated: like.time_updated,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Export a session's messages from the DB.
 * Reconstructs the format expected by log.ts: { messages: [...] }
 *
 * Each message's `data` column is JSON with role, content, etc.
 * We parse and return the whole structure.
 */
function exportSessionFromDb(sessionId: string): unknown {
  const db = openDb();
  if (db === null) {
    throw new Error(`Failed to export session: ${sessionId}: DB not available`);
  }

  try {
    const rows = db.prepare(
      `SELECT m.id, m.data,
        (SELECT GROUP_CONCAT(json_extract(p.data, '$.text'), char(10))
         FROM part p
         WHERE p.message_id = m.id
           AND json_extract(p.data, '$.type') = 'text'
         ORDER BY p.time_created ASC
        ) as text_content
      FROM message m
      WHERE m.session_id = ?
      ORDER BY m.time_created ASC`,
    ).all(sessionId) as Array<{ id: string; data: string; text_content: string | null }>;

    const messages = rows.map((row) => {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        parsed.content = row.text_content ?? '';
        return parsed;
      } catch {
        return { role: 'unknown', content: row.text_content ?? '' };
      }
    });

    return { messages };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to export session: ${sessionId}: ${message}`);
  }
}

/**
 * Get message count for a session by ID.
 * DB queries are <1ms — no caching needed.
 */
function getSessionMessageCountFromDb(sessionId: string): number {
  const db = openDb();
  if (db === null) {
    return 0;
  }

  try {
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM message WHERE session_id = ?',
    ).get(sessionId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Find session ID by title (exact match).
 * Used by the runner to find DB session IDs for PID-tracked sessions.
 */
function findSessionByTitle(title: string): string | null {
  const db = openDb();
  if (db === null) {
    return null;
  }

  try {
    const row = db.prepare(
      'SELECT id FROM session WHERE title = ? ORDER BY time_created DESC LIMIT 1',
    ).get(title) as { id: string } | undefined;

    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Get child sessions spawned by a parent session (via `task` tool).
 * Queries the `parent_id` column linking child → parent.
 * Returns array ordered by creation time (oldest first).
 */
function getChildSessions(parentSessionId: string): Array<{ id: string; title: string; timeCreated: number; timeUpdated: number }> {
  const db = openDb();
  if (db === null) return [];

  try {
    const rows = db.prepare(
      'SELECT id, title, time_created, time_updated FROM session WHERE parent_id = ? ORDER BY time_created ASC',
    ).all(parentSessionId) as Array<{ id: string; title: string; time_created: number; time_updated: number }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    }));
  } catch {
    return [];
  }
}

// ── v2 extended queries ────────────────────────────────────────────────────

/**
 * Parse a message row into a SessionMessage.
 * Extracts role from the JSON data column and content from the part-table subquery.
 * The `text_content` column comes from a subquery that concatenates all text parts.
 */
function parseMessageRow(row: { id: string; data: string; time_created: number; text_content?: string | null }): SessionMessage {
  try {
    const parsed = JSON.parse(row.data) as Record<string, unknown>;
    return {
      id: row.id,
      role: typeof parsed.role === 'string' ? parsed.role : 'unknown',
      content: row.text_content ?? '',
      createdAt: row.time_created,
    };
  } catch {
    return {
      id: row.id,
      role: 'unknown',
      content: row.text_content ?? '',
      createdAt: row.time_created,
    };
  }
}

/**
 * Get messages for a session, optionally filtered by time.
 * Returns SessionMessage[] ordered by time_created ASC (chronological).
 *
 * Parses the `data` JSON column for role and content.
 * Content may be absent in opencode's schema — defaults to empty string.
 *
 * @param sessionId - The opencode session ID
 * @param since - Optional epoch ms timestamp; only messages after this time returned
 */
function getSessionMessages(sessionId: string, since?: number): SessionMessage[] {
  const db = openDb();
  if (db === null) {
    return [];
  }

  try {
    const baseSql = `SELECT m.id, m.data, m.time_created,
      (SELECT GROUP_CONCAT(json_extract(p.data, '$.text'), char(10))
       FROM part p
       WHERE p.message_id = m.id
         AND json_extract(p.data, '$.type') = 'text'
       ORDER BY p.time_created ASC
      ) as text_content
    FROM message m
    WHERE m.session_id = ?`;

    const sql = since !== undefined
      ? `${baseSql} AND m.time_created > ? ORDER BY m.time_created ASC`
      : `${baseSql} ORDER BY m.time_created ASC`;

    const params = since !== undefined ? [sessionId, since] : [sessionId];
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      data: string;
      time_created: number;
      text_content: string | null;
    }>;

    return rows.map(parseMessageRow);
  } catch {
    return [];
  }
}

// ── Part-level queries ─────────────────────────────────────────────────────

/**
 * Truncate a string to a maximum length, appending "…" if truncated.
 */
function truncateStr(s: string | null | undefined, maxLen: number): string | undefined {
  if (s == null) return undefined;
  const str = String(s);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/**
 * Extract tool input summary from part data based on tool type.
 */
function extractToolInput(tool: string, stateInput: unknown): string | undefined {
  if (stateInput == null) return undefined;

  // task tool: extract description + subagent_type for clean display
  if (tool === 'task') {
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      const subagentType = typeof inp.subagent_type === 'string' ? inp.subagent_type : 'subagent';
      if (typeof inp.description === 'string') {
        return `▶ task: ${subagentType} — "${inp.description}"`;
      }
    }
    // Fallback: truncate full JSON if description missing
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 100);
  }

  if (tool === 'bash') {
    // bash input has { command, description }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.command === 'string') {
        return truncateStr(inp.command, 200);
      }
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 200);
  }

  if (tool === 'read' || tool === 'write' || tool === 'edit') {
    // These tools have { filePath } or { path } in input
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      const filePath = inp.filePath ?? inp.path;
      if (typeof filePath === 'string') return filePath;
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 200);
  }

  // Default: truncate stringified input
  return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 200);
}

/**
 * Extract tool output summary from part data based on tool type.
 */
function extractToolOutput(tool: string, stateOutput: unknown): string | undefined {
  if (stateOutput == null) return undefined;

  const outputStr = typeof stateOutput === 'string' ? stateOutput : JSON.stringify(stateOutput);

  if (tool === 'bash') {
    // First 2 lines of output
    const lines = outputStr.split('\n');
    const firstTwo = lines.slice(0, 2).join('\n');
    return truncateStr(firstTwo, 200);
  }

  return truncateStr(outputStr, 100);
}

/**
 * Parse a raw part row into a SessionPart.
 */
function parsePartRow(
  row: { id: string; message_id: string; data: string; time_created: number; message_data: string },
): SessionPart {
  let partData: Record<string, unknown> = {};
  let msgData: Record<string, unknown> = {};

  try { partData = JSON.parse(row.data) as Record<string, unknown>; } catch { /* empty */ }
  try { msgData = JSON.parse(row.message_data) as Record<string, unknown>; } catch { /* empty */ }

  const type = typeof partData.type === 'string' ? partData.type : 'unknown';
  const role = typeof msgData.role === 'string' ? msgData.role : 'unknown';

  const base: SessionPart = {
    id: row.id,
    messageId: row.message_id,
    role,
    type,
    createdAt: row.time_created,
  };

  if (type === 'tool') {
    const tool = typeof partData.tool === 'string' ? partData.tool : undefined;
    const state = (typeof partData.state === 'object' && partData.state !== null)
      ? partData.state as Record<string, unknown>
      : undefined;

    base.tool = tool;
    base.toolStatus = state && typeof state.status === 'string' ? state.status : undefined;
    if (tool && state) {
      base.toolInput = extractToolInput(tool, state.input);
      base.toolOutput = extractToolOutput(tool, state.output);
    }
    return base;
  }

  if (type === 'text' || type === 'reasoning') {
    base.text = typeof partData.text === 'string' ? partData.text : undefined;
    return base;
  }

  if (type === 'patch') {
    const files: string[] = [];

    // Try `partData.files` first (flat string array — actual DB schema)
    if (Array.isArray(partData.files)) {
      for (const f of partData.files) {
        if (typeof f === 'string') {
          files.push(f);
        }
      }
    }

    // Fall back to `partData.operations[].path` for backward compatibility
    if (files.length === 0 && Array.isArray(partData.operations)) {
      for (const op of partData.operations) {
        if (typeof op === 'object' && op !== null) {
          const opObj = op as Record<string, unknown>;
          if (typeof opObj.path === 'string') {
            files.push(opObj.path);
          }
        }
      }
    }

    if (files.length > 0) {
      base.patchFiles = files;
    }
    return base;
  }

  // step-start, step-finish, or unknown — just return base
  return base;
}

/**
 * Get all parts for a session, optionally filtered by time.
 * Returns SessionPart[] ordered by time_created ASC (chronological).
 *
 * Joins with message table to get role from the parent message.
 *
 * @param sessionId - The opencode session ID
 * @param since - Optional epoch ms timestamp; only parts after this time returned
 */
function getSessionParts(sessionId: string, since?: number): SessionPart[] {
  const db = openDb();
  if (db === null) {
    return [];
  }

  try {
    const baseSql = `SELECT p.id, p.message_id, p.data, p.time_created, m.data as message_data
    FROM part p
    JOIN message m ON p.message_id = m.id
    WHERE p.session_id = ?`;

    const sql = since !== undefined
      ? `${baseSql} AND p.time_created > ? ORDER BY p.time_created ASC`
      : `${baseSql} ORDER BY p.time_created ASC`;

    const params = since !== undefined ? [sessionId, since] : [sessionId];
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      message_id: string;
      data: string;
      time_created: number;
      message_data: string;
    }>;

    return rows.map(parsePartRow);
  } catch {
    return [];
  }
}

/**
 * Get the most recent message for a session.
 * Returns null if session has no messages or doesn't exist.
 */
function getLastMessage(sessionId: string): SessionMessage | null {
  const db = openDb();
  if (db === null) {
    return null;
  }

  try {
    const row = db.prepare(
      `SELECT m.id, m.data, m.time_created,
        (SELECT GROUP_CONCAT(json_extract(p.data, '$.text'), char(10))
         FROM part p
         WHERE p.message_id = m.id
           AND json_extract(p.data, '$.type') = 'text'
         ORDER BY p.time_created ASC
        ) as text_content
      FROM message m
      WHERE m.session_id = ?
      ORDER BY m.time_created DESC LIMIT 1`,
    ).get(sessionId) as { id: string; data: string; time_created: number; text_content: string | null } | undefined;

    if (!row) {
      return null;
    }

    return parseMessageRow(row);
  } catch {
    return null;
  }
}

/**
 * Check if a session has completed by querying the most recent `step-finish` part.
 *
 * Uses `step-finish` reason as the ground truth for session completion:
 *   - reason = 'stop'       → session is done ✅
 *   - reason = 'tool-calls' → still working (between steps) → NOT done
 *   - reason = 'length'     → hit token limit, treat as done (logs warning)
 *   - No rows               → just started, still working → NOT done
 *
 * This replaces the broken `isSessionActive()` which checked for running tool
 * parts — between tool calls, no parts are "running", causing premature completion
 * detection. Using step-finish reason is the ground truth approach.
 */
function isSessionDone(sessionId: string): boolean {
  const db = openDb();
  if (db === null) {
    return false;
  }

  try {
    const row = db.prepare(
      `SELECT json_extract(data, '$.reason') as reason
       FROM part
       WHERE session_id = ?
         AND json_extract(data, '$.type') = 'step-finish'
       ORDER BY time_created DESC
       LIMIT 1`,
    ).get(sessionId) as { reason: string | null } | undefined;

    if (!row) {
      // No step-finish parts — session just started or still working
      return false;
    }

    const reason = row.reason;

    if (reason === 'stop') {
      return true;
    }

    if (reason === 'length') {
      // Hit token limit — treat as done but warn
      process.stderr.write(`[opencode-db] Warning: session ${sessionId} ended with reason='length' (token limit hit)\n`);
      return true;
    }

    // reason = 'tool-calls' or unknown → still working
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a session has any actively running parts.
 * Replaces PID tracking — if opencode shows running parts, the session is alive.
 *
 * Queries the part table's data JSON for state.status = 'running'.
 *
 * @deprecated Use isSessionDone() instead. This function returns false between
 * tool calls (when no parts are "running"), causing premature completion detection.
 * isSessionDone() uses step-finish reason as ground truth and is more reliable.
 */
function isSessionActive(sessionId: string): boolean {
  return !isSessionDone(sessionId);
}

/**
 * Aggregate token usage for a session from assistant messages.
 * Reads the `tokens.input` and `tokens.output` fields from message data JSON.
 * Returns { input: 0, output: 0 } if no tokens found or DB unavailable.
 */
function getSessionTokens(sessionId: string): { input: number; output: number } {
  const ZERO = { input: 0, output: 0 };
  const db = openDb();
  if (db === null) {
    return ZERO;
  }

  try {
    const row = db.prepare(
      `SELECT
         COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as total_input,
         COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as total_output
       FROM message
       WHERE session_id = ?
         AND json_extract(data, '$.role') = 'assistant'`,
    ).get(sessionId) as { total_input: number; total_output: number } | undefined;

    if (!row) {
      return ZERO;
    }

    return {
      input: row.total_input ?? 0,
      output: row.total_output ?? 0,
    };
  } catch {
    return ZERO;
  }
}

/**
 * Get the most recent N sessions with message counts.
 * Returns SessionInfo[] with messageCount populated.
 * Ordered by time_updated DESC.
 */
function getRecentSessions(limit: number): SessionInfo[] {
  const db = openDb();
  if (db === null) {
    return [];
  }

  try {
    const rows = db.prepare(
      `SELECT
         s.id, s.title, s.time_created, s.time_updated,
         (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) as msg_count
       FROM session s
       ORDER BY s.time_updated DESC
       LIMIT ?`,
    ).all(limit) as Array<{
      id: string;
      title: string;
      time_created: number;
      time_updated: number;
      msg_count: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      created: row.time_created,
      updated: row.time_updated,
      messageCount: row.msg_count,
    }));
  } catch {
    return [];
  }
}

// ── Stuck detection via part table ─────────────────────────────────────────

/**
 * Determine if a session is stuck by examining the `part` table.
 *
 * Decision tree:
 *   1. question + running → STUCK (waiting for user input, stdin is /dev/null)
 *   2. task + running → Check child session recursively
 *   3. bash + running → Check duration (> stuckThreshold → stuck)
 *   4. Any other tool + running → Same threshold check as bash
 *   5. completed/error status → Not stuck
 *   6. No parts → Not stuck (hasn't started)
 *
 * @param sessionId - The opencode session ID
 * @param stuckThresholdMinutes - Threshold for long-running commands (default 30)
 * @param depth - Recursion depth limit to prevent infinite loops
 */
function isStuck(
  sessionId: string,
  stuckThresholdMinutes: number = 30,
  depth: number = 0,
): IsStuckResult {
  const NOT_STUCK: IsStuckResult = { stuck: false, reason: 'not_stuck', detail: 'Session is healthy' };

  // Prevent infinite recursion (max 10 levels)
  if (depth > 10) {
    return NOT_STUCK;
  }

  const db = openDb();
  if (db === null) {
    return NOT_STUCK;
  }

  try {
    // Query for ANY running part in this session (not just the last one)
    // The old code only checked the last part — if the last part was 'text' or 'step-start',
    // a running tool part earlier in the session would be missed.
    const runningPart = db.prepare(`
      SELECT json_extract(p.data, '$.tool') as tool,
             json_extract(p.data, '$.state.status') as status,
             p.time_updated
      FROM part p
      WHERE p.session_id = ?
        AND json_extract(p.data, '$.state.status') = 'running'
      ORDER BY p.time_created DESC
      LIMIT 1
    `).get(sessionId) as { tool: string | null; status: string | null; time_updated: number } | undefined;

    if (runningPart) {
      const { tool, time_updated } = runningPart;

      // Case 1: question + running → immediately stuck
      if (tool === 'question') {
        return {
          stuck: true,
          reason: 'waiting_for_user_input',
          detail: 'Session waiting for user input (stdin is /dev/null)',
        };
      }

      // Case 2: task + running → check child session recursively
      if (tool === 'task') {
        const child = db.prepare(
          'SELECT id FROM session WHERE parent_id = ? ORDER BY time_created DESC LIMIT 1',
        ).get(sessionId) as { id: string } | undefined;

        if (child) {
          const childResult = isStuck(child.id, stuckThresholdMinutes, depth + 1);
          if (childResult.stuck) {
            return {
              stuck: true,
              reason: 'child_stuck',
              detail: `Child session stuck: ${childResult.detail}`,
            };
          }
        }
        // Child not stuck (or no child found) → parent not stuck
        return NOT_STUCK;
      }

      // Case 3 & 4: bash or other tool + running → check duration
      const now = Date.now();
      const elapsedMs = now - time_updated;
      const thresholdMs = stuckThresholdMinutes * 60 * 1000;

      if (elapsedMs > thresholdMs) {
        return {
          stuck: true,
          reason: 'long_running_command',
          detail: `${tool ?? 'unknown'} running for ${Math.round(elapsedMs / 60000)}m (threshold: ${stuckThresholdMinutes}m)`,
        };
      }

      return NOT_STUCK;
    }

    // No running parts found — check for stale pending parts (killed-session indicator)
    // Pending parts with stale timestamps (>120s since time_updated) suggest a killed session
    const stalePendingPart = db.prepare(`
      SELECT json_extract(p.data, '$.tool') as tool,
             p.time_updated
      FROM part p
      WHERE p.session_id = ?
        AND json_extract(p.data, '$.state.status') = 'pending'
      ORDER BY p.time_created DESC
      LIMIT 1
    `).get(sessionId) as { tool: string | null; time_updated: number } | undefined;

    if (stalePendingPart) {
      const stalePendingAgeMs = Date.now() - stalePendingPart.time_updated;
      if (stalePendingAgeMs > 120_000) {
        // Pending part stale for >120s — likely a killed session
        return NOT_STUCK; // Not "stuck" per se, but session is likely dead — isSessionDone handles this
      }
    }

    // Case 6: No running parts → not stuck
    return NOT_STUCK;
  } catch {
    // DB error — fail safe, not stuck
    return NOT_STUCK;
  }
}

// ── Test helpers ───────────────────────────────────────────────────────────

/**
 * Reset the module-level cached DB connection.
 * Used by tests to inject an in-memory DB.
 */
function _resetDbCache(): void {
  if (cachedDb !== null) {
    try { cachedDb.close(); } catch { /* ignore */ }
  }
  cachedDb = null;
  dbOpenAttempted = false;
}

/**
 * Inject a DB instance for testing.
 * @internal — only for use in tests
 */
function _setTestDb(db: DatabaseType | null): void {
  cachedDb = db;
  dbOpenAttempted = true;
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
  openDb,
  listSessionsFromDb,
  findSessionFromDb,
  exportSessionFromDb,
  getSessionMessageCountFromDb,
  findSessionByTitle,
  getChildSessions,
  getSessionMessages,
  getSessionParts,
  getLastMessage,
  isSessionDone,
  isSessionActive,
  getSessionTokens,
  getRecentSessions,
  isStuck,
  _resetDbCache,
  _setTestDb,
};
