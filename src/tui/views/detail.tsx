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

import { createSignal, createEffect, on, onMount, onCleanup, For, Show } from 'solid-js';
import { createPoller } from '../data/poller.js';
import { fetchJobParts } from '../data/opencode-db.js';
import type { SessionSection } from '../data/opencode-db.js';
import { fetchSessionEnrichment } from '../data/opencode-db.js';
import { Scrollable } from '../widgets/scrollable.js';
import { statusColors, theme } from '../theme.js';
import { formatTokens } from '../components/running-panel.js';
import type { PilotStateStore } from '../state.js';
import type { Job, SessionPart, DelegationPlan } from '../../core/types.js';

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

export function parseStepInfo(job: Job): { label: string; index: string } {
  if (!job.delegationPlan) return { label: '—', index: '—' };
  try {
    const plan = JSON.parse(job.delegationPlan) as DelegationPlan;
    const step = plan.steps[job.currentStep];
    const total = plan.steps.length;
    const label = step ? `${step.command} "${truncate(step.args, 20)}"` : '—';
    const index = `${job.currentStep + 1}/${total}`;
    return { label, index };
  } catch { return { label: '—', index: '—' }; }
}

/**
 * Build an array of line strings representing the header for a job.
 * Used for testing header composition without a UI renderer.
 *
 * @param job - The job to build header for
 * @param cols - Terminal width (default 80)
 */
export function buildHeaderLines(job: Job, cols: number = 80): string[] {
  const descWidth = Math.max(20, cols - 4);
  const stepInfo = parseStepInfo(job);
  const startedStr = job.startedAt
    ? formatTime(new Date(job.startedAt).getTime())
    : '—';

  return [
    `#${job.id}  ${job.project}  ${job.scope}  ${job.status}`,
    `"${truncate(job.description, descWidth)}"`,
    `separator`,
    `⏱ ${formatElapsed(job.startedAt)}   Step ${stepInfo.index}: ${stepInfo.label}   ◆ tokens`,
    `Model: ${job.modelProfile}/${job.providerMode}   Attempts: ${job.attempts}/${job.maxAttempts}   Started: ${startedStr}`,
  ];
}

function countDescendants(sections: import('../data/opencode-db.js').SessionSection[]): number {
  let count = 0;
  for (const section of sections) {
    if (section.type === 'subagent') {
      count++;
      if (section.children) {
        count += section.children.filter(c => c.type === 'subagent').length;
      }
    }
  }
  return count;
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

// ── Part formatting ───────────────────────────────────────────────────────

interface FormattedLine {
  text: string;
  color: string;
}

/**
 * Format a single session part into display lines.
 * Returns null for parts that should be skipped (reasoning, step-start/step-finish).
 */
function formatPartLines(part: SessionPart): FormattedLine[] | null {
  const time = formatTime(part.createdAt);

  if (part.type === 'tool') {
    const tool = part.tool ?? 'unknown';
    const lines: FormattedLine[] = [];

    if (tool === 'bash') {
      const cmd = (part.toolInput ?? '').slice(0, 120);
      lines.push({ text: `  ${time}  [assistant] bash $ ${cmd}`, color: '#FACC15' }); // yellow
      if (part.toolOutput) {
        const output = part.toolOutput.slice(0, 120).replace(/\n/g, ' ');
        if (output.trim()) {
          lines.push({ text: `             -> ${output}`, color: theme.muted });
        }
      }
    } else if (tool === 'read' || tool === 'write' || tool === 'edit') {
      lines.push({ text: `  ${time}  [assistant] ${tool} ${part.toolInput ?? ''}`, color: '#FACC15' });
    } else if (tool === 'glob' || tool === 'grep') {
      const input = (part.toolInput ?? '').slice(0, 80);
      lines.push({ text: `  ${time}  [assistant] ${tool} ${input}`, color: '#FACC15' });
    } else {
      const input = (part.toolInput ?? '').slice(0, 80);
      lines.push({ text: `  ${time}  [assistant] ${tool} ${input}`, color: '#FACC15' });
    }
    return lines;
  }

  if (part.type === 'text') {
    const text = part.text ?? '';
    if (!text.trim()) return null;

    const content = text.slice(0, 200).replace(/\n/g, ' ');
    if (part.role === 'user') {
      return [{ text: `  ${time}  [user] ${content}`, color: '#4ADE80' }]; // green
    }
    return [{ text: `  ${time}  [assistant] ${content}`, color: '#22D3EE' }]; // cyan
  }

  if (part.type === 'patch') {
    const files = part.patchFiles?.join(', ') ?? 'unknown';
    return [{ text: `  ${time}  [assistant] patch ${files}`, color: '#4ADE80' }]; // green
  }

  // reasoning, step-start, step-finish — skip
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────

export function DetailView(props: { state: PilotStateStore }) {
  const [sections, setSections] = createSignal<SessionSection[]>([]);
  const [totalTokens, setTotalTokens] = createSignal(0);
  const [tick, setTick] = createSignal(0);

  // Track last-seen timestamp per session for incremental fetches
  const lastSeenMap = new Map<string, number>();

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

  // ── Poller: fetch parts every 1s ──────────────────────────────────────

  const partsPoller = createPoller(() => {
    const currentJob = job();
    if (!currentJob) return;

    // On first call (no sections yet), do a full fetch
    const existing = sections();
    if (existing.length === 0) {
      const allSections = fetchJobParts(currentJob);
      setSections(allSections);

      // Seed lastSeenMap from fetched parts
      for (const section of allSections) {
        if (section.parts.length > 0) {
          lastSeenMap.set(section.title, section.parts[section.parts.length - 1].createdAt);
        }
      }
    } else {
      // Incremental fetch: only new parts since last seen
      const updated = fetchJobParts(currentJob);
      // Merge new parts into existing sections
      const merged: SessionSection[] = [];
      const existingMap = new Map(existing.map(s => [s.title, s]));

      for (const newSection of updated) {
        const existingSection = existingMap.get(newSection.title);
        const since = lastSeenMap.get(newSection.title);

        if (!existingSection) {
          // Brand new session
          merged.push(newSection);
          if (newSection.parts.length > 0) {
            lastSeenMap.set(newSection.title, newSection.parts[newSection.parts.length - 1].createdAt);
          }
        } else {
          // Filter to only genuinely new parts
          const newParts = since !== undefined
            ? newSection.parts.filter(p => p.createdAt > since)
            : newSection.parts;

          if (newParts.length > 0) {
            merged.push({
              ...existingSection,
              parts: [...existingSection.parts, ...newParts],
              children: newSection.children,  // refresh children from latest fetch
            });
            lastSeenMap.set(newSection.title, newParts[newParts.length - 1].createdAt);
          } else {
            merged.push({ ...existingSection, children: newSection.children });
          }
        }
        existingMap.delete(newSection.title);
      }
      // Keep any sections that disappeared from updated (shouldn't happen, but safe)
      for (const [, leftover] of existingMap) {
        merged.push(leftover);
      }

      setSections(merged);
    }

    // Update token count
    try {
      let titles: string[] = [];
      if (currentJob.sessionTitles) {
        titles = JSON.parse(currentJob.sessionTitles) as string[];
      }
      if (titles.length > 0) {
        const { tokens } = fetchSessionEnrichment(titles);
        let total = 0;
        for (const [, t] of tokens) {
          total += t.input + t.output;
        }
        setTotalTokens(total);
      }
    } catch {
      // ignore
    }
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
    setTotalTokens(0);
    lastSeenMap.clear();
  }));

  // ── Render ────────────────────────────────────────────────────────────

  const currentJob = () => job();

  const elapsed = () => {
    void tick();
    const j = currentJob();
    return j ? formatElapsed(j.startedAt) : '0s';
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show when={currentJob()} fallback={
        <box flexGrow={1}>
          <text content="  Job not found" fg={theme.muted} />
        </box>
      }>
        {/* Header: structured metadata panel */}
        <box flexDirection="column" paddingLeft={1} paddingRight={1}>
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
          {/* Line 4: elapsed + step + tokens */}
          <box flexDirection="row">
            <text content={`⏱ ${elapsed()}`} fg={theme.muted} />
            <text content={`   Step ${parseStepInfo(currentJob()!).index}: ${parseStepInfo(currentJob()!).label}`} fg={theme.muted} />
            <text content={`   ◆ ${formatTokens(totalTokens())} tokens`} fg={theme.muted} />
          </box>
          {/* Line 5: model + attempts + started */}
          <box flexDirection="row">
            <text content={`Model: ${currentJob()!.modelProfile}/${currentJob()!.providerMode}`} fg={theme.muted} />
            <text content={`   Attempts: ${currentJob()!.attempts}/${currentJob()!.maxAttempts}`} fg={theme.muted} />
            <text
              content={`   Started: ${currentJob()!.startedAt ? formatTime(new Date(currentJob()!.startedAt!).getTime()) : '—'}`}
              fg={theme.muted}
            />
          </box>
          {/* Line 6: session title */}
          <text
            content={`Session: ${truncate(getSessionTitle(currentJob()!), 80)}`}
            fg={theme.muted}
          />
          {/* Line 7: descendant count (only when > 0) */}
          <Show when={countDescendants(sections()) > 0}>
            <text
              content={`Descendants: ${countDescendants(sections())} subagent ${countDescendants(sections()) === 1 ? 'session' : 'sessions'}`}
              fg={theme.muted}
            />
          </Show>
          {/* Line 8: separator */}
          <text content="────────────────────────────────────────────────────────────────────────────" fg={theme.border} />
        </box>

        {/* Activity stream: scrollable */}
        <box flexGrow={1}>
          <Scrollable follow={true}>
            <For each={sections()}>
              {(section) => (
                <box flexDirection="column">
                  {/* Section header */}
                  <text
                    content={section.type === 'delegation'
                      ? `  ── Delegation ──`
                      : section.type === 'subagent'
                        ? `  ── Subagent: ${section.agentType ?? 'subagent'} ──`
                        : `  ── Execution: ${section.command ?? 'unknown'} ──`}
                    fg={section.type === 'subagent' ? theme.border : theme.muted}
                  />
                  {/* Parts */}
                  <Show when={section.parts.length > 0} fallback={
                    <text content="  (no activity yet)" fg={theme.muted} />
                  }>
                    <For each={section.parts}>
                      {(part) => {
                        const lines = formatPartLines(part);
                        if (!lines) return null;
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
                  {/* Child sections (subagent tasks) */}
                  <Show when={section.children && section.children.length > 0}>
                    <For each={section.children ?? []}>
                      {(child) => (
                        <box flexDirection="column" paddingLeft={2}>
                          {/* Child section header */}
                          <text
                            content={child.type === 'delegation'
                              ? `  ── Delegation ──`
                              : child.type === 'subagent'
                                ? `  ── Subagent: ${child.agentType ?? 'subagent'} ──`
                                : `  ── Execution: ${child.command ?? 'unknown'} ──`}
                            fg={theme.border}
                          />
                          {/* Child parts */}
                          <Show when={child.parts.length > 0} fallback={
                            <text content="    (no activity yet)" fg={theme.muted} />
                          }>
                            <For each={child.parts}>
                              {(part) => {
                                const lines = formatPartLines(part);
                                if (!lines) return null;
                                return (
                                  <box flexDirection="column">
                                    <For each={lines}>
                                      {(line) => (
                                        <text content={`  ${line.text}`} fg={line.color} />
                                      )}
                                    </For>
                                  </box>
                                );
                              }}
                            </For>
                          </Show>
                          {/* Grandchild sections (level 2, no further recursion) */}
                          <Show when={child.children && child.children.length > 0}>
                            <For each={child.children ?? []}>
                              {(grandchild) => (
                                <box flexDirection="column" paddingLeft={2}>
                                  <text
                                    content={grandchild.type === 'delegation'
                                      ? `    ── Delegation ──`
                                      : grandchild.type === 'subagent'
                                        ? `    ── Subagent: ${grandchild.agentType ?? 'subagent'} ──`
                                        : `    ── Execution: ${grandchild.command ?? 'unknown'} ──`}
                                    fg={theme.border}
                                  />
                                  <Show when={grandchild.parts.length > 0} fallback={
                                    <text content="      (no activity yet)" fg={theme.muted} />
                                  }>
                                    <For each={grandchild.parts}>
                                      {(part) => {
                                        const lines = formatPartLines(part);
                                        if (!lines) return null;
                                        return (
                                          <box flexDirection="column">
                                            <For each={lines}>
                                              {(line) => (
                                                <text content={`    ${line.text}`} fg={line.color} />
                                              )}
                                            </For>
                                          </box>
                                        );
                                      }}
                                    </For>
                                  </Show>
                                </box>
                              )}
                            </For>
                          </Show>
                        </box>
                      )}
                    </For>
                  </Show>
                </box>
              )}
            </For>
            <Show when={sections().length === 0}>
              <text content="  Waiting for session to start..." fg={theme.muted} />
            </Show>
          </Scrollable>
        </box>
      </Show>
    </box>
  );
}
