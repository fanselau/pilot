/**
 * Direct SQLite access to opencode's database for session queries and stuck detection.
 *
 * Replaces CLI-based session queries (`opencode session list`, `opencode export`)
 * with direct DB reads.
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
import { errMsg } from '../util/errors.js';
import { truncateNullable } from '../util/format.js';
import type { SessionInfo, SessionMessage, SessionPart } from './types.js';

// ── Module-level cached DB connection ──────────────────────────────────────

let cachedDb: DatabaseType | null = null;
let testDbInjected = false;  // Set by _setTestDb to prevent re-open in tests

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

  // Skip re-open if test DB was injected
  if (testDbInjected) {
    return null;
  }

  const dbPath = resolveDbPath();

  try {
    accessSync(dbPath, constants.R_OK);
  } catch {
    // DB doesn't exist yet — don't cache failure, it may appear later
    // (e.g., daemon starts before first opencode session)
    return null;
  }

  try {
    cachedDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    return cachedDb;
  } catch (err) {
    const msg = errMsg(err);
    // If DB is corrupt or has I/O errors, don't cache the failure — retry next time
    if (msg.includes('SQLITE_CORRUPT') || msg.includes('SQLITE_IOERR')) {
      process.stderr.write(`Warning: opencode DB corrupt/IO error, will retry: ${msg}\n`);
      cachedDb = null;
    } else {
      process.stderr.write(`Warning: Failed to open opencode DB: ${msg}\n`);
    }
    return null;
  }
}

/**
 * Check if an error indicates DB corruption and reset the cached connection.
 * Called from catch blocks in query functions so the next call retries.
 */
function handleDbError(err: unknown): void {
  const msg = errMsg(err);
  if (msg.includes('SQLITE_CORRUPT') || msg.includes('SQLITE_IOERR') || msg.includes('database disk image is malformed')) {
    process.stderr.write(`[opencode-db] DB corruption detected, resetting connection: ${msg}\n`);
    try { cachedDb?.close(); } catch { /* ignore */ }
    cachedDb = null;
  }
}

// ── Session queries ────────────────────────────────────────────────────────

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
    handleDbError(err);
    const message = errMsg(err);
    throw new Error(`Failed to export session: ${sessionId}: ${message}`);
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
  } catch (err) {
    handleDbError(err);
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

// truncateStr replaced by truncateNullable from util/format.ts
const truncateStr = truncateNullable;

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

  if (tool === 'glob') {
    // glob input has { pattern, path? }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.pattern === 'string') return inp.pattern;
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 100);
  }

  if (tool === 'grep') {
    // grep input has { pattern, include?, path? }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.pattern === 'string') return inp.pattern;
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 100);
  }

  if (tool === 'list_directory') {
    // list_directory input has { path } or { dirPath }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.path === 'string') return inp.path;
      if (typeof inp.dirPath === 'string') return inp.dirPath;
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 100);
  }

  if (tool === 'search') {
    // search input has { query } or { pattern }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.query === 'string') return inp.query;
      if (typeof inp.pattern === 'string') return inp.pattern;
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 100);
  }

  if (tool === 'computer_use') {
    // computer_use input has { action }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.action === 'string') return inp.action;
    }
    return 'computer_use';
  }

  if (tool === 'text_editor') {
    // text_editor input has { command, path? }
    if (typeof stateInput === 'object' && stateInput !== null) {
      const inp = stateInput as Record<string, unknown>;
      if (typeof inp.command === 'string') return inp.command;
      if (typeof inp.path === 'string') return inp.path;
    }
    return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 100);
  }

  // MCP tools (prefixed with mcp_*): show compact JSON summary
  if (tool.startsWith('mcp_')) {
    // MCP tool: compact truncated JSON, 100 chars is enough for identification
    return truncateStr(JSON.stringify(stateInput), 100);
  }

  // Default: truly unknown tools — compact JSON (reduced from 200 to 80 chars)
  return truncateStr(typeof stateInput === 'string' ? stateInput : JSON.stringify(stateInput), 80);
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
 * Count assistant messages in a session.
 * Returns 0 if the DB is unavailable, the session doesn't exist, or on error.
 *
 * Lightweight count query — much cheaper than getSessionMessages which joins
 * with the parts table and parses content. Used as a pre-judge activity check:
 * if the count is 0, the session likely crashed or exited immediately.
 */
function getAssistantMessageCount(sessionId: string): number {
  const db = openDb();
  if (db === null) {
    return 0;
  }

  try {
    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM message WHERE session_id = ? AND json_extract(data, '$.role') = 'assistant'`,
    ).get(sessionId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  } catch (err) {
    handleDbError(err);
    return 0;
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
 * Uses step-finish reason as the authoritative completion signal — avoids false
 * negatives from the previous approach of checking for running tool parts,
 * which reported "not active" between tool calls.
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
  } catch (err) {
    handleDbError(err);
    return false;
  }
}

/**
 * Aggregate token usage for a session from assistant messages.
 * Reads input, output, reasoning, cache_read, and cache_write token fields from message data JSON.
 * Returns zeroed struct if no tokens found or DB unavailable.
 */
function getSessionTokens(sessionId: string): { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number } {
  const ZERO = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
  const db = openDb();
  if (db === null) {
    return ZERO;
  }

  try {
    const row = db.prepare(
      `SELECT
         COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as total_input,
         COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as total_output,
         COALESCE(SUM(json_extract(data, '$.tokens.reasoning')), 0) as total_reasoning,
         COALESCE(SUM(json_extract(data, '$.tokens.cache_read')), 0) as total_cache_read,
         COALESCE(SUM(json_extract(data, '$.tokens.cache_write')), 0) as total_cache_write
       FROM message
       WHERE session_id = ?
         AND json_extract(data, '$.role') = 'assistant'`,
    ).get(sessionId) as {
      total_input: number;
      total_output: number;
      total_reasoning: number;
      total_cache_read: number;
      total_cache_write: number;
    } | undefined;

    if (!row) {
      return ZERO;
    }

    return {
      input: row.total_input ?? 0,
      output: row.total_output ?? 0,
      reasoning: row.total_reasoning ?? 0,
      cacheRead: row.total_cache_read ?? 0,
      cacheWrite: row.total_cache_write ?? 0,
    };
  } catch {
    return ZERO;
  }
}

function toSafeTokenCount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  return 0;
}

type TokenUsageBuckets = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

type SessionTokenUsageByModel = Record<string, TokenUsageBuckets>;

function createZeroBuckets(): TokenUsageBuckets {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
}

/**
 * Aggregate token usage for one session grouped by provider/model.
 * Returns an object keyed by "provider/model".
 */
function getSessionTokenUsageByModel(sessionId: string): SessionTokenUsageByModel {
  const db = openDb();
  if (db === null) {
    return {};
  }

  try {
    const rows = db.prepare(
      `SELECT
         json_extract(data, '$.providerID') as provider_id,
         json_extract(data, '$.modelID') as model_id,
         COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as total_input,
         COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as total_output,
         COALESCE(SUM(json_extract(data, '$.tokens.reasoning')), 0) as total_reasoning,
         COALESCE(SUM(json_extract(data, '$.tokens.cache_read')), 0) as total_cache_read,
         COALESCE(SUM(json_extract(data, '$.tokens.cache_write')), 0) as total_cache_write
       FROM message
       WHERE session_id = ?
         AND json_extract(data, '$.role') = 'assistant'
       GROUP BY provider_id, model_id`,
    ).all(sessionId) as Array<{
      provider_id: unknown;
      model_id: unknown;
      total_input: unknown;
      total_output: unknown;
      total_reasoning: unknown;
      total_cache_read: unknown;
      total_cache_write: unknown;
    }>;

    const usage: SessionTokenUsageByModel = {};
    for (const row of rows) {
      const model = normalizeModelKey(row.provider_id, row.model_id);
      if (!model) {
        continue;
      }

      usage[model] = {
        input: toSafeTokenCount(row.total_input),
        output: toSafeTokenCount(row.total_output),
        reasoning: toSafeTokenCount(row.total_reasoning),
        cacheRead: toSafeTokenCount(row.total_cache_read),
        cacheWrite: toSafeTokenCount(row.total_cache_write),
      };
    }

    return usage;
  } catch {
    return {};
  }
}

/**
 * Aggregate token usage grouped by provider/model for a session tree.
 * Traverses child sessions recursively and merges per-model buckets.
 */
function getSessionTokenUsageByModelRecursive(
  sessionId: string,
  depth: number = 0,
  visited: Set<string> = new Set(),
): SessionTokenUsageByModel {
  if (depth > MAX_SESSION_TREE_DEPTH || visited.has(sessionId)) {
    return {};
  }

  visited.add(sessionId);
  const usage: SessionTokenUsageByModel = { ...getSessionTokenUsageByModel(sessionId) };

  for (const child of getChildSessions(sessionId)) {
    const childUsage = getSessionTokenUsageByModelRecursive(child.id, depth + 1, visited);
    for (const [model, bucket] of Object.entries(childUsage)) {
      const current = usage[model] ?? createZeroBuckets();
      usage[model] = {
        input: current.input + bucket.input,
        output: current.output + bucket.output,
        reasoning: current.reasoning + bucket.reasoning,
        cacheRead: current.cacheRead + bucket.cacheRead,
        cacheWrite: current.cacheWrite + bucket.cacheWrite,
      };
    }
  }

  return usage;
}

/**
 * Aggregate token usage recursively across a session and all its child sessions.
 * Traverses the session tree via getChildSessions() up to max depth 3.
 * Returns summed token fields: { input, output, reasoning, cacheRead, cacheWrite }
 */
function getSessionTokensRecursive(
  sessionId: string,
  depth: number = 0,
  visited: Set<string> = new Set(),
): { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number } {
  const ZERO = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };

  // Depth guard to prevent infinite loops from malformed data
  if (depth > MAX_SESSION_TREE_DEPTH || visited.has(sessionId)) return ZERO;

  visited.add(sessionId);

  // Get root session tokens
  const root = getSessionTokens(sessionId);
  let total = { ...root };

  // Recurse into child sessions
  const children = getChildSessions(sessionId);
  for (const child of children) {
    const childTokens = getSessionTokensRecursive(child.id, depth + 1, visited);
    total = {
      input: total.input + childTokens.input,
      output: total.output + childTokens.output,
      reasoning: total.reasoning + childTokens.reasoning,
      cacheRead: total.cacheRead + childTokens.cacheRead,
      cacheWrite: total.cacheWrite + childTokens.cacheWrite,
    };
  }

  return total;
}

// ── Model queries ──────────────────────────────────────────────────────────

const MAX_SESSION_TREE_DEPTH = 8;

function normalizeModelKey(providerId: unknown, modelId: unknown): string | null {
  if (typeof providerId !== 'string' || typeof modelId !== 'string') {
    return null;
  }

  const provider = providerId.trim();
  const model = modelId.trim();
  if (!provider || !model) {
    return null;
  }

  if (provider.toLowerCase() === 'null' || model.toLowerCase() === 'null') {
    return null;
  }

  return `${provider}/${model}`;
}

/**
 * Get distinct provider/model strings used in one specific session.
 * Session is resolved by ID (not title) for deterministic lookup.
 */
function getSessionModelsById(sessionId: string): string[] {
  const db = openDb();
  if (db === null) {
    return [];
  }

  try {
    const rows = db.prepare(
      `SELECT DISTINCT
         json_extract(data, '$.providerID') as provider_id,
         json_extract(data, '$.modelID') as model_id
       FROM message
       WHERE session_id = ?
         AND json_extract(data, '$.role') = 'assistant'`,
    ).all(sessionId) as Array<{ provider_id: unknown; model_id: unknown }>;

    const models: string[] = [];
    for (const row of rows) {
      const normalized = normalizeModelKey(row.provider_id, row.model_id);
      if (normalized) {
        models.push(normalized);
      }
    }
    return models;
  } catch {
    return [];
  }
}

/**
 * Get distinct provider/model strings used by a session tree.
 * Traverses child sessions via parent_id recursively.
 */
function getSessionModelsRecursive(
  sessionId: string,
  depth: number = 0,
  visited: Set<string> = new Set(),
): string[] {
  if (depth > MAX_SESSION_TREE_DEPTH || visited.has(sessionId)) {
    return [];
  }

  visited.add(sessionId);
  const models = new Set<string>(getSessionModelsById(sessionId));

  for (const child of getChildSessions(sessionId)) {
    for (const model of getSessionModelsRecursive(child.id, depth + 1, visited)) {
      models.add(model);
    }
  }

  return Array.from(models);
}

/**
 * Get distinct provider/model strings used in a session's assistant messages.
 * Reads providerID and modelID from the message data JSON column.
 * Returns an empty array if DB is unavailable or session has no assistant messages.
 *
 * Result format: "providerID/modelID" (e.g. "anthropic/claude-sonnet-4-6")
 * Filters out null entries (messages without modelID set).
 */
function getSessionModels(sessionTitle: string): string[] {
  const sessionId = findSessionByTitle(sessionTitle);
  if (!sessionId) {
    return [];
  }

  return getSessionModelsRecursive(sessionId);
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
  testDbInjected = false;
}

/**
 * Inject a DB instance for testing.
 * @internal — only for use in tests
 */
function _setTestDb(db: DatabaseType | null): void {
  cachedDb = db;
  testDbInjected = true;
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
  openDb,
  exportSessionFromDb,
  findSessionByTitle,
  getChildSessions,
  getSessionMessages,
  getSessionParts,
  getLastMessage,
  getAssistantMessageCount,
  isSessionDone,
  getSessionTokens,
  getSessionTokenUsageByModel,
  getSessionTokenUsageByModelRecursive,
  getSessionTokensRecursive,
  getSessionModelsById,
  getSessionModelsRecursive,
  getSessionModels,
  _resetDbCache,
  _setTestDb,
};
