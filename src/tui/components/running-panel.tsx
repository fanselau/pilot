/**
 * RunningPanel — active job cards with live stats.
 *
 * Each running job gets a card-like display showing a pulsing dot,
 * elapsed time (updating every 1s), token count, session title,
 * and last message preview.
 */

/* @jsxImportSource @opentui/solid */

import { For, createSignal, onMount, onCleanup } from 'solid-js';
import { PulseDot } from '../widgets/pulse-dot.js';
import { Scrollable } from '../widgets/scrollable.js';
import { statusColors, theme } from '../theme.js';
import type { Job, JobObservabilitySnapshot } from '../../core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return '<$0.01';
}

function shortModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return 'unknown';
  const [, name] = trimmed.split('/');
  return name ?? trimmed;
}

export function summarizeObservedModels(models: string[]): string {
  if (models.length === 0) return 'n/a';
  if (models.length === 1) return shortModel(models[0]);
  return `${shortModel(models[0])} +${models.length - 1}`;
}

export interface ObservabilityCues {
  tokenLabel: string;
  costLabel: string;
  modelLabel: string;
  flags: string[];
}

export function buildObservabilityCues(
  snapshot: JobObservabilitySnapshot | null,
  liveFallback: boolean,
): ObservabilityCues {
  const live = snapshot ? !snapshot.terminal : liveFallback;

  if (!snapshot) {
    return {
      tokenLabel: live ? 'tok live:n/a' : 'tok n/a',
      costLabel: 'cost n/a',
      modelLabel: live ? 'model live:n/a' : 'model n/a',
      flags: [],
    };
  }

  const total = snapshot.tokens.totals?.total ?? null;
  const tokenPrefix = snapshot.tokens.status === 'available'
    ? 'tok'
    : live
      ? 'tok live'
      : 'tok partial';
  const tokenLabel = total === null
    ? (live ? 'tok live:n/a' : 'tok n/a')
    : `${tokenPrefix}:${formatTokens(total)}`;

  const modelSummary = summarizeObservedModels(snapshot.observed.models);
  const modelPrefix = snapshot.observed.status === 'available'
    ? 'model'
    : live
      ? 'model live'
      : 'model partial';
  const modelLabel = modelSummary === 'n/a'
    ? (live ? 'model live:n/a' : 'model n/a')
    : `${modelPrefix}:${modelSummary}`;

  let costLabel = 'cost n/a';
  if (snapshot.cost.estimatedUsd !== null) {
    if (snapshot.cost.status === 'estimated') {
      costLabel = `~${formatUsd(snapshot.cost.estimatedUsd)} est`;
    } else if (snapshot.cost.status === 'partial') {
      costLabel = `~${formatUsd(snapshot.cost.estimatedUsd)} est*`;
    }
  }

  const flags: string[] = [];
  const intended = snapshot.requested.intendedExecutorModel;
  if (intended && snapshot.observed.models.length > 0 && !snapshot.observed.models.includes(intended)) {
    flags.push('mismatch');
  }
  if (snapshot.observed.models.length > 1) {
    flags.push('multi-model');
  }
  if (snapshot.cost.estimatedUsd !== null && snapshot.cost.estimatedUsd >= 1) {
    flags.push('high-cost');
  }
  if (snapshot.tokens.totals && snapshot.tokens.totals.total >= 1_000_000) {
    flags.push('high-tok');
  }

  return {
    tokenLabel,
    costLabel,
    modelLabel,
    flags,
  };
}

export function formatObservabilityLine(cues: ObservabilityCues): string {
  const base = `${cues.tokenLabel}  ${cues.costLabel}  ${cues.modelLabel}`;
  if (cues.flags.length === 0) return base;
  return `${base}  !${cues.flags.slice(0, 2).join(',')}`;
}

function formatElapsed(startedAt: string | null): string {
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

function getSessionTitle(job: Job): string | null {
  if (!job.sessionTitles) return null;
  try {
    const titles = JSON.parse(job.sessionTitles) as string[];
    return titles.length > 0 ? titles[titles.length - 1] : null;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function RunningPanel(props: {
  jobs: Job[];
  selectedIndex: number;
  focused: boolean;
  observabilitySnapshots: Map<string, JobObservabilitySnapshot>;
  sessionTokens: Map<string, { input: number; output: number; reasoning?: number; cacheRead?: number; cacheWrite?: number }>;
  lastMessages: Map<string, string>;
}) {
  // Tick signal to force elapsed time re-computation every second
  const [tick, setTick] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => setTick(t => t + 1), 1000);
  });

  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  return (
    <box
      borderStyle="rounded"
      border={true}
      borderColor={props.focused ? statusColors.running : theme.border}
      title=" Running "
      flexGrow={1}
      flexDirection="column"
    >
      <Scrollable>
        <For each={props.jobs}>
          {(job, i) => {
            const selected = () => props.focused && i() === props.selectedIndex;
            const sessionTitle = () => getSessionTitle(job);

            const tokens = () => {
              const title = sessionTitle();
              if (!title) return null;
              return props.sessionTokens.get(title) ?? null;
            };

            const totalTokens = () => {
              const t = tokens();
              return t ? t.input + t.output + (t.reasoning ?? 0) : 0;
            };

            const lastMsg = () => {
              const title = sessionTitle();
              if (!title) return null;
              return props.lastMessages.get(title) ?? null;
            };

            const observabilityLine = () => {
              const snapshot = props.observabilitySnapshots.get(job.id) ?? null;
              const cues = buildObservabilityCues(snapshot, true);

              if (!snapshot) {
                const fallbackTotal = totalTokens();
                if (fallbackTotal > 0) {
                  cues.tokenLabel = `tok live:${formatTokens(fallbackTotal)}`;
                }
              }

              return formatObservabilityLine(cues);
            };

            // Use tick() to force reactivity on elapsed time
            const elapsed = () => {
              void tick();
              return formatElapsed(job.startedAt);
            };

            return (
              <box
                backgroundColor={selected() ? theme.highlight : undefined}
                flexDirection="column"
                paddingBottom={1}
              >
                {/* Line 1: ● #id  project  scope  [profile] */}
                <box flexDirection="row">
                  <PulseDot active={true} />
                  <text
                    content={` #${job.id}  ${job.project}  ${job.scope}${job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : ''}`}
                    fg={statusColors.running}
                  />
                </box>
                {/* Line 2: "description" */}
                <text
                  content={`  "${truncate(job.description, 40)}"`}
                  fg={theme.fg}
                />
                {/* Line 3: ⏱ elapsed  ◆ tokens */}
                <text
                  content={`  ⏱ ${elapsed()}  ◆ ${truncate(observabilityLine(), 68)}`}
                  fg={theme.muted}
                />
                {/* Line 4: session title */}
                {sessionTitle() ? (
                  <text
                    content={`  ├ session: ${truncate(sessionTitle()!, 30)}`}
                    fg={theme.muted}
                  />
                ) : null}
                {/* Line 5: last message */}
                {lastMsg() ? (
                  <text
                    content={`  └ last: "${truncate(lastMsg()!, 35)}"`}
                    fg={theme.muted}
                  />
                ) : null}
              </box>
            );
          }}
        </For>
      </Scrollable>
    </box>
  );
}
