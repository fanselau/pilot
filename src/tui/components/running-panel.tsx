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
import type { Job } from '../../core/types.js';

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
                  content={`  ⏱ ${elapsed()}  ◆ ${formatTokens(totalTokens())} tokens`}
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
