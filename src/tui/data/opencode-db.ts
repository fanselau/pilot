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
  getSessionTokensRecursive,
  getLastMessage,
  getSessionMessages,
  isSessionDone,
} from '../../core/opencode-db.js';
import { getJobTimeline } from '../../core/job-detail-query.js';
import type {
  SessionMessage,
  SessionPart,
  Job,
  StepTimelineItem,
  GroupedTimelinePage,
  StepTimelineGroup,
} from '../../core/types.js';

// ── Step-first timeline adapter types ─────────────────────────────────────

export interface TimelineSection {
  key: string;
  stepIndex: number | null;
  command: string;
  status: string;
  sessionId: string | null;
  items: StepTimelineItem[];
}

export interface TimelineSnapshot {
  groups: TimelineSection[];
  hasMore: boolean;
  nextCursor: string | null;
  sessionCount: number;
  childCount: number;
}

/**
 * Stable identity for a step group.
 * Step index is immutable per job execution and sessionId is immutable per
 * session branch, so this remains stable across refreshes.
 */
export function getTimelineSectionKey(group: {
  stepIndex: number | null;
  sessionId: string | null;
}): string {
  if (group.stepIndex === null) return 'step:unattributed';
  return `step:${group.stepIndex}:${group.sessionId ?? 'none'}`;
}

/**
 * Stable identity for timeline items.
 * Branch lifecycle items are keyed by immutable child sessionId to avoid title
 * collisions. Activity/tool items remain keyed by part identity.
 */
export function getTimelineItemKey(item: StepTimelineItem): string {
  switch (item.kind) {
    case 'fork-card':
      return `fork:${item.sessionId}`;
    case 'activity':
      return `activity:${item.sessionId}:${item.partId}`;
    case 'tool-summary':
      return `tool:${item.sessionId}:${item.partId}`;
    default:
      return 'item:unknown';
  }
}

function toTimelineSection(group: StepTimelineGroup): TimelineSection {
  return {
    key: getTimelineSectionKey(group),
    stepIndex: group.stepIndex,
    command: group.command,
    status: group.status,
    sessionId: group.sessionId,
    items: [...group.items].sort((a, b) => a.createdAt - b.createdAt),
  };
}

function normalizeGroups(page: GroupedTimelinePage): TimelineSection[] {
  if (page.groups.length > 0) {
    return page.groups.map(toTimelineSection);
  }

  // Transitional fallback: grouped contract should be primary, but if a caller
  // receives only flat items we bucket into unattributed so no activity disappears.
  if (page.items.length === 0) return [];

  return [
    {
      key: 'step:unattributed',
      stepIndex: null,
      command: 'unattributed',
      status: 'unattributed',
      sessionId: null,
      items: [...page.items].sort((a, b) => a.createdAt - b.createdAt),
    },
  ];
}

// ── Job timeline fetching ─────────────────────────────────────────────────

/**
 * Fetch step-grouped timeline data for a job using the shared core adapter.
 *
 * The TUI keeps only a thin projection layer (section keying + sorting).
 * Grouping and lifecycle composition remain in core/getJobTimeline().
 *
 * @param job - The job to fetch parts for
 * @param since - Optional epoch ms cursor; only items after this time returned
 */
export function fetchJobTimelineSnapshot(job: Job, since?: number): TimelineSnapshot {
  const page = getJobTimeline(job.id, {
    cursor: since !== undefined ? String(since) : undefined,
    limit: 200,
  });

  if (!page) {
    return {
      groups: [],
      hasMore: false,
      nextCursor: null,
      sessionCount: 0,
      childCount: 0,
    };
  }

  return {
    groups: normalizeGroups(page),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    sessionCount: page.sessionCount,
    childCount: page.childCount,
  };
}

/** Back-compat alias during detail renderer migration. */
export const fetchJobParts = fetchJobTimelineSnapshot;

// ── Session enrichment ────────────────────────────────────────────────────

/**
 * Aggregate token usage and last message content for a batch of session titles.
 * Used by the poller to enrich running job data with session info.
 *
 * @param sessionTitles - Array of opencode session titles (from job.sessionTitles JSON)
 * @returns Maps keyed by session title for token usage and last message content
 */
export function fetchSessionEnrichment(sessionTitles: string[]): {
  tokens: Map<string, { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }>;
  lastMsgs: Map<string, string>;
} {
  const tokens = new Map<string, { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }>();
  const lastMsgs = new Map<string, string>();

  for (const title of sessionTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    // Use recursive aggregation to include child session (subagent) tokens
    const tok = getSessionTokensRecursive(sessionId);
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

export { isSessionDone, getSessionTokens, getSessionTokensRecursive, findSessionByTitle };
