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

import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import path from 'node:path';
import { accessSync, constants } from 'node:fs';
import type { SessionInfo, SessionMessage } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IsStuckResult {
  stuck: boolean;
  reason: 'not_stuck' | 'waiting_for_user_input' | 'long_running_command' | 'child_stuck';
  detail: string;
}

// ── Module-level cached DB connection ──────────────────────────────────────

let cachedDb: Database.Database | null = null;
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
function openDb(): Database.Database | null {
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
      'SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created ASC',
    ).all(sessionId) as Array<{ id: string; data: string }>;

    const messages = rows.map((row) => {
      try {
        return JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        return { role: 'unknown', content: '' };
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

// ── v2 extended queries ────────────────────────────────────────────────────

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
    const sql = since !== undefined
      ? 'SELECT id, data, time_created FROM message WHERE session_id = ? AND time_created > ? ORDER BY time_created ASC'
      : 'SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created ASC';

    const params = since !== undefined ? [sessionId, since] : [sessionId];
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      data: string;
      time_created: number;
    }>;

    return rows.map((row) => {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        return {
          id: row.id,
          role: typeof parsed.role === 'string' ? parsed.role : 'unknown',
          content: typeof parsed.content === 'string' ? parsed.content : '',
          createdAt: row.time_created,
        };
      } catch {
        return {
          id: row.id,
          role: 'unknown',
          content: '',
          createdAt: row.time_created,
        };
      }
    });
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
      'SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT 1',
    ).get(sessionId) as { id: string; data: string; time_created: number } | undefined;

    if (!row) {
      return null;
    }

    try {
      const parsed = JSON.parse(row.data) as Record<string, unknown>;
      return {
        id: row.id,
        role: typeof parsed.role === 'string' ? parsed.role : 'unknown',
        content: typeof parsed.content === 'string' ? parsed.content : '',
        createdAt: row.time_created,
      };
    } catch {
      return {
        id: row.id,
        role: 'unknown',
        content: '',
        createdAt: row.time_created,
      };
    }
  } catch {
    return null;
  }
}

/**
 * Check if a session has any actively running parts.
 * Replaces PID tracking — if opencode shows running parts, the session is alive.
 *
 * Queries the part table's data JSON for state.status = 'running'.
 */
function isSessionActive(sessionId: string): boolean {
  const db = openDb();
  if (db === null) {
    return false;
  }

  try {
    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM part
       WHERE session_id = ?
         AND json_extract(data, '$.state.status') = 'running'`,
    ).get(sessionId) as { cnt: number } | undefined;

    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
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
    // Query last part for this session
    const lastPart = db.prepare(`
      SELECT json_extract(p.data, '$.tool') as tool,
             json_extract(p.data, '$.state.status') as status,
             p.time_updated
      FROM part p
      WHERE p.session_id = ?
      ORDER BY p.time_created DESC
      LIMIT 1
    `).get(sessionId) as { tool: string | null; status: string | null; time_updated: number } | undefined;

    // Case 6: No parts → not stuck
    if (!lastPart) {
      return NOT_STUCK;
    }

    const { tool, status, time_updated } = lastPart;

    // Case 5: completed/error → not stuck
    if (status === 'completed' || status === 'error') {
      return NOT_STUCK;
    }

    // Only check running/pending parts for stuck
    if (status !== 'running') {
      return NOT_STUCK;
    }

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
function _setTestDb(db: Database.Database | null): void {
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
  getSessionMessages,
  getLastMessage,
  isSessionActive,
  getSessionTokens,
  getRecentSessions,
  isStuck,
  _resetDbCache,
  _setTestDb,
};
