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
  blockProject,
  requeueFailedJob,
  getAllProjects,
  getProjectJobCounts,
  getQueue,
  getRecent,
} from './db.js';
import { computeSafeDurationMs, safeParseTimestamp } from './time-utils.js';
import {
  findSessionByTitle,
  getChildSessions,
  getLastMessage,
  getSessionParts,
  getAssistantMessageCount,
  isSessionDone,
  getSessionTokensRecursive,
  getSessionModelsRecursive,
  getSessionMeta,
} from './opencode-db.js';
import { truncate } from '../util/format.js';
import type {
  Job,
  JobDetailSnapshot,
  JobStepSummary,
  SessionSummary,
  SessionPart,
  ActivityPreviewItem,
  SessionActivityPage,
  SessionActivityOptions,
  JobDetailEvent,
  JobDetailEventsResponse,
  BranchLifecycleItem,
  StepTimelineItem,
  StepTimelineGroup,
  GroupedTimelinePage,
  ProjectWithStats,
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
 * Delegates to computeSafeDurationMs for timezone-correct parsing.
 */
function computeDurationMs(startedAt: string | null, completedAt: string | null): number | null {
  return computeSafeDurationMs(startedAt, completedAt);
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

  // Collect observed models across all root sessions (deduplicated, sorted)
  const observedModelsSet = new Set<string>();
  for (const rootSession of rootSessions) {
    for (const model of getSessionModelsRecursive(rootSession.sessionId)) {
      if (model) observedModelsSet.add(model);
    }
  }
  const observedModels = Array.from(observedModelsSet).sort();

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
      observedModels,
      gitBaseCommit: job.gitBaseCommit,
      gitHeadCommit: job.gitHeadCommit,
      startedDirty: job.startedDirty,
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
  verdictReason?: string | null;
}

interface TimelineCandidate {
  item: StepTimelineItem;
  createdAt: number;
  sessionId: string | null;
  sessionTitle: string | null;
}

function parseStepTime(value: string | null): number | null {
  return safeParseTimestamp(value);
}

function resolveStepIndex(
  candidate: TimelineCandidate,
  steps: TimelineStepRef[],
  childToStepIndex: Map<string, number>,
): number | null {
  // Tier 1: Direct sessionId match
  if (candidate.sessionId) {
    const bySessionId = steps.find((step) => step.sessionId === candidate.sessionId);
    if (bySessionId) return bySessionId.stepIndex;
  }

  // Tier 2: sessionTitle match
  if (candidate.sessionTitle) {
    const bySessionTitle = steps.find((step) => step.sessionTitle === candidate.sessionTitle);
    if (bySessionTitle) return bySessionTitle.stepIndex;
  }

  // Tier 3: Time window match
  // For completed steps: use the actual completedAtMs as the window end.
  // For running steps (completedAtMs === null): cap the window at the NEXT step's startedAtMs
  // to prevent open-ended running steps from greedily attributing all subsequent activity.
  const stepsWithStart = steps
    .filter((s) => s.startedAtMs !== null)
    .sort((a, b) => a.startedAtMs! - b.startedAtMs!);

  for (let i = 0; i < stepsWithStart.length; i++) {
    const step = stepsWithStart[i];
    const windowStart = step.startedAtMs!;
    let windowEnd: number;

    if (step.completedAtMs !== null) {
      windowEnd = step.completedAtMs;
    } else {
      // Running step: use next step's start time as effective window end.
      // Only attribute if candidate is before the next step begins.
      const nextStep = i + 1 < stepsWithStart.length ? stepsWithStart[i + 1] : null;
      windowEnd = nextStep?.startedAtMs ?? Number.POSITIVE_INFINITY;
    }

    if (candidate.createdAt >= windowStart && candidate.createdAt <= windowEnd) {
      return step.stepIndex;
    }
  }

  // Tier 3.5: Delegation session containment
  // Explicitly handles candidates from children of delegation sessions (negative step indices).
  // Delegation sessions are synthetic; their children are mapped in childToStepIndex via
  // a post-BFS explicit pass in getJobTimeline(). This tier catches delegation children
  // before the general child transitivity check in Tier 4.
  if (candidate.sessionId) {
    const delegChildMatch = childToStepIndex.get(candidate.sessionId);
    if (delegChildMatch !== undefined && delegChildMatch < 0) {
      return delegChildMatch;
    }
  }

  // Tier 4: Child session transitivity — candidate's session is a child of a step's session
  if (candidate.sessionId) {
    const childMatch = childToStepIndex.get(candidate.sessionId);
    if (childMatch !== undefined) return childMatch;
  }

  // Tier 5: Last-step fallback — restricted to judge/wrap-up steps only.
  // Late activity after all step windows close is most commonly judge verdict processing.
  // Only attribute if the most recently started step is a judge step (command contains 'judge'
  // or source starts with 'judge:'). Non-judge last steps fall through to Unattributed.
  let latestStep: TimelineStepRef | null = null;
  for (const step of steps) {
    if (step.startedAtMs === null) continue;
    if (!latestStep || step.startedAtMs > latestStep.startedAtMs!) {
      latestStep = step;
    }
  }
  if (
    latestStep !== null &&
    candidate.createdAt >= latestStep.startedAtMs! &&
    (latestStep.command.includes('judge') || latestStep.source.startsWith('judge:'))
  ) {
    return latestStep.stepIndex;
  }

  return null;
}

/**
 * Compute a human-readable semantic label for a step group.
 * Maps source + command pairs to meaningful display names used in the UI.
 * At least 12 distinct mappings are handled explicitly; all others fall back
 * to capitalizing the command string.
 */
function computeSemanticLabel(command: string, source: string): string {
  if (command === 'delegation') {
    if (source.startsWith('judge:')) return 'Continuation Delegation';
    return 'Delegation';
  }
  if (command === 'unattributed') return 'Unattributed';
  if (command === 'add-phase') return 'Add Phase';
  const isGap = source === 'judge:gaps' || source === 'judge:failed';
  if (source === 'judge:hung') return 'Recovery';
  if (source === 'operator') return 'Manual';
  if (command.includes('plan')) return isGap ? 'Gap Planning' : 'Planning';
  if (command.includes('execute')) return isGap ? 'Gap Execution' : 'Execution';
  if (command.includes('judge') || command.includes('verify')) return isGap ? 'Gap Judge' : 'Judge';
  if (command === 'fast') return 'Fast Task';
  if (command === 'quick') return 'Quick Task';
  return command.charAt(0).toUpperCase() + command.slice(1);
}

/**
 * Build a step-grouped chronological timeline for a job.
 *
 * Timeline attribution order is deterministic (6 tiers):
 * 1) job_steps.sessionId identity
 * 2) job_steps.sessionTitle match
 * 3) step time window (startedAtMs..completedAtMs; running steps capped at next step's start)
 * 3.5) delegation session containment (children of delegation synthetic steps)
 * 4) child session transitivity (candidate's session is a child of a step's session)
 * 5) last-step fallback (judge steps only — catches verdict wrap-up activity)
 * 6) unattributed bucket (genuinely unassignable content only)
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
    verdictReason: step.verdictReason ?? null,
  }));

  // ── Delegation session discovery ────────────────────────────────────────
  const allTitles = parseSessionTitles(job.sessionTitles);
  const delegationPrefix = `pilot-delegate-${jobId}-`;
  const delegationTitles = allTitles.filter(t => t.startsWith(delegationPrefix));

  const delegationInfos: Array<{
    sessionId: string;
    title: string;
    timeCreated: number;
    timeUpdated: number;
    done: boolean;
  }> = [];

  for (const title of delegationTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;
    const meta = getSessionMeta(sessionId);
    if (!meta) continue;
    const done = isSessionDone(sessionId);
    delegationInfos.push({
      sessionId,
      title,
      timeCreated: meta.timeCreated,
      timeUpdated: meta.timeUpdated,
      done,
    });
  }

  // Sort delegation sessions chronologically
  delegationInfos.sort((a, b) => a.timeCreated - b.timeCreated);

  // Create synthetic delegation step refs with negative indices
  const delegationStepRefs: TimelineStepRef[] = delegationInfos.map((info, i) => ({
    stepIndex: -100 + i,
    command: 'delegation',
    status: info.done ? 'completed' : 'running',
    source: 'delegation',
    sessionId: info.sessionId,
    sessionTitle: info.title,
    startedAtMs: info.timeCreated,
    completedAtMs: info.done ? info.timeUpdated : null,
  }));

  // Prepend delegation step refs before real step refs
  const allStepRefs: TimelineStepRef[] = [...delegationStepRefs, ...stepRefs];

  // ── BFS queue from session titles ─────────────────────────────────────
  const queue: Array<{ sessionId: string; title: string; parentSessionId: string | null }> = [];
  const queuedSessionIds = new Set<string>();

  for (const title of allTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId || queuedSessionIds.has(sessionId)) continue;
    queue.push({ sessionId, title, parentSessionId: null });
    queuedSessionIds.add(sessionId);
  }

  // Ensure delegation sessions are in the BFS queue
  for (const info of delegationInfos) {
    if (!queuedSessionIds.has(info.sessionId)) {
      queue.push({ sessionId: info.sessionId, title: info.title, parentSessionId: null });
      queuedSessionIds.add(info.sessionId);
    }
  }

  const seenSessions = new Set<string>();
  const sessionTitleById = new Map<string, string>();
  const branchByChildSessionId = new Map<string, BranchLifecycleItem>();
  const candidates: TimelineCandidate[] = [];
  let totalChildCount = 0;

  // ── Child-to-step-index map for tier 4 attribution ─────────────────────
  // Maps child session IDs to the step that owns their parent session.
  // Built during BFS; used by resolveStepIndex() for transitive attribution.
  const childToStepIndex = new Map<string, number>();

  // Build a sessionId → stepIndex lookup from allStepRefs for BFS ownership tracking
  const sessionIdToStepIndex = new Map<string, number>();
  for (const step of allStepRefs) {
    if (step.sessionId) {
      sessionIdToStepIndex.set(step.sessionId, step.stepIndex);
    }
  }

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

    // Track child → step ownership for tier 4 attribution
    const owningStepIndex = sessionIdToStepIndex.get(current.sessionId)
      ?? childToStepIndex.get(current.sessionId);

    for (const child of children) {
      // Record transitive ownership: if parent is owned by a step, child inherits
      if (owningStepIndex !== undefined && !childToStepIndex.has(child.id)) {
        childToStepIndex.set(child.id, owningStepIndex);
      }
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

  // After BFS: explicitly map delegation session children to their delegation step index.
  // Delegation sessions may spawn sub-agents whose sessions are not tracked in the
  // normal opencode parent-child graph. This ensures Tier 3.5 attribution works correctly
  // for content originating in delegation sub-sessions.
  for (const delegStep of delegationStepRefs) {
    if (!delegStep.sessionId) continue;
    const delegChildren = getChildSessions(delegStep.sessionId);
    for (const child of delegChildren) {
      if (!childToStepIndex.has(child.id)) {
        childToStepIndex.set(child.id, delegStep.stepIndex);
      }
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
  for (const step of allStepRefs) {
    groupsByStepIndex.set(step.stepIndex, {
      stepIndex: step.stepIndex,
      command: step.command,
      status: step.status,
      source: step.source,
      sessionId: step.sessionId,
      items: [],
      semanticLabel: computeSemanticLabel(step.command, step.source),
      verdictReason: step.verdictReason ?? null,
    });
  }

  const unattributed: StepTimelineGroup = {
    stepIndex: null,
    command: 'unattributed',
    status: 'unattributed',
    source: 'delegation',
    sessionId: null,
    items: [],
    semanticLabel: 'Unattributed',
  };

  for (const candidate of page) {
    const attributedStepIndex = resolveStepIndex(candidate, allStepRefs, childToStepIndex);
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
  for (const step of allStepRefs) {
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

// ── New Queries for Web UI Plans 03-05 ───────────────────────────────────

/**
 * Get the full timeline for a job without pagination.
 *
 * Unlike getJobTimeline() which supports cursor/limit pagination, this returns
 * all timeline items in a single call. Uses a limit of 10000 which is large
 * enough for any practical job. Use for dense step visualization in Plans 03-05.
 */
function getFullJobTimeline(jobId: string): GroupedTimelinePage | null {
  return getJobTimeline(jobId, { limit: 10000 });
}

/**
 * Get all projects with aggregate job counts.
 *
 * Combines getAllProjects() with getProjectJobCounts() per project.
 */
function getProjectsWithStats(): ProjectWithStats[] {
  const projects = getAllProjects();
  return projects.map((p) => {
    const counts = getProjectJobCounts(p.path);
    return {
      path: p.path,
      owner: p.owner,
      status: p.status,
      blockedReason: p.blockedReason,
      blockedAt: p.blockedAt,
      defaultCategories: p.defaultCategories,
      activeJobCount: counts.running + counts.pending,
      completedJobCount: counts.completed,
      failedJobCount: counts.failed,
    };
  });
}

/**
 * Get a single session part by ID — returns the full, untruncated content.
 *
 * Fetches all parts for the session and finds the matching part by ID.
 * Returns null if the session or part does not exist.
 */
function getFullSessionPart(sessionId: string, partId: string): SessionPart | null {
  const parts = getSessionParts(sessionId);
  return parts.find((p) => p.id === partId) ?? null;
}

// ── Project Detail Queries ────────────────────────────────────────────────

/**
 * Get a single project with aggregate job stats.
 * Returns null if the project is not registered.
 */
function getProjectDetail(projectPath: string): ProjectWithStats | null {
  const projects = getAllProjects();
  const project = projects.find((p) => p.path === projectPath);
  if (!project) return null;
  const counts = getProjectJobCounts(projectPath);
  return {
    path: project.path,
    owner: project.owner,
    status: project.status,
    blockedReason: project.blockedReason,
    blockedAt: project.blockedAt,
    defaultCategories: project.defaultCategories,
    activeJobCount: counts.running + counts.pending,
    completedJobCount: counts.completed,
    failedJobCount: counts.failed,
  };
}

/**
 * Get all jobs for a specific project, ordered by createdAt DESC.
 * Combines queue (pending/running) and recent (completed/failed/cancelled) jobs,
 * filtered to the specified project.
 */
function getProjectJobs(projectPath: string, limit: number = 50): import('./types.js').Job[] {
  const queue = getQueue();
  const recent = getRecent(200);
  const allJobs = [...queue, ...recent];
  return allJobs
    .filter((j) => j.project === projectPath)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

/** Block a project — delegates to db.blockProject(). */
function blockProjectAction(projectPath: string, reason: string): void {
  blockProject(projectPath, reason);
}

// ── Mutation Wrappers ─────────────────────────────────────────────────────


/** Retry a job — resets status to pending via db.requeueFailedJob(). */
function retryJobAction(jobId: string): void {
  requeueFailedJob(jobId);
}

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
  getFullJobTimeline,
  getProjectsWithStats,
  getProjectDetail,
  getProjectJobs,
  getFullSessionPart,
  retryJobAction,
  cancelJobAction,
  forceQuitJobAction,
  unblockProjectAction,
  blockProjectAction,
};
