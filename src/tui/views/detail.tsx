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
import { statusColors, theme, subagentColors } from '../theme.js';
import { formatTokens } from '../components/running-panel.js';
import { resolveAllAgentModels } from '../../core/models.js';
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
    const index = `${Math.min(job.currentStep + 1, total)}/${total}`;
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

  // Always resolve the executor model for display
  const models = resolveAllAgentModels(job.modelProfile, job.providerMode);
  const executorEntry = models['gsd-executor'];
  const executorModel = executorEntry?.model ?? '';
  const executorShort = executorModel.split('/')[1] ?? executorModel;

  const lines = [
    `#${job.id}  ${job.project}  ${job.scope}  ${job.status}`,
    `"${truncate(job.description, descWidth)}"`,
    `separator`,
    `⏱ ${formatElapsed(job.startedAt)}   Step ${stepInfo.index}: ${stepInfo.label}   ◆ tokens`,
    `Model: ${job.modelProfile}/${job.providerMode} → ${executorShort}   Attempts: ${job.attempts}   Started: ${startedStr}`,
  ];

  if (job.actualModels && job.actualModels.length > 0) {
    const actualStr = job.actualModels.join(', ');
    const resolvedExecutor = executorModel;
    const hasMismatch = !job.actualModels.some(m => m === resolvedExecutor);
    if (hasMismatch) {
      lines.push(`Actual: ${actualStr} (MISMATCH)`);
    } else {
      lines.push(`Actual: ${actualStr}`);
    }
  }

  if (job.modelProfile !== 'balanced') {
    const uniqueModels = new Map<string, string>();
    for (const [, entry] of Object.entries(models)) {
      const m = entry.model;
      const shortName = m.split('/')[1] ?? m;
      uniqueModels.set(shortName, m);
    }
    lines.push(`Models: ${[...uniqueModels.keys()].join('  ')}`);
  }

  return lines;
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
      const cmd = part.toolInput ?? '';
      lines.push({ text: `  ${time}  [assistant] bash $ ${cmd}`, color: '#FACC15' }); // yellow
      if (part.toolOutput) {
        const output = part.toolOutput.replace(/\n/g, ' ');
        if (output.trim()) {
          lines.push({ text: `             -> ${output}`, color: theme.muted });
        }
      }
    } else if (tool === 'read' || tool === 'write' || tool === 'edit') {
      lines.push({ text: `  ${time}  [assistant] ${tool} ${part.toolInput ?? ''}`, color: '#FACC15' });
    } else if (tool === 'glob' || tool === 'grep') {
      const input = part.toolInput ?? '';
      lines.push({ text: `  ${time}  [assistant] ${tool} ${input}`, color: '#FACC15' });
    } else {
      const input = part.toolInput ?? '';
      lines.push({ text: `  ${time}  [assistant] ${tool} ${input}`, color: '#FACC15' });
    }
    return lines;
  }

  if (part.type === 'text') {
    const text = part.text ?? '';
    if (!text.trim()) return null;

    const content = text.replace(/\n/g, ' ');
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

    // Update token count (recursive — includes subagent tokens and reasoning)
    try {
      let titles: string[] = [];
      if (currentJob.sessionTitles) {
        titles = JSON.parse(currentJob.sessionTitles) as string[];
      }
      if (titles.length > 0) {
        const { tokens } = fetchSessionEnrichment(titles);
        let total = 0;
        for (const [, t] of tokens) {
          total += t.input + t.output + (t.reasoning ?? 0);
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

  // ── Render helpers ─────────────────────────────────────────────────────

  /** Render parts list with no indentation prefix. */
  function renderParts(parts: SessionPart[]) {
    return (
      <Show when={parts.length > 0} fallback={
        <text content="  (no activity yet)" fg={theme.muted} />
      }>
        <For each={parts}>
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
    );
  }

  /** Render parts for child sections (2-space indent). */
  function renderChildParts(parts: SessionPart[]) {
    return (
      <Show when={parts.length > 0} fallback={
        <text content="    (no activity yet)" fg={theme.muted} />
      }>
        <For each={parts}>
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
    );
  }

  /** Render parts for grandchild sections (4-space indent). */
  function renderGrandchildParts(parts: SessionPart[]) {
    return (
      <Show when={parts.length > 0} fallback={
        <text content="      (no activity yet)" fg={theme.muted} />
      }>
        <For each={parts}>
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
    );
  }

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
          {/* Line 4: elapsed + step + tokens */}
          <box flexDirection="row">
            <text content={`⏱ ${elapsed()}`} fg={theme.muted} />
            <text content={`   Step ${parseStepInfo(currentJob()!).index}: ${parseStepInfo(currentJob()!).label}`} fg={theme.muted} />
            <text content={`   ◆ ${formatTokens(totalTokens())} tokens`} fg={theme.muted} />
          </box>
          {/* Line 5: model (always show resolved executor) + attempts + started */}
          <box flexDirection="row">
            <text content={(() => {
              const j = currentJob()!;
              const models = resolveAllAgentModels(j.modelProfile, j.providerMode);
              const executorEntry = models['gsd-executor'];
              const executorModel = executorEntry?.model ?? '';
              const executorShort = executorModel.split('/')[1] ?? executorModel;
              return `Model: ${j.modelProfile}/${j.providerMode} → ${executorShort}`;
            })()} fg={theme.muted} />
            <text content={`   Attempts: ${currentJob()!.attempts}`} fg={theme.muted} />
            <text
              content={`   Started: ${currentJob()!.startedAt ? formatTime(new Date(currentJob()!.startedAt!).getTime()) : '—'}`}
              fg={theme.muted}
            />
          </box>
          {/* Line 5b: actual model (when available, from opencode DB) */}
          <Show when={currentJob()!.actualModels !== null && (currentJob()!.actualModels?.length ?? 0) > 0}>
            <text
              content={(() => {
                const j = currentJob()!;
                const actualStr = j.actualModels!.join(', ');
                const models = resolveAllAgentModels(j.modelProfile, j.providerMode);
                const resolvedExecutor = models['gsd-executor']?.model ?? '';
                const hasMismatch = !j.actualModels!.some(m => m === resolvedExecutor);
                return hasMismatch
                  ? `Actual: ${actualStr} (MISMATCH)`
                  : `Actual: ${actualStr}`;
              })()}
              fg={(() => {
                const j = currentJob()!;
                const models = resolveAllAgentModels(j.modelProfile, j.providerMode);
                const resolvedExecutor = models['gsd-executor']?.model ?? '';
                const hasMismatch = !j.actualModels!.some(m => m === resolvedExecutor);
                return hasMismatch ? '#FACC15' : theme.muted; // yellow for mismatch, muted for match
              })()}
            />
          </Show>
          {/* Line 5c: resolved models (only for non-default profiles) */}
          <Show when={currentJob()!.modelProfile !== 'balanced'}>
            <text
              content={(() => {
                const models = resolveAllAgentModels(currentJob()!.modelProfile, currentJob()!.providerMode);
                const uniqueModels = new Map<string, string>();
                for (const [, entry] of Object.entries(models)) {
                  const shortName = entry.model.split('/')[1] ?? entry.model;
                  uniqueModels.set(shortName, entry.model);
                }
                return `Models: ${[...uniqueModels.keys()].join('  ')}`;
              })()}
              fg={theme.muted}
            />
          </Show>
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
                  <Show when={section.type === 'subagent'} fallback={
                    <>
                      {/* Delegation/Execution: plain text header (the "spine") */}
                      <text
                        content={section.type === 'delegation'
                          ? `  ── Delegation ──`
                          : section.type === 'verify'
                          ? `  ── Verification ──`
                          : `  ── Execution: ${section.command ?? 'unknown'} ──`}
                        fg={theme.muted}
                      />
                      {renderParts(section.parts)}
                    </>
                  }>
                    {/* Subagent: bordered box (the "branches") */}
                    <box
                      borderStyle="rounded"
                      border={true}
                      borderColor={subagentColors.border}
                      marginLeft={1}
                      marginTop={1}
                      flexDirection="column"
                      focusable={false}
                    >
                      <text content={` ${section.agentType ?? 'subagent'} `} fg={subagentColors.header} />
                      {renderParts(section.parts)}
                    </box>
                  </Show>
                  {/* Child sections */}
                  <Show when={section.children && section.children.length > 0}>
                    <For each={section.children ?? []}>
                      {(child) => (
                        <box flexDirection="column">
                          <Show when={child.type === 'subagent'} fallback={
                            <box flexDirection="column" paddingLeft={2}>
                              <text
                                content={child.type === 'delegation'
                                  ? `  ── Delegation ──`
                                  : `  ── Execution: ${child.command ?? 'unknown'} ──`}
                                fg={theme.muted}
                              />
                              {renderChildParts(child.parts)}
                            </box>
                          }>
                            {/* Child subagent: lighter bordered box, indented */}
                            <box
                              borderStyle="single"
                              border={true}
                              borderColor={subagentColors.borderChild}
                              marginLeft={3}
                              marginTop={1}
                              flexDirection="column"
                              focusable={false}
                            >
                              <text content={` ${child.agentType ?? 'subagent'} `} fg={subagentColors.headerChild} />
                              {renderChildParts(child.parts)}
                            </box>
                          </Show>
                          {/* Grandchild sections (level 2, no further recursion) */}
                          <Show when={child.children && child.children.length > 0}>
                            <For each={child.children ?? []}>
                              {(grandchild) => (
                                <box flexDirection="column">
                                  <Show when={grandchild.type === 'subagent'} fallback={
                                    <box flexDirection="column" paddingLeft={4}>
                                      <text
                                        content={grandchild.type === 'delegation'
                                          ? `    ── Delegation ──`
                                          : `    ── Execution: ${grandchild.command ?? 'unknown'} ──`}
                                        fg={theme.muted}
                                      />
                                      {renderGrandchildParts(grandchild.parts)}
                                    </box>
                                  }>
                                    {/* Grandchild subagent: dimmest bordered box */}
                                    <box
                                      borderStyle="single"
                                      border={true}
                                      borderColor={subagentColors.borderGrandchild}
                                      marginLeft={5}
                                      marginTop={1}
                                      flexDirection="column"
                                      focusable={false}
                                    >
                                      <text content={` ${grandchild.agentType ?? 'subagent'} `} fg={subagentColors.headerGrandchild} />
                                      {renderGrandchildParts(grandchild.parts)}
                                    </box>
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
