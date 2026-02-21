/**
 * Session list/export wrappers with fuzzy matching.
 *
 * Delegates to opencode-db.ts for direct SQLite queries against
 * opencode's database. No CLI calls — DB access is <1ms.
 *
 * Pure core module — no UI dependencies.
 */

import {
  listSessionsFromDb,
  findSessionFromDb,
  exportSessionFromDb,
  getSessionMessageCountFromDb,
} from './opencode-db.js';
import type { SessionInfo } from './types.js';

// ── Public API ────────────────────────────────────────────────────────────

/**
 * List all sessions from the opencode SQLite database.
 *
 * Returns parsed SessionInfo[]. On any error (DB not found, etc.)
 * returns an empty array rather than throwing.
 */
async function listSessions(): Promise<SessionInfo[]> {
  return listSessionsFromDb();
}

/**
 * Find a session by query string using 2-step fuzzy matching:
 *
 *   1. Exact title match (case-sensitive)
 *   2. LIKE contains match (case-insensitive) — pick most recently updated
 *   3. No match → null
 */
async function findSession(query: string): Promise<SessionInfo | null> {
  return findSessionFromDb(query);
}

/**
 * Export a session's full data from the SQLite database.
 *
 * Returns the data in { messages: [...] } format compatible with log.ts.
 * Throws a descriptive error on failure.
 */
async function exportSession(sessionId: string): Promise<unknown> {
  return exportSessionFromDb(sessionId);
}

/**
 * Get the message count for a session title.
 *
 * Returns null if the session cannot be found.
 * No caching needed — DB queries are <1ms.
 */
async function getSessionMessageCount(
  session: string,
): Promise<number | null> {
  const found = findSessionFromDb(session);
  if (!found) {
    return null;
  }

  return getSessionMessageCountFromDb(found.id);
}

/**
 * Clear the session cache. No-op now that we use direct DB queries.
 * Kept for backward compatibility with tests.
 */
function clearSessionCache(): void {
  // No-op — DB queries don't need caching
}

export {
  listSessions,
  findSession,
  exportSession,
  getSessionMessageCount,
  clearSessionCache,
};
