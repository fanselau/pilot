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
  getChildSessions,
  isSessionActive,
} from '../../core/opencode-db.js';
import type { SessionMessage, SessionPart, Job } from '../../core/types.js';

// ── Session section types ─────────────────────────────────────────────────

export interface SessionSection {
  title: string;
  type: 'delegation' | 'execution' | 'subagent';
  command?: string;       // extracted from execution title
  agentType?: string;     // 'gsd-planner', 'gsd-executor', etc. for subagent sections
  parts: SessionPart[];
  children?: SessionSection[];  // nested subagent sections (max 2 levels)
}

// ── Child session resolution ──────────────────────────────────────────────

/**
 * Resolve child sessions spawned by `task` tool calls within a parent session.
 * Uses getChildSessions() which queries the parent_id column — no heuristics needed.
 *
 * @param sessionId - Parent session ID
 * @param parts - Parts array for the parent session (to check for task tool calls)
 * @param depth - Current nesting depth (max 2 levels)
 * @returns Array of SessionSection objects for child subagent sessions
 */
function resolveChildSections(
  sessionId: string,
  parts: SessionPart[],
  depth: number,
): SessionSection[] {
  if (depth >= 2) return [];

  const taskParts = parts.filter(p => p.type === 'tool' && p.tool === 'task');
  if (taskParts.length === 0) return [];

  const childSessions = getChildSessions(sessionId);
  if (childSessions.length === 0) return [];

  return childSessions.map((child) => {
    const childParts = getSessionParts(child.id);

    // Extract agent type from title (e.g. contains "gsd-planner", "gsd-executor")
    let agentType = 'subagent';
    const agentMatch = child.title.match(/gsd-(\w+(?:-\w+)*)/);
    if (agentMatch) agentType = agentMatch[0]; // e.g. "gsd-planner"

    const grandchildren = resolveChildSections(child.id, childParts, depth + 1);

    return {
      title: child.title,
      type: 'subagent' as const,
      agentType,
      parts: childParts,
      children: grandchildren.length > 0 ? grandchildren : undefined,
    };
  });
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
    const children = sessionId ? resolveChildSections(sessionId, parts, 0) : [];

    sections.push({
      title,
      type: isDelegation ? 'delegation' : 'execution',
      command,
      parts,
      children: children.length > 0 ? children : undefined,
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
