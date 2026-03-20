/**
 * DetailView — job drill-down showing header + live activity stream.
 *
 * Displays job metadata (ID, project, scope, description, status, elapsed)
 * and a live-updating activity stream from the job's sessions, organized
 * by delegation → execution sections.
 *
 * Part formatting mirrors `pilot log` CLI: tool calls (yellow), text (cyan/green),
 * patches (green), with step-start/step-finish/reasoning skipped by default.
 *
 * Auto-scrolls to bottom via Scrollable follow mode.
 * Auto-refreshes via 1s poller fetching incremental parts.
 */

/* @jsxImportSource @opentui/solid */

import { createSignal, createEffect, createMemo, on, onMount, onCleanup, For, Show } from 'solid-js';
import { createPoller } from '../data/poller.js';
import {
  fetchJobTimelineSnapshot,
  getTimelineItemKey,
} from '../data/opencode-db.js';
import type { TimelineSection } from '../data/opencode-db.js';
import { Scrollable } from '../widgets/scrollable.js';
import { statusColors, theme } from '../theme.js';
import { formatTokens } from '../components/running-panel.js';
import { resolveAllAgentModels } from '../../core/models.js';
import { getConfig } from '../../core/config.js';
import { buildJobWhy, buildRetryWhy, buildUndoWhy } from '../../core/job-introspection.js';
import { buildJudgeSignal } from '../../core/judge-signal.js';
import type { JobWhyContext } from '../../core/job-introspection.js';
import type { PilotStateStore } from '../state.js';
import type {
  Job,
  JobObservabilitySnapshot,
  DelegationResult,
  JobStatus,
  StepTimelineItem,
} from '../../core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '0s';
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (elapsed < 0) return '0s';
  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${mins}m${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusColor(status: string): string {
  switch (status) {
    case 'running': return statusColors.running;
    case 'completed': return statusColors.done;
    case 'failed': return statusColors.failed;
    case 'cancelled': return statusColors.cancelled;
    case 'pending': return statusColors.pending;
    default: return theme.muted;
  }
}

const TERMINAL_STATUSES = new Set<JobStatus>(['completed', 'failed', 'cancelled']);

interface RecoveryHeader {
  line: string;
  state: 'safe' | 'guarded' | 'unavailable';
}

function shortCommit(commit: string | null): string {
  return commit ? commit.slice(0, 12) : '—';
}

function inferKnownRecoveryGuard(job: Job): 'blocked-newer-work' | 'diverged-history' | null {
  const lower = `${job.error ?? ''} ${job.resumeHint ?? ''}`.toLowerCase();
  if (
    lower.includes('newer commits exist') ||
    lower.includes('newer work') ||
    lower.includes('ahead of this checkpoint')
  ) {
    return 'blocked-newer-work';
  }
  if (lower.includes('diverged')) {
    return 'diverged-history';
  }
  return null;
}

export function buildRecoveryHeader(job: Job): RecoveryHeader {
  const base = shortCommit(job.gitBaseCommit);
  const head = shortCommit(job.gitHeadCommit);

  if (job.status === 'pending' || job.status === 'running') {
    return {
      line: `Recovery: unavailable (active job)   base:${base} head:${head}`,
      state: 'unavailable',
    };
  }

  if (!job.gitBaseCommit || !job.gitHeadCommit) {
    return {
      line: `Recovery: unavailable (missing-checkpoint)   base:${base} head:${head}`,
      state: 'unavailable',
    };
  }

  const knownGuard = inferKnownRecoveryGuard(job);
  if (knownGuard === 'blocked-newer-work') {
    return {
      line: `Recovery: guarded (blocked-newer-work)   base:${base} head:${head}`,
      state: 'guarded',
    };
  }

  if (knownGuard === 'diverged-history') {
    return {
      line: `Recovery: guarded (diverged-history)   base:${base} head:${head}`,
      state: 'guarded',
    };
  }

  return {
    line: `Recovery: safe${job.startedDirty ? ' (started dirty)' : ''}   base:${base} head:${head}`,
    state: 'safe',
  };
}

export function parseStepInfo(job: Job): { label: string; index: string } {
  if (!job.delegationPlan) return { label: '—', index: '—' };
  try {
    const result = JSON.parse(job.delegationPlan) as DelegationResult;
    const intent = result.intent;
    if (!intent) return { label: '—', index: '—' };
    const label = intent.type;
    const index = `${job.currentStep + 1}`;
    return { label, index };
  } catch { return { label: '—', index: '—' }; }
}

export function buildReasonHeaderLines(job: Job, reasonContext: JobWhyContext = {}): string[] {
  const lines: string[] = [];
  const why = buildJobWhy(job, reasonContext);

  if (why.code === 'grace-wait') {
    const remaining = typeof why.remainingSeconds === 'number' ? `:${why.remainingSeconds}s` : '';
    lines.push(`Wait: ${why.badge}${remaining} — ${why.what}`);
  }

  return lines;
}

export function buildTriageHeaderLines(
  job: Job,
  reasonContext: JobWhyContext = {},
  verdictReasonMaxLen = 80,
): string[] {
  const lines: string[] = [];
  const statusWhy = buildJobWhy(job, reasonContext);
  const retryWhy = buildRetryWhy(job);
  const undoWhy = buildUndoWhy(job);

  lines.push(`Status: ${job.status} [${statusWhy.badge}]`);

  if (job.scope === 'phase') {
    const judge = buildJudgeSignal(job);
    const preview = judge.reason ? ` — ${truncate(judge.reason, verdictReasonMaxLen)}` : '';
    lines.push(`Verdict: ${judge.badge}${preview}`);
  }

  lines.push(`Retry: ${retryWhy.badge} — ${retryWhy.what}`);
  lines.push(`Undo: ${undoWhy.badge} — ${undoWhy.what}`);

  return lines;
}

function formatUsdEstimate(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return '<$0.01';
}

function shortModelName(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return 'unknown';
  const [, short] = trimmed.split('/');
  return short ?? trimmed;
}

function summarizeObservedModels(models: string[]): string {
  if (models.length === 0) return 'n/a';
  if (models.length <= 2) return models.map(shortModelName).join(', ');
  return `${shortModelName(models[0])}, ${shortModelName(models[1])}, +${models.length - 2}`;
}

export function buildTokenHeaderLine(
  snapshot: JobObservabilitySnapshot | null,
  fallbackTotal: number = 0,
  liveFallback: boolean = false,
): string {
  if (!snapshot) {
    if (fallbackTotal > 0) {
      return liveFallback
        ? `Tokens: live ${formatTokens(fallbackTotal)} tok (legacy)`
        : `Tokens: ${formatTokens(fallbackTotal)} tok (legacy)`;
    }
    return liveFallback ? 'Tokens: live unavailable' : 'Tokens: unavailable';
  }

  const totals = snapshot.tokens.totals;
  const live = !snapshot.terminal;
  if (!totals) {
    return `Tokens: ${live ? 'live unavailable' : 'unavailable'}`;
  }

  const statusPrefix = snapshot.tokens.status === 'available'
    ? ''
    : live
      ? 'live '
      : 'partial ';

  const hints: string[] = [];
  if (totals.input > 0) hints.push(`${formatTokens(totals.input)} in`);
  if (totals.output > 0) hints.push(`${formatTokens(totals.output)} out`);
  if (totals.reasoning > 0) hints.push(`${formatTokens(totals.reasoning)} reasoning`);
  if (totals.cacheRead > 0) hints.push(`${formatTokens(totals.cacheRead)} cache-r`);
  if (totals.cacheWrite > 0) hints.push(`${formatTokens(totals.cacheWrite)} cache-w`);
  const hintText = hints.length > 0 ? ` (${hints.slice(0, 3).join(' / ')})` : '';

  return `Tokens: ${statusPrefix}${formatTokens(totals.total)} tok${hintText}`;
}

export function buildActualHeaderLine(
  snapshot: JobObservabilitySnapshot | null,
  intendedModel: string | null,
  liveFallback: boolean = false,
): { line: string; mismatch: boolean } {
  if (!snapshot || snapshot.observed.models.length === 0) {
    return {
      line: `Actual: ${snapshot ? (!snapshot.terminal ? 'live unavailable' : 'unavailable') : liveFallback ? 'live unavailable' : 'unavailable'}`,
      mismatch: false,
    };
  }

  const live = !snapshot.terminal;
  const statusPrefix = snapshot.observed.status === 'available'
    ? ''
    : live
      ? 'live '
      : 'partial ';

  const mismatch = Boolean(
    intendedModel
    && snapshot.observed.models.length > 0
    && !snapshot.observed.models.includes(intendedModel),
  );

  return {
    line: `Actual: ${statusPrefix}${summarizeObservedModels(snapshot.observed.models)}${mismatch ? ' (MISMATCH)' : ''}`,
    mismatch,
  };
}

export function buildEstimatedCostHeaderLine(
  snapshot: JobObservabilitySnapshot | null,
  liveFallback: boolean = false,
): string {
  if (!snapshot) {
    return liveFallback ? 'Estimated cost: live unavailable' : 'Estimated cost: unavailable';
  }

  if (snapshot.cost.estimatedUsd === null) {
    return `Estimated cost: ${snapshot.terminal ? 'unavailable' : 'live unavailable'}`;
  }

  if (snapshot.cost.status === 'partial') {
    const caveat = snapshot.cost.notes[0]
      ? truncate(snapshot.cost.notes[0], 60)
      : 'incomplete pricing/token data';
    return `Estimated cost: ~${formatUsdEstimate(snapshot.cost.estimatedUsd)} est (partial; ${caveat})`;
  }

  return `Estimated cost: ~${formatUsdEstimate(snapshot.cost.estimatedUsd)} est`;
}

/**
 * Build an array of line strings representing the header for a job.
 * Used for testing header composition without a UI renderer.
 *
 * @param job - The job to build header for
 * @param cols - Terminal width (default 80)
 */
export function buildHeaderLines(
  job: Job,
  cols: number = 80,
  reasonContext: JobWhyContext = {},
  snapshot: JobObservabilitySnapshot | null = null,
): string[] {
  const descWidth = Math.max(20, cols - 4);
  const stepInfo = parseStepInfo(job);
  const startedStr = job.startedAt
    ? formatTime(new Date(job.startedAt).getTime())
    : '—';

  // Always resolve the executor model for display
  const models = resolveAllAgentModels(job.modelProfile, job.providerMode);
  const executorEntry = models['gsd-executor'];
  const executorModel = executorEntry?.model ?? '';
  const executorShort = executorModel.split('/')[1] ?? executorModel;

  const isLive = !TERMINAL_STATUSES.has(job.status);
  const tokenLine = buildTokenHeaderLine(snapshot, 0, isLive);
  const actualLine = buildActualHeaderLine(snapshot, executorModel, isLive).line;
  const estimateLine = buildEstimatedCostHeaderLine(snapshot, isLive);

  const lines = [
    `#${job.id}  ${job.project}  ${job.scope}  ${job.status}`,
    `"${truncate(job.description, descWidth)}"`,
    `separator`,
    `⏱ ${formatElapsed(job.startedAt)}   Step ${stepInfo.index}: ${stepInfo.label}`,
    tokenLine,
    `Requested: ${job.modelProfile}/${job.providerMode} -> ${executorShort}   Attempts: ${job.attempts}   Started: ${startedStr}`,
    actualLine,
    estimateLine,
    buildRecoveryHeader(job).line,
  ];

  lines.push(...buildTriageHeaderLines(job, reasonContext));
  lines.push(...buildReasonHeaderLines(job, reasonContext));

  return lines;
}

function countDescendants(sections: TimelineSection[]): number {
  const unique = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind === 'fork-card') {
        unique.add(item.sessionId);
      }
    }
  }
  return unique.size;
}

function getSessionTitle(job: Job): string {
  if (!job.sessionTitles) return '—';
  try {
    const titles = JSON.parse(job.sessionTitles) as string[];
    // Return the most relevant (non-delegation) title, or last one
    const execTitle = titles.find(t => !t.startsWith('pilot-delegate-'));
    return execTitle ?? titles[titles.length - 1] ?? '—';
  } catch { return '—'; }
}

// ── Step-first timeline formatting ───────────────────────────────────────

interface FormattedLine {
  text: string;
  color: string;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '—';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  if (mins < 1) return `${secs}s`;
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function timelineStatusColor(status: string): string {
  if (status === 'completed' || status === 'done') return statusColors.done;
  if (status === 'failed') return statusColors.failed;
  if (status === 'running' || status === 'active') return statusColors.running;
  return theme.muted;
}

function branchStatusColor(status: 'active' | 'done' | 'unknown'): string {
  if (status === 'done') return statusColors.done;
  if (status === 'active') return statusColors.running;
  return theme.muted;
}

export function formatStepSectionHeader(section: TimelineSection): string {
  if (section.stepIndex === null) {
    return '  ── Unattributed Activity ──';
  }
  if (section.command === 'delegation') {
    return `  ── Delegation [${section.status}] ──`;
  }
  return `  ── Step ${section.stepIndex + 1}: ${section.command} [${section.status}] ──`;
}

export function formatSectionModelLine(section: TimelineSection): string | null {
  const sectionModels = new Set<string>();
  for (const item of section.items) {
    if (item.kind === 'fork-card' && item.models) {
      for (const m of item.models) sectionModels.add(m);
    }
  }
  if (sectionModels.size === 0) return null;
  const modelStr = [...sectionModels].map(shortModelName).join(', ');
  return `     models: ${modelStr}`;
}

function formatTimelineItemLines(item: StepTimelineItem): FormattedLine[] {
  const time = formatTime(item.createdAt);

  if (item.kind === 'activity') {
    const content = item.text.replace(/\n/g, ' ');
    return [{
      text: `  ${time}  [${item.role}] ${content}`,
      color: item.role === 'user' ? '#4ADE80' : '#22D3EE',
    }];
  }

  if (item.kind === 'tool-summary') {
    const lines: FormattedLine[] = [
      {
        text: `  ${time}  [assistant] ${item.tool}${item.toolInput ? ` ${item.toolInput}` : ''}`,
        color: '#FACC15',
      },
    ];
    if (item.patchFiles && item.patchFiles.length > 0) {
      lines.push({
        text: `             files: ${item.patchFiles.join(', ')}`,
        color: theme.muted,
      });
    }
    return lines;
  }

  const preview = item.finalMessagePreview ?? item.latestMessagePreview;
  const modelSummary = item.models.length > 0
    ? item.models.map((model) => model.split('/')[1] ?? model).slice(0, 2).join(', ')
    : 'unknown-model';
  const childInfo = item.childCount > 0 ? `   children:${item.childCount}` : '';

  const lines: FormattedLine[] = [
    {
      text: `  ${time}  [branch] ${item.title || 'subagent'} [${item.status}] (sid:${item.sessionId.slice(0, 8)})`,
      color: branchStatusColor(item.status),
    },
    {
      text: `             msgs:${item.messageCount}   tok:${formatTokens(item.tokenTotal)}   dur:${formatDurationMs(item.durationMs)}   models:${modelSummary}${childInfo}`,
      color: theme.muted,
    },
  ];

  if (preview) {
    lines.push({
      text: `             preview: ${preview.replace(/\n/g, ' ')}`,
      color: '#22D3EE',
    });
  }

  return lines;
}

function mergeSectionItems(existing: StepTimelineItem[], incoming: StepTimelineItem[]): StepTimelineItem[] {
  const merged = [...existing];
  const keyToIndex = new Map<string, number>();

  for (let i = 0; i < merged.length; i += 1) {
    keyToIndex.set(getTimelineItemKey(merged[i]), i);
  }

  for (const item of incoming) {
    const key = getTimelineItemKey(item);
    const existingIndex = keyToIndex.get(key);
    if (existingIndex === undefined) {
      keyToIndex.set(key, merged.length);
      merged.push(item);
    } else {
      merged[existingIndex] = item;
    }
  }

  merged.sort((a, b) => a.createdAt - b.createdAt);
  return merged;
}

export function mergeTimelineSections(
  existing: TimelineSection[],
  incoming: TimelineSection[],
): TimelineSection[] {
  const merged: TimelineSection[] = [];
  const existingMap = new Map(existing.map((section) => [section.key, section]));

  for (const nextSection of incoming) {
    const prev = existingMap.get(nextSection.key);
    if (!prev) {
      merged.push(nextSection);
      continue;
    }

    merged.push({
      ...nextSection,
      items: mergeSectionItems(prev.items, nextSection.items),
    });
    existingMap.delete(nextSection.key);
  }

  for (const leftover of existingMap.values()) {
    merged.push(leftover);
  }

  merged.sort((a, b) => {
    if (a.stepIndex === null && b.stepIndex === null) return 0;
    if (a.stepIndex === null) return 1;
    if (b.stepIndex === null) return -1;
    return a.stepIndex - b.stepIndex;
  });

  return merged;
}

interface DetailChildOption {
  sessionId: string;
  parentSessionId: string;
  title: string;
  status: 'active' | 'done' | 'unknown';
  createdAt: number;
  updatedAt: number;
}

function collectBranchOptions(groups: TimelineSection[]): DetailChildOption[] {
  const bySessionId = new Map<string, DetailChildOption>();

  for (const group of groups) {
    for (const item of group.items) {
      if (item.kind !== 'fork-card') continue;
      const current: DetailChildOption = {
        sessionId: item.sessionId,
        parentSessionId: item.parentSessionId,
        title: item.title,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt ?? item.createdAt,
      };
      const existing = bySessionId.get(item.sessionId);
      if (!existing || current.updatedAt >= existing.updatedAt) {
        bySessionId.set(item.sessionId, current);
      }
    }
  }

  return [...bySessionId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function buildChildrenByParent(options: DetailChildOption[]): Map<string, DetailChildOption[]> {
  const grouped = new Map<string, DetailChildOption[]>();

  for (const option of options) {
    const list = grouped.get(option.parentSessionId) ?? [];
    list.push(option);
    grouped.set(option.parentSessionId, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt);
  }

  return grouped;
}

function resolveRootParents(options: DetailChildOption[]): Set<string> {
  const childIds = new Set(options.map((option) => option.sessionId));
  const roots = new Set<string>();

  for (const option of options) {
    if (!childIds.has(option.parentSessionId)) {
      roots.add(option.parentSessionId);
    }
  }

  return roots;
}

function resolveChildrenForPath(
  options: DetailChildOption[],
  childrenByParent: Map<string, DetailChildOption[]>,
  path: string[],
): DetailChildOption[] {
  if (path.length > 0) {
    return childrenByParent.get(path[path.length - 1]) ?? [];
  }

  const roots = resolveRootParents(options);
  const rootChildren = options.filter((option) => roots.has(option.parentSessionId));
  return rootChildren.length > 0 ? rootChildren : options;
}

function collectDescendantSessionIds(
  childrenByParent: Map<string, DetailChildOption[]>,
  rootSessionId: string,
): Set<string> {
  const allowed = new Set<string>([rootSessionId]);
  const queue = [rootSessionId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const children = childrenByParent.get(current) ?? [];
    for (const child of children) {
      if (allowed.has(child.sessionId)) continue;
      allowed.add(child.sessionId);
      queue.push(child.sessionId);
    }
  }

  return allowed;
}

function filterSectionsForPath(
  allSections: TimelineSection[],
  path: string[],
  childrenByParent: Map<string, DetailChildOption[]>,
): TimelineSection[] {
  if (path.length === 0) return allSections;

  const allowedSessionIds = collectDescendantSessionIds(childrenByParent, path[path.length - 1]);
  const scoped: TimelineSection[] = [];

  for (const section of allSections) {
    const items = section.items.filter((item) => {
      if (item.kind === 'fork-card') {
        return allowedSessionIds.has(item.sessionId) || allowedSessionIds.has(item.parentSessionId);
      }
      return allowedSessionIds.has(item.sessionId);
    });

    if (items.length === 0) continue;
    scoped.push({
      ...section,
      items,
    });
  }

  return scoped;
}

// ── Component ─────────────────────────────────────────────────────────────

export function DetailView(props: { state: PilotStateStore }) {
  const [sections, setSections] = createSignal<TimelineSection[]>([]);
  const [tick, setTick] = createSignal(0);
  const queueGraceSeconds = getConfig().queueGraceSeconds ?? 0;

  // ── Resolve the job from state ────────────────────────────────────────

  const job = (): Job | null => {
    const id = props.state.detailJobId();
    if (!id) return null;
    // Search running, queue, and completed
    const fromRunning = props.state.running().find(j => j.id === id);
    if (fromRunning) return fromRunning;
    const fromQueue = props.state.queue().find(j => j.id === id);
    if (fromQueue) return fromQueue;
    const fromCompleted = props.state.completed().find(j => j.id === id);
    if (fromCompleted) return fromCompleted;
    return null;
  };

  // ── Elapsed time ticker ───────────────────────────────────────────────

  let tickTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    tickTimer = setInterval(() => setTick(t => t + 1), 1000);
  });

  onCleanup(() => {
    if (tickTimer) clearInterval(tickTimer);
  });

  // ── Poller: fetch grouped timeline every 1s ───────────────────────────

  const partsPoller = createPoller(() => {
    const currentJob = job();
    if (!currentJob) return;

    const snapshot = fetchJobTimelineSnapshot(currentJob);
    const existing = sections();
    if (existing.length === 0) {
      setSections(snapshot.groups);
      return;
    }

    setSections(mergeTimelineSections(existing, snapshot.groups));

  }, 1000);

  onMount(() => {
    partsPoller.start();
  });

  onCleanup(() => {
    partsPoller.stop();
  });

  // ── Clear state when job changes ──────────────────────────────────────

  createEffect(on(() => props.state.detailJobId(), () => {
    setSections([]);
  }));

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderTimelineItems(items: StepTimelineItem[]) {
    return (
      <Show when={items.length > 0} fallback={
        <text content="  (no activity yet)" fg={theme.muted} />
      }>
        <For each={items}>
          {(item) => {
            const lines = formatTimelineItemLines(item);
            return (
              <box flexDirection="column">
                <For each={lines}>
                  {(line) => (
                    <text content={line.text} fg={line.color} />
                  )}
                </For>
              </box>
            );
          }}
        </For>
      </Show>
    );
  }

  const currentJob = () => job();

  const branchOptions = createMemo(() => collectBranchOptions(sections()));

  const childrenByParent = createMemo(() => buildChildrenByParent(branchOptions()));

  const pathContext = createMemo(() => props.state.detailSessionPath());

  const currentChildren = createMemo(() => resolveChildrenForPath(
    branchOptions(),
    childrenByParent(),
    pathContext(),
  ));

  const scopedSections = createMemo(() => filterSectionsForPath(
    sections(),
    pathContext(),
    childrenByParent(),
  ));

  const sessionLabelById = createMemo(() => {
    const labels = new Map<string, string>();
    for (const option of branchOptions()) {
      labels.set(option.sessionId, option.title || `session ${option.sessionId.slice(0, 8)}`);
    }
    return labels;
  });

  const selectedChild = createMemo(() => {
    const children = currentChildren();
    if (children.length === 0) return null;
    const index = Math.min(
      Math.max(props.state.detailSelectedChildIndex(), 0),
      children.length - 1,
    );
    return children[index] ?? null;
  });

  const contextPathText = createMemo(() => {
    const labels = ['job root'];
    for (const sessionId of pathContext()) {
      labels.push(sessionLabelById().get(sessionId) ?? `session ${sessionId.slice(0, 8)}`);
    }
    return labels.join(' > ');
  });

  createEffect(() => {
    props.state.setDetailChildren(currentChildren().map((child) => child.sessionId));
  });

  const reasonContext = (): JobWhyContext => {
    const current = currentJob();
    if (!current) return {};

    const blockedProject = props.state.projects().find(
      (project) => project.path === current.project && project.status === 'blocked',
    );

    const statusById = new Map<string, JobStatus>();
    for (const entry of props.state.queue()) {
      statusById.set(entry.id, entry.status);
    }
    for (const entry of props.state.running()) {
      statusById.set(entry.id, entry.status);
    }
    for (const entry of props.state.completed()) {
      statusById.set(entry.id, entry.status);
    }

    return {
      nowEpochSeconds: Math.floor(Date.now() / 1000),
      queueGraceSeconds,
      projectBlocked: Boolean(blockedProject),
      blockedReason: blockedProject?.blockedReason ?? null,
      dependencyStatus: current.dependsOn ? statusById.get(current.dependsOn) ?? null : null,
      hasRunningJobForProject: props.state.running().some(
        (entry) => entry.project === current.project && entry.id !== current.id,
      ),
    };
  };

  const reasonLines = () => {
    const current = currentJob();
    if (!current) return [];
    return buildReasonHeaderLines(current, reasonContext());
  };

  const triageLines = () => {
    const current = currentJob();
    if (!current) return [];
    return buildTriageHeaderLines(current, reasonContext());
  };

  function triageColor(line: string): string {
    if (line.startsWith('Verdict: judge:pass')) return statusColors.done;
    if (line.startsWith('Verdict: judge:fail')) return statusColors.failed;
    if (line.startsWith('Verdict: judge:doubt') || line.startsWith('Verdict: judge:inconclusive')) {
      return statusColors.warning;
    }
    if (line.startsWith('Retry: needs-revision')) return statusColors.failed;
    if (line.startsWith('Retry: retryable')) return statusColors.warning;
    if (line.startsWith('Undo: undo:safe')) return statusColors.done;
    if (line.startsWith('Undo: undo:guarded')) return statusColors.warning;
    return theme.muted;
  }

  const elapsed = () => {
    void tick();
    const j = currentJob();
    return j ? formatElapsed(j.startedAt) : '0s';
  };

  const observabilitySnapshot = (): JobObservabilitySnapshot | null => {
    const current = currentJob();
    if (!current) return null;
    return props.state.observabilitySnapshots().get(current.id) ?? null;
  };

  const intendedExecutorModel = (): string | null => {
    const current = currentJob();
    if (!current) return null;
    const models = resolveAllAgentModels(current.modelProfile, current.providerMode);
    return models['gsd-executor']?.model ?? null;
  };

  const fallbackTokenTotal = (): number => {
    const current = currentJob();
    if (!current) return 0;
    const title = getSessionTitle(current);
    const tokens = props.state.sessionTokens().get(title);
    if (!tokens) return 0;
    return tokens.input + tokens.output + (tokens.reasoning ?? 0) + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0);
  };

  const tokenLine = () => buildTokenHeaderLine(
    observabilitySnapshot(),
    fallbackTokenTotal(),
    !TERMINAL_STATUSES.has(currentJob()?.status ?? 'pending'),
  );

  const requestedLine = () => {
    const current = currentJob();
    if (!current) return '';
    const executorModel = intendedExecutorModel() ?? '';
    const executorShort = executorModel.split('/')[1] ?? executorModel;
    return `Requested: ${current.modelProfile}/${current.providerMode} -> ${executorShort}   Attempts: ${current.attempts}   Started: ${current.startedAt ? formatTime(new Date(current.startedAt).getTime()) : '—'}`;
  };

  const actualLine = () => buildActualHeaderLine(
    observabilitySnapshot(),
    intendedExecutorModel(),
    !TERMINAL_STATUSES.has(currentJob()?.status ?? 'pending'),
  );

  const estimatedLine = () => buildEstimatedCostHeaderLine(
    observabilitySnapshot(),
    !TERMINAL_STATUSES.has(currentJob()?.status ?? 'pending'),
  );

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show when={currentJob()} fallback={
        <box flexGrow={1}>
          <text content="  Job not found" fg={theme.muted} />
        </box>
      }>
        {/* Header: structured metadata panel — flexShrink={0} prevents collapse when activity grows */}
        <box flexDirection="column" paddingLeft={1} paddingRight={1} flexShrink={0}>
          {/* Line 1: #id  project  scope  status */}
          <box flexDirection="row">
            <text
              content={`#${currentJob()!.id}  ${currentJob()!.project}  ${currentJob()!.scope}  `}
              fg={theme.fg}
            />
            <text
              content={currentJob()!.status}
              fg={statusColor(currentJob()!.status)}
            />
          </box>
          {/* Line 2: "description" */}
          <text
            content={`"${truncate(currentJob()!.description, 80)}"`}
            fg={theme.fg}
          />
          {/* Line 3: separator */}
          <text content="────────────────────────────────────────────────────────────────────────────" fg={theme.border} />
          {/* Line 4: elapsed + step */}
          <box flexDirection="row">
            <text content={`⏱ ${elapsed()}`} fg={theme.muted} />
            <text content={`   Step ${parseStepInfo(currentJob()!).index}: ${parseStepInfo(currentJob()!).label}`} fg={theme.muted} />
          </box>
          {/* Line 5: token totals + breakdown hints */}
          <text content={tokenLine()} fg={theme.muted} />
          {/* Line 6: requested lane/model + attempts */}
          <text content={requestedLine()} fg={theme.muted} />
          {/* Line 7: actual observed models (with mismatch signal) */}
          <text
            content={actualLine().line}
            fg={actualLine().mismatch ? '#FACC15' : theme.muted}
          />
          {/* Line 8: estimated cost (with caveats when partial) */}
          <text
            content={estimatedLine()}
            fg={estimatedLine().includes('partial') ? '#F59E0B' : theme.muted}
          />
          {/* Line 9: recovery safety + checkpoint commits */}
          <text
            content={buildRecoveryHeader(currentJob()!).line}
            fg={(() => {
              const state = buildRecoveryHeader(currentJob()!).state;
              if (state === 'guarded') return '#FACC15';
              if (state === 'unavailable') return '#F59E0B';
              return theme.muted;
            })()}
          />
          <For each={triageLines()}>
            {(line) => <text content={line} fg={triageColor(line)} />}
          </For>
          <For each={reasonLines()}>
            {(line) => <text content={line} fg={theme.muted} />}
          </For>
          {/* Line 10: session title */}
          <text
            content={`Session: ${truncate(getSessionTitle(currentJob()!), 80)}`}
            fg={theme.muted}
          />
          <text
            content={`Context: ${truncate(contextPathText(), 120)}`}
            fg={theme.muted}
          />
          <Show when={currentChildren().length > 0} fallback={
            <text content="Child drill-in: no child sessions in this context" fg={theme.muted} />
          }>
            <text
              content={`Child drill-in: j/k select | Enter open | Esc/Backspace ${pathContext().length > 0 ? 'up one level' : 'back to dashboard'}`}
              fg={theme.muted}
            />
            <For each={currentChildren()}>
              {(child, index) => {
                const selected = index() === props.state.detailSelectedChildIndex();
                return (
                  <text
                    content={`${selected ? '  >' : '   '} [${child.status}] ${truncate(child.title || 'child session', 52)} (${child.sessionId.slice(0, 8)})`}
                    fg={selected ? statusColors.running : theme.muted}
                  />
                );
              }}
            </For>
            <Show when={selectedChild()}>
              <text
                content={`Selected child: ${selectedChild()!.sessionId.slice(0, 8)} (${selectedChild()!.status})`}
                fg={theme.muted}
              />
            </Show>
          </Show>
          {/* Line 11: descendant count (only when > 0) */}
          <Show when={countDescendants(scopedSections()) > 0}>
            <text
              content={`Descendants: ${countDescendants(scopedSections())} subagent ${countDescendants(scopedSections()) === 1 ? 'session' : 'sessions'}`}
              fg={theme.muted}
            />
          </Show>
          {/* Line 12: separator */}
          <text content="────────────────────────────────────────────────────────────────────────────" fg={theme.border} />
        </box>

        {/* Activity stream: scrollable */}
        <box flexGrow={1}>
          <Scrollable follow={true}>
            <For each={scopedSections()}>
              {(section) => {
                const modelLine = formatSectionModelLine(section);
                return (
                  <box flexDirection="column">
                    <text
                      content={formatStepSectionHeader(section)}
                      fg={timelineStatusColor(section.status)}
                    />
                    <Show when={modelLine}>
                      <text content={modelLine!} fg={theme.muted} />
                    </Show>
                    {renderTimelineItems(section.items)}
                  </box>
                );
              }}
            </For>
            <Show when={scopedSections().length === 0}>
              <text
                content={pathContext().length > 0
                  ? '  No activity in this child context yet...'
                  : '  Waiting for session to start...'}
                fg={theme.muted}
              />
            </Show>
          </Scrollable>
        </box>
      </Show>
    </box>
  );
}
