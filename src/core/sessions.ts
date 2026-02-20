/**
 * Session list/export wrappers with fuzzy matching.
 *
 * Wraps the claude CLI to list, search, and export sessions.
 * Provides caching for message counts to avoid repeated CLI calls.
 *
 * Pure core module — no UI dependencies.
 */

import { execa } from 'execa';
import type { SessionInfo } from './types.js';

// ── Cache for session message counts ──────────────────────────────────────

interface CacheEntry {
  count: number;
  fetchedAt: number;
}

const messageCountCache = new Map<string, CacheEntry>();

/** Cache TTL in milliseconds (60 seconds). */
const CACHE_TTL_MS = 60_000;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * List all sessions by calling `claude session list --format json`.
 *
 * Returns parsed SessionInfo[]. On any error (binary not found, parse failure,
 * etc.) returns an empty array rather than throwing.
 */
async function listSessions(): Promise<SessionInfo[]> {
  try {
    const result = await execa('claude', ['session', 'list', '--format', 'json']);
    const parsed: unknown = JSON.parse(result.stdout);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(toSessionInfo).filter(isNonNull);
  } catch {
    return [];
  }
}

/**
 * Find a session by query string using 3-step fuzzy matching:
 *
 *   1. Exact title match (case-sensitive)
 *   2. Title contains query (case-insensitive) — pick most recently updated
 *   3. No match → null
 */
async function findSession(query: string): Promise<SessionInfo | null> {
  const sessions = await listSessions();

  if (sessions.length === 0) {
    return null;
  }

  // Step 1: Exact title match (case-sensitive)
  const exact = sessions.find((s) => s.title === query);
  if (exact) {
    return exact;
  }

  // Step 2: Contains match (case-insensitive), most recent wins
  const lowerQuery = query.toLowerCase();
  const matches = sessions.filter((s) =>
    s.title.toLowerCase().includes(lowerQuery),
  );

  if (matches.length === 0) {
    return null;
  }

  // Sort descending by updated timestamp, pick first (most recent)
  matches.sort((a, b) => b.updated - a.updated);
  return matches[0];
}

/**
 * Export a session's full data by calling `claude export <sessionId>`.
 *
 * Returns the parsed JSON object (typed as `unknown` — callers narrow).
 * Throws a descriptive error on failure.
 */
async function exportSession(sessionId: string): Promise<unknown> {
  try {
    const result = await execa('claude', ['export', sessionId]);
    return JSON.parse(result.stdout) as unknown;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to export session: ${sessionId}: ${message}`);
  }
}

/**
 * Get the message count for a session title, with 60-second caching.
 *
 * Returns null if the session cannot be found or exported.
 */
async function getSessionMessageCount(
  session: string,
): Promise<number | null> {
  // Check cache
  const cached = messageCountCache.get(session);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.count;
  }

  // Find the session
  const found = await findSession(session);
  if (!found) {
    return null;
  }

  try {
    const exported = await exportSession(found.id);
    const count = extractMessageCount(exported);
    if (count !== null) {
      messageCountCache.set(session, { count, fetchedAt: Date.now() });
    }
    return count;
  } catch {
    return null;
  }
}

/**
 * Clear the message count cache. Useful for testing.
 */
function clearSessionCache(): void {
  messageCountCache.clear();
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Safely convert an unknown raw session object to SessionInfo.
 * Returns null if required fields are missing or wrong type.
 */
function toSessionInfo(raw: unknown): SessionInfo | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.id !== 'string' ||
    typeof obj.title !== 'string' ||
    typeof obj.updated !== 'number' ||
    typeof obj.created !== 'number' ||
    typeof obj.message_count !== 'number'
  ) {
    return null;
  }

  return {
    id: obj.id,
    title: obj.title,
    updated: obj.updated,
    created: obj.created,
    message_count: obj.message_count,
  };
}

/**
 * Extract message count from an exported session object.
 */
function extractMessageCount(exported: unknown): number | null {
  if (exported === null || typeof exported !== 'object') {
    return null;
  }

  const obj = exported as Record<string, unknown>;
  if (Array.isArray(obj.messages)) {
    return obj.messages.length;
  }

  return null;
}

/**
 * Type guard to filter null values from arrays.
 */
function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

export {
  listSessions,
  findSession,
  exportSession,
  getSessionMessageCount,
  clearSessionCache,
};
