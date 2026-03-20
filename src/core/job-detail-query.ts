/**
 * Compact query backbone for the web UI (and eventually TUI).
 *
 * Provides 5 query functions that return well-defined compact DTO shapes.
 * This layer deliberately does NOT mirror the recursive TUI rendering model —
 * subagents appear as summary cards with counts, not inline transcripts.
 *
 * Pure core module — no UI dependencies.
 */

import {
  getJob,
  getJobSteps,
  cancel,
  forceQuitJob,
  unblockProject,
} from './db.js';
import {
  findSessionByTitle,
  getChildSessions,
  getLastMessage,
  getSessionParts,
  getAssistantMessageCount,
  isSessionDone,
  getSessionTokensRecursive,
  getSessionModelsRecursive,
} from './opencode-db.js';
import { truncate } from '../util/format.js';
import type {
  Job,
  JobDetailSnapshot,
  JobStepSummary,
  SessionSummary,
  ActivityPreviewItem,
  SessionActivityPage,
  SessionActivityOptions,
  JobDetailEvent,
  JobDetailEventsResponse,
  BranchLifecycleItem,
  StepTimelineItem,
  StepTimelineGroup,
  GroupedTimelinePage,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse sessionTitles JSON array from a Job.
 * Returns empty array on null, invalid JSON, or non-array values.
 */
function parseSessionTitles(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  } catch {
    return [];
  }
}

/**
 * Parse judgeVerdict JSON for verdict string and confidence number.
 */
function parseJudgeVerdict(raw: string | null): { verdict: string | null; confidence: number | null } {
  if (!raw) return { verdict: null, confidence: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      verdict: typeof parsed.verdict === 'string' ? parsed.verdict : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    };
  } catch {
    return { verdict: null, confidence: null };
  }
}

/**
 * Compute duration in ms between two ISO 8601 timestamps.
 * Returns null if either timestamp is null or unparseable.
 */
function computeDurationMs(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;

  if (completedAt) {
    const end = Date.parse(completedAt);
    if (!Number.isNaN(end)) return Math.max(0, end - start);
  }

  // Job still running — duration from start to now
  return Math.max(0, Date.now() - start);
}

/**
 * Map a SessionPart to an ActivityPreviewItem with truncated preview.
 */
function partToPreview(sessionId: string, part: { id: string; type: string; role: string; createdAt: number; text?: string; tool?: string; toolInput?: string; patchFiles?: string[] }): ActivityPreviewItem | null {
  const type = part.type as 'text' | 'tool' | 'patch';
  if (type !== 'text' && type !== 'tool' && type !== 'patch') return null;

  let preview = '';
  if (type === 'text' && part.text) {
    preview = truncate(part.text, 300);
  } else if (type === 'tool' && part.tool) {
    preview = truncate(`${part.tool}: ${part.toolInput ?? ''}`, 300);
  } else if (type === 'patch' && part.patchFiles) {
    preview = truncate(part.patchFiles.join(', '), 300);
  }

  return {
    sessionId,
    partId: part.id,
    type,
    role: part.role,
    createdAt: part.createdAt,
    preview,
    ...(part.tool ? { tool: part.tool } : {}),
    ...(part.toolInput ? { toolInput: part.toolInput } : {}),
  };
}

// ── Query Functions ───────────────────────────────────────────────────────

/**
 * Build a compact SessionSummary for a given session ID.
 *
 * @param sessionId - The opencode session ID
 * @param role - 'root' or 'subagent'
 * @param title - Display title for the session
 * @param parentSessionId - Parent session ID (null for root sessions)
 * @param timeCreated - Epoch ms when session was created
 * @param timeUpdated - Epoch ms when session was last updated
 */
function summarizeSession(
  sessionId: string,
  role: 'root' | 'subagent',
  title: string,
  parentSessionId: string | null,
  timeCreated: number,
  timeUpdated: number,
): SessionSummary {
  const children = getChildSessions(sessionId);
  const lastMsg = getLastMessage(sessionId);
  const tokens = getSessionTokensRecursive(sessionId);
  const models = getSessionModelsRecursive(sessionId);
  const done = isSessionDone(sessionId);
  const messageCount = getAssistantMessageCount(sessionId);
  const tokenTotal = tokens.input + tokens.output + tokens.reasoning + tokens.cacheRead + tokens.cacheWrite;
  const durationMs = timeUpdated > timeCreated ? timeUpdated - timeCreated : null;

  let latestMessagePreview: string | null = null;
  if (lastMsg && lastMsg.content) {
    latestMessagePreview = truncate(lastMsg.content, 200);
  }

  return {
    sessionId,
    title,
    role,
    status: done ? 'done' : (messageCount > 0 ? 'active' : 'unknown'),
    parentSessionId,
    startedAt: timeCreated,
    updatedAt: timeUpdated,
    durationMs,
    latestMessagePreview,
    messageCount,
    childCount: children.length,
    tokenTotal,
    models,
  };
}

/**
 * Get a compact root-based snapshot of a job.
 *
 * Returns null if the job doesn't exist. Subagents appear as summary cards
 * with counts — NOT inline transcripts.
 */
function getJobDetail(jobId: string): JobDetailSnapshot | null {
  const job = getJob(jobId);
  if (!job) return null;

  // Steps
  const rawSteps = getJobSteps(jobId);
  const steps: JobStepSummary[] = rawSteps.map((s) => ({
    stepIndex: s.stepIndex,
    command: s.command,
    args: s.args,
    status: s.status,
    source: s.source ?? 'delegation',
    reason: s.reason ?? null,
    error: s.error ?? null,
    sessionId: s.sessionId,
    durationMs: s.durationMs,
    verdictReason: s.verdictReason,
  }));

  // Parse session titles to find root sessions
  const sessionTitles = parseSessionTitles(job.sessionTitles);
  const rootSessions: SessionSummary[] = [];
  const subagents: SessionSummary[] = [];
  const seenSessions = new Set<string>();

  for (const title of sessionTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId || seenSessions.has(sessionId)) continue;
    seenSessions.add(sessionId);

    // We don't have precise timestamps for root sessions found by title,
    // so use current time as approximation for updatedAt
    const now = Date.now();
    const rootSummary = summarizeSession(sessionId, 'root', title, null, now, now);
    rootSessions.push(rootSummary);

    // Get immediate children as subagent cards
    const children = getChildSessions(sessionId);
    for (const child of children) {
      if (seenSessions.has(child.id)) continue;
      seenSessions.add(child.id);
      const childSummary = summarizeSession(
        child.id,
        'subagent',
        child.title,
        sessionId,
        child.timeCreated,
        child.timeUpdated,
      );
      subagents.push(childSummary);
    }
  }

  // Activity preview: most recent ~10 parts from the first root session
  const activityPreview: ActivityPreviewItem[] = [];
  if (rootSessions.length > 0) {
    const firstRootId = rootSessions[0].sessionId;
    const parts = getSessionParts(firstRootId);
    // Take last 10 parts that are text/tool/patch
    const recentParts = parts.slice(-20); // grab more, then filter
    for (const part of recentParts) {
      const item = partToPreview(firstRootId, part);
      if (item) {
        activityPreview.push(item);
      }
      if (activityPreview.length >= 10) break;
    }
  }

  // Parse judge verdict
  const { verdict, confidence } = parseJudgeVerdict(job.judgeVerdict);

  // Compute duration
  const durationMs = computeDurationMs(job.startedAt, job.completedAt);

  return {
    job: {
      id: job.id,
      project: job.project,
      description: job.description,
      scope: job.scope,
      status: job.status,
      verdict,
      confidence,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs,
      currentStep: job.currentStep,
      modelProfile: job.modelProfile,
      providerMode: job.providerMode,
      error: job.error,
    },
    steps,
    rootSessions,
    subagents,
    activityPreview,
    cursor: String(Date.now()),
  };
}

/**
 * Get paginated session activity parts.
 *
 * Supports cursor-based pagination and optional tool detail exclusion
 * for compact views.
 */
function getSessionActivity(sessionId: string, options?: SessionActivityOptions): SessionActivityPage {
  const limit = options?.limit ?? 50;
  const includeToolDetails = options?.includeToolDetails ?? false;
  const since = options?.cursor ? Number(options.cursor) : undefined;

  let parts = getSessionParts(sessionId, since);

  // Apply limit
  const hasMore = parts.length > limit;
  parts = parts.slice(0, limit);

  // Strip tool details if not requested
  if (!includeToolDetails) {
    parts = parts.map((p) => ({
      ...p,
      toolInput: undefined,
      toolOutput: undefined,
    }));
  }

  // Compute next cursor from last part's createdAt
  const nextCursor = parts.length > 0 ? String(parts[parts.length - 1].createdAt) : null;

  return {
    parts,
    hasMore,
    nextCursor,
  };
}

/**
 * Get immediate children of a session as summary cards.
 *
 * Returns only direct children — not grandchildren. Each child includes
 * a childCount showing how many sub-children it has.
 */
function getSessionChildSummaries(sessionId: string): SessionSummary[] {
  const children = getChildSessions(sessionId);
  return children.map((child) =>
    summarizeSession(
      child.id,
      'subagent',
      child.title,
      sessionId,
      child.timeCreated,
      child.timeUpdated,
    ),
  );
}

/**
 * Get incremental deltas for a job since a given cursor.
 *
 * Compares current job state against the cursor timestamp and returns
 * compact events for changes — NOT full re-serialization.
 */
function getJobDetailEvents(jobId: string, sinceCursor: string): JobDetailEventsResponse {
  const sinceMs = Number(sinceCursor);
  const events: JobDetailEvent[] = [];
  const now = Date.now();

  // Reload job from DB
  const job = getJob(jobId);
  if (!job) {
    return { events: [], cursor: String(now) };
  }

  // Check if job metadata changed since cursor
  // We use a simple heuristic: if the job was updated after the cursor,
  // emit a job-update event with key fields
  const completedAtMs = job.completedAt ? Date.parse(job.completedAt) : null;
  const startedAtMs = job.startedAt ? Date.parse(job.startedAt) : null;

  if (
    (completedAtMs && completedAtMs > sinceMs) ||
    (startedAtMs && startedAtMs > sinceMs)
  ) {
    const { verdict, confidence } = parseJudgeVerdict(job.judgeVerdict);
    events.push({
      type: 'job-update',
      timestamp: now,
      data: {
        status: job.status,
        currentStep: job.currentStep,
        verdict,
        confidence,
        error: job.error,
      },
    });
  }

  // Check steps for changes
  const rawSteps = getJobSteps(jobId);
  for (const step of rawSteps) {
    const stepCompletedMs = step.completedAt ? Date.parse(step.completedAt) : null;
    const stepStartedMs = step.startedAt ? Date.parse(step.startedAt) : null;

    if (
      (stepCompletedMs && stepCompletedMs > sinceMs) ||
      (stepStartedMs && stepStartedMs > sinceMs)
    ) {
      events.push({
        type: 'step-update',
        timestamp: now,
        data: {
          stepIndex: step.stepIndex,
          command: step.command,
          status: step.status,
          durationMs: step.durationMs,
          verdictReason: step.verdictReason,
        },
      });
    }
  }

  // Check for new activity parts from root sessions
  const sessionTitles = parseSessionTitles(job.sessionTitles);
  for (const title of sessionTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    const newParts = getSessionParts(sessionId, sinceMs);
    for (const part of newParts.slice(0, 20)) { // cap at 20 new parts per poll
      events.push({
        type: 'activity-new',
        timestamp: part.createdAt,
        data: {
          sessionId,
          partId: part.id,
          type: part.type,
          role: part.role,
          preview: part.text ? truncate(part.text, 300) : (part.tool ?? part.type),
        },
      });
    }
  }

  return {
    events,
    cursor: String(now),
  };
}

// ── Step-First Timeline Query ─────────────────────────────────────────────

interface TimelineStepRef {
  stepIndex: number;
  command: string;
  status: string;
  source: string;
  sessionId: string | null;
  sessionTitle: string | null;
  startedAtMs: number | null;
  completedAtMs: number | null;
}

interface TimelineCandidate {
  item: StepTimelineItem;
  createdAt: number;
  sessionId: string | null;
  sessionTitle: string | null;
}

function parseStepTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveStepIndex(candidate: TimelineCandidate, steps: TimelineStepRef[]): number | null {
  if (candidate.sessionId) {
    const bySessionId = steps.find((step) => step.sessionId === candidate.sessionId);
    if (bySessionId) return bySessionId.stepIndex;
  }

  if (candidate.sessionTitle) {
    const bySessionTitle = steps.find((step) => step.sessionTitle === candidate.sessionTitle);
    if (bySessionTitle) return bySessionTitle.stepIndex;
  }

  const byWindow = steps.find((step) => {
    if (step.startedAtMs === null) return false;
    const windowStart = step.startedAtMs;
    const windowEnd = step.completedAtMs ?? Number.POSITIVE_INFINITY;
    return candidate.createdAt >= windowStart && candidate.createdAt <= windowEnd;
  });
  if (byWindow) return byWindow.stepIndex;

  return null;
}

/**
 * Build a step-grouped chronological timeline for a job.
 *
 * Timeline attribution order is deterministic:
 * 1) job_steps.sessionId identity
 * 2) job_steps.sessionTitle match
 * 3) step time window
 * 4) unattributed bucket
 *
 * Child branches are represented as one lifecycle-aware object per child
 * session ID (no separate completion item).
 */
function getJobTimeline(
  jobId: string,
  options?: { cursor?: string; limit?: number },
): GroupedTimelinePage | null {
  const job = getJob(jobId);
  if (!job) return null;

  const limit = options?.limit ?? 100;
  const cursorMs = options?.cursor ? Number(options.cursor) : 0;

  const stepRefs: TimelineStepRef[] = getJobSteps(jobId).map((step) => ({
    stepIndex: step.stepIndex,
    command: step.command,
    status: step.status,
    source: step.source ?? 'delegation',
    sessionId: step.sessionId,
    sessionTitle: step.sessionTitle,
    startedAtMs: parseStepTime(step.startedAt),
    completedAtMs: parseStepTime(step.completedAt),
  }));

  const queue: Array<{ sessionId: string; title: string; parentSessionId: string | null }> = [];
  const queuedSessionIds = new Set<string>();

  for (const title of parseSessionTitles(job.sessionTitles)) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId || queuedSessionIds.has(sessionId)) continue;
    queue.push({ sessionId, title, parentSessionId: null });
    queuedSessionIds.add(sessionId);
  }

  const seenSessions = new Set<string>();
  const sessionTitleById = new Map<string, string>();
  const branchByChildSessionId = new Map<string, BranchLifecycleItem>();
  const candidates: TimelineCandidate[] = [];
  let totalChildCount = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (seenSessions.has(current.sessionId)) continue;

    seenSessions.add(current.sessionId);
    sessionTitleById.set(current.sessionId, current.title);

    const parts = getSessionParts(current.sessionId);
    for (const part of parts) {
      if ((part.type === 'text' || part.type === 'reasoning') && part.text) {
        candidates.push({
          item: {
            kind: 'activity',
            sessionId: current.sessionId,
            partId: part.id,
            role: part.role,
            createdAt: part.createdAt,
            text: part.text,
          },
          createdAt: part.createdAt,
          sessionId: current.sessionId,
          sessionTitle: current.title,
        });
        continue;
      }

      if (part.type === 'tool' || part.type === 'patch') {
        candidates.push({
          item: {
            kind: 'tool-summary',
            sessionId: current.sessionId,
            partId: part.id,
            createdAt: part.createdAt,
            tool: part.tool ?? part.type,
            toolInput: part.toolInput,
            toolStatus: part.toolStatus,
            patchFiles: part.patchFiles,
          },
          createdAt: part.createdAt,
          sessionId: current.sessionId,
          sessionTitle: current.title,
        });
      }
    }

    const children = getChildSessions(current.sessionId);
    totalChildCount += children.length;

    for (const child of children) {
      const done = isSessionDone(child.id);
      const messageCount = getAssistantMessageCount(child.id);
      const tokens = getSessionTokensRecursive(child.id);
      const models = getSessionModelsRecursive(child.id);
      const lastMsg = getLastMessage(child.id);
      const childChildren = getChildSessions(child.id);
      const tokenTotal = tokens.input + tokens.output + tokens.reasoning + tokens.cacheRead + tokens.cacheWrite;
      const durationMs = child.timeUpdated > child.timeCreated
        ? child.timeUpdated - child.timeCreated
        : null;
      const latestPreview = lastMsg?.content ? truncate(lastMsg.content, 200) : null;
      const existing = branchByChildSessionId.get(child.id);
      const completedAt = done && child.timeUpdated > child.timeCreated
        ? child.timeUpdated
        : (existing?.completedAt ?? null);

      branchByChildSessionId.set(child.id, {
        kind: 'fork-card',
        sessionId: child.id,
        parentSessionId: current.sessionId,
        title: child.title,
        createdAt: existing?.createdAt ?? child.timeCreated,
        updatedAt: Math.max(existing?.updatedAt ?? child.timeUpdated, child.timeUpdated),
        completedAt,
        status: done ? 'done' : (messageCount > 0 ? 'active' : 'unknown'),
        messageCount,
        tokenTotal,
        models,
        latestMessagePreview: latestPreview,
        finalMessagePreview: done ? latestPreview : (existing?.finalMessagePreview ?? null),
        childCount: childChildren.length,
        durationMs,
      });
    }
  }

  for (const branch of branchByChildSessionId.values()) {
    candidates.push({
      item: branch,
      createdAt: branch.createdAt,
      sessionId: branch.parentSessionId,
      sessionTitle: sessionTitleById.get(branch.parentSessionId) ?? null,
    });
  }

  candidates.sort((a, b) => a.createdAt - b.createdAt);

  const filtered = cursorMs > 0
    ? candidates.filter((candidate) => candidate.createdAt > cursorMs)
    : candidates;
  const hasMore = filtered.length > limit;
  const page = filtered.slice(0, limit);
  const flatItems = page.map((candidate) => candidate.item);
  const nextCursor = page.length > 0 ? String(page[page.length - 1].createdAt) : null;

  const groupsByStepIndex = new Map<number, StepTimelineGroup>();
  for (const step of stepRefs) {
    groupsByStepIndex.set(step.stepIndex, {
      stepIndex: step.stepIndex,
      command: step.command,
      status: step.status,
      source: step.source,
      sessionId: step.sessionId,
      items: [],
    });
  }

  const unattributed: StepTimelineGroup = {
    stepIndex: null,
    command: 'unattributed',
    status: 'unattributed',
    source: 'delegation',
    sessionId: null,
    items: [],
  };

  for (const candidate of page) {
    const attributedStepIndex = resolveStepIndex(candidate, stepRefs);
    if (attributedStepIndex === null) {
      unattributed.items.push(candidate.item);
      continue;
    }

    const group = groupsByStepIndex.get(attributedStepIndex);
    if (!group) {
      unattributed.items.push(candidate.item);
      continue;
    }
    group.items.push(candidate.item);
  }

  const groups: StepTimelineGroup[] = [];
  for (const step of stepRefs) {
    const group = groupsByStepIndex.get(step.stepIndex);
    if (!group || group.items.length === 0) continue;
    group.items.sort((a, b) => a.createdAt - b.createdAt);
    groups.push(group);
  }

  if (unattributed.items.length > 0) {
    unattributed.items.sort((a, b) => a.createdAt - b.createdAt);
    groups.push(unattributed);
  }

  return {
    groups,
    items: flatItems,
    hasMore,
    nextCursor,
    sessionCount: seenSessions.size,
    childCount: totalChildCount,
  };
}

// ── Mutation Wrappers ─────────────────────────────────────────────────────


/** Cancel a job — delegates to db.cancel(). */
function cancelJobAction(jobId: string): void {
  cancel(jobId);
}

/** Force-quit a running job — delegates to db.forceQuitJob(). */
function forceQuitJobAction(jobId: string, reason?: string): void {
  forceQuitJob(jobId, 'cli', reason ?? 'Force quit via web UI');
}

/** Unblock a project — delegates to db.unblockProject(). */
function unblockProjectAction(projectPath: string): void {
  unblockProject(projectPath);
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  getJobDetail,
  summarizeSession,
  getSessionActivity,
  getSessionChildSummaries,
  getJobDetailEvents,
  getJobTimeline,
  cancelJobAction,
  forceQuitJobAction,
  unblockProjectAction,
};
