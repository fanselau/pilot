/**
 * CompletedPanel — scrollable completion history.
 *
 * Most recent first. Shows status icon (✓/✗/–), job info,
 * duration, token total, and relative time.
 * New completions flash inverse for 2 seconds.
 */

/* @jsxImportSource @opentui/solid */

import { For, createSignal, createEffect, on } from 'solid-js';
import { Scrollable } from '../widgets/scrollable.js';
import { statusColors, theme } from '../theme.js';
import { formatTokens } from './running-panel.js';
import type { Job, JobStatus } from '../../core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return '—';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h${String(mins % 60).padStart(2, '0')}m`;
  if (mins > 0) return `${mins}m${String(secs % 60).padStart(2, '0')}s`;
  return `${secs}s`;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return '';
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 0) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusIcon(status: JobStatus): { icon: string; color: string } {
  switch (status) {
    case 'completed': return { icon: '✓', color: statusColors.done };
    case 'failed': return { icon: '✗', color: statusColors.failed };
    case 'cancelled': return { icon: '–', color: statusColors.cancelled };
    default: return { icon: ' ', color: theme.muted };
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function CompletedPanel(props: {
  jobs: Job[];
  selectedIndex: number;
  focused: boolean;
}) {
  // Track flashing IDs for new completions
  const [flashingIds, setFlashingIds] = createSignal<Set<string>>(new Set());
  const [prevIds, setPrevIds] = createSignal<Set<string>>(new Set());

  // Detect new completions by comparing current vs previous job IDs
  createEffect(on(() => props.jobs, (jobs) => {
    const currentIds = new Set(jobs.map(j => j.id));
    const prev = prevIds();
    const newIds = new Set<string>();

    for (const id of currentIds) {
      if (!prev.has(id)) {
        newIds.add(id);
      }
    }

    if (newIds.size > 0) {
      setFlashingIds(f => {
        const next = new Set(f);
        for (const id of newIds) next.add(id);
        return next;
      });

      // Remove flash after 2 seconds
      setTimeout(() => {
        setFlashingIds(f => {
          const next = new Set(f);
          for (const id of newIds) next.delete(id);
          return next;
        });
      }, 2000);
    }

    setPrevIds(currentIds);
  }));

  return (
    <box
      borderStyle="rounded"
      border={true}
      borderColor={props.focused ? statusColors.running : theme.border}
      title=" Recent Completions "
      flexGrow={1}
      flexDirection="column"
    >
      <Scrollable>
        <For each={props.jobs}>
          {(job, i) => {
            const selected = () => props.focused && i() === props.selectedIndex;
            const flashing = () => flashingIds().has(job.id);
            const { icon, color } = statusIcon(job.status);
            const duration = () => formatDuration(job.startedAt, job.completedAt);
            const relative = () => formatRelativeTime(job.completedAt);

            const bg = () => {
              if (flashing()) return theme.fg;  // inverse flash
              if (selected()) return theme.highlight;
              return undefined;
            };

            const fg = () => {
              if (flashing()) return theme.bg;  // inverse flash
              return color;
            };

            const line = () =>
              `${icon} #${job.id}  ${job.project}  ${job.scope}  "${truncate(job.description, 20)}"  ${duration()}  ${formatTokens(0)} tok  ${relative()}`;

            return (
              <box backgroundColor={bg()}>
                <text content={line()} fg={fg()} />
              </box>
            );
          }}
        </For>
      </Scrollable>
    </box>
  );
}
