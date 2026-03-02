/**
 * TUI data layer: opencode.db wrappers.
 *
 * Thin wrappers over core/opencode-db.ts for TUI consumption.
 * Provides session enrichment (tokens, last messages) and message fetching.
 *
 * All reads are synchronous (better-sqlite3 in read-only mode). Fast (<1ms).
 */

import {
  findSessionByTitle,
  getSessionTokens,
  getLastMessage,
  getSessionMessages,
  getSessionParts,
  isSessionActive,
} from '../../core/opencode-db.js';
import type { SessionMessage, SessionPart, Job } from '../../core/types.js';

// ── Session section types ─────────────────────────────────────────────────

export interface SessionSection {
  title: string;
  type: 'delegation' | 'execution';
  command?: string;       // extracted from execution title
  parts: SessionPart[];
}

// ── Job part fetching ─────────────────────────────────────────────────────

/**
 * Fetch session parts for a job, organized by session section.
 * Categorizes sessions as delegation or execution, fetches parts for each,
 * and returns sections sorted: delegation first, then execution.
 *
 * @param job - The job to fetch parts for
 * @param since - Optional epoch ms; only parts after this time returned
 */
export function fetchJobParts(job: Job, since?: number): SessionSection[] {
  let sessionTitles: string[] = [];
  if (job.sessionTitles) {
    try {
      sessionTitles = JSON.parse(job.sessionTitles) as string[];
    } catch {
      return [];
    }
  }

  if (sessionTitles.length === 0) return [];

  const sections: SessionSection[] = [];

  for (const title of sessionTitles) {
    const isDelegation = title.startsWith('pilot-delegate-');

    let command: string | undefined;
    if (!isDelegation) {
      // Extract command from execution title: "{project}-{command}-{jobId}"
      const titleParts = title.split('-');
      if (titleParts.length >= 3) {
        command = titleParts[titleParts.length - 2];
      }
    }

    const sessionId = findSessionByTitle(title);
    const parts = sessionId ? getSessionParts(sessionId, since) : [];

    sections.push({
      title,
      type: isDelegation ? 'delegation' : 'execution',
      command,
      parts,
    });
  }

  // Sort: delegation first, then execution
  sections.sort((a, b) => {
    if (a.type === 'delegation' && b.type !== 'delegation') return -1;
    if (a.type !== 'delegation' && b.type === 'delegation') return 1;
    return 0;
  });

  return sections;
}

// ── Session enrichment ────────────────────────────────────────────────────

/**
 * Aggregate token usage and last message content for a batch of session titles.
 * Used by the poller to enrich running job data with session info.
 *
 * @param sessionTitles - Array of opencode session titles (from job.sessionTitles JSON)
 * @returns Maps keyed by session title for token usage and last message content
 */
export function fetchSessionEnrichment(sessionTitles: string[]): {
  tokens: Map<string, { input: number; output: number }>;
  lastMsgs: Map<string, string>;
} {
  const tokens = new Map<string, { input: number; output: number }>();
  const lastMsgs = new Map<string, string>();

  for (const title of sessionTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    const tok = getSessionTokens(sessionId);
    tokens.set(title, tok);

    const last = getLastMessage(sessionId);
    if (last) {
      lastMsgs.set(title, last.content);
    }
  }

  return { tokens, lastMsgs };
}

// ── Message fetching ──────────────────────────────────────────────────────

/**
 * Fetch messages for a job's session by title.
 * Used by the detail view log panel.
 *
 * @param sessionTitle - The opencode session title
 * @param since - Optional epoch ms; only messages after this time returned
 */
export function fetchJobMessages(sessionTitle: string, since?: number): SessionMessage[] {
  const sessionId = findSessionByTitle(sessionTitle);
  if (!sessionId) return [];
  return getSessionMessages(sessionId, since);
}

// ── Re-exports ────────────────────────────────────────────────────────────

export { isSessionActive, getSessionTokens, findSessionByTitle };
