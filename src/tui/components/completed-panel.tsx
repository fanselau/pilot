/**
 * CompletedPanel — scrollable completion history.
 *
 * Most recent first. Shows status icon (✓/✗/–), job info,
 * duration, token total, and relative time.
 * New completions flash a subtle status-tinted background for 2 seconds.
 *
 * Fixed: selection always wins over flash; status icon color is isolated
 * from content text color so project/description use normal fg.
 */

/* @jsxImportSource @opentui/solid */

import { For, createSignal, createEffect, on, onMount } from 'solid-js';
import { Scrollable } from '../widgets/scrollable.js';
import { statusColors, theme } from '../theme.js';
import { formatTokens } from './running-panel.js';
import { fetchSessionEnrichment } from '../data/opencode-db.js';
import type { Job, JobStatus } from '../../core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Determine if a completed phase job is "inconclusive" (judge failed or gave benefit of doubt).
 * Quick jobs skip the judge entirely — they always show ✓.
 */
function isInconclusive(job: { status: JobStatus; scope?: string; judgeVerdict?: string | null }): boolean {
  if (job.status !== 'completed' || job.scope !== 'phase') return false;
  if (!job.judgeVerdict) return true;
  try {
    const v = JSON.parse(job.judgeVerdict) as { confidence?: number };
    return typeof v.confidence === 'number' && v.confidence === 0;
  } catch {
    return true;
  }
}

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
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

export function formatRelativeTime(isoDate: string | null): string {
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

export function statusIcon(job: { status: JobStatus; scope?: string; judgeVerdict?: string | null }): { icon: string; color: string } {
  switch (job.status) {
    case 'completed': {
      // Phase jobs with no/inconclusive verdict get warning icon
      if (isInconclusive(job)) {
        return { icon: '⚠', color: statusColors.warning };
      }
      return { icon: '✓', color: statusColors.done };
    }
    case 'failed': return { icon: '✗', color: statusColors.failed };
    case 'cancelled': return { icon: '–', color: statusColors.cancelled };
    default: return { icon: ' ', color: theme.muted };
  }
}

// Subtle flash background per status — dark tint, not harsh inverse
export function flashBg(status: JobStatus): string {
  switch (status) {
    case 'completed': return '#0d2b0d';  // dark green tint
    case 'failed': return '#2b0d0d';     // dark red tint
    case 'cancelled': return '#1a1a1a';  // dark neutral
    default: return '#111111';
  }
}

/**
 * Compute the background color for a completed-panel row.
 * Selection always wins over flash — this is the core of the overlay fix.
 *
 * @param selected - Whether this row is currently selected
 * @param flashing - Whether this row is currently flashing (new completion)
 * @param status - Job status (used to determine flash tint color)
 */
export function computeRowBg(
  selected: boolean,
  flashing: boolean,
  status: JobStatus = 'completed',
): string | undefined {
  if (selected) return theme.highlight;
  if (flashing) return flashBg(status);
  return undefined;
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

  // Per-job token counts fetched from opencode DB
  const [jobTokens, setJobTokens] = createSignal<Map<string, number>>(new Map());

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

  // Fetch token counts for all completed jobs on mount and when jobs change
  createEffect(on(() => props.jobs, (jobs) => {
    if (jobs.length === 0) return;
    try {
      const tokenMap = new Map<string, number>();
      for (const job of jobs) {
        if (!job.sessionTitles) continue;
        let titles: string[] = [];
        try {
          titles = JSON.parse(job.sessionTitles) as string[];
        } catch { continue; }
        if (titles.length === 0) continue;

        const { tokens } = fetchSessionEnrichment(titles);
        let total = 0;
        for (const [, t] of tokens) {
          total += t.input + t.output + (t.reasoning ?? 0);
        }
        if (total > 0) {
          tokenMap.set(job.id, total);
        }
      }
      setJobTokens(tokenMap);
    } catch {
      // ignore enrichment errors — completed data is best-effort
    }
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
            const { icon, color } = statusIcon(job);
            const duration = () => formatDuration(job.startedAt, job.completedAt);
            const relative = () => formatRelativeTime(job.completedAt);
            const tokenCount = () => jobTokens().get(job.id) ?? 0;

            // Selection always wins over flash — user always knows cursor position
            const rowBg = () => computeRowBg(selected(), flashing(), job.status);

            // Content text color: normal fg, slightly muted for metadata
            const contentFg = () => selected() ? theme.fg : theme.fg;

            return (
              <box flexDirection="row" backgroundColor={rowBg()}>
                {/* Status icon: always uses status color */}
                <text content={`${icon} `} fg={color} />
                {/* Job identity: normal fg */}
                <text
                  content={`#${job.id}  ${job.project}  ${job.scope}${job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : ''}  `}
                  fg={contentFg()}
                />
                {/* Description: muted */}
                <text
                  content={`"${truncate(job.description, 20)}"  `}
                  fg={selected() ? theme.fg : theme.muted}
                />
                {/* Metrics: muted */}
                <text
                  content={`${duration()}  ${formatTokens(tokenCount())} tok  ${relative()}`}
                  fg={selected() ? theme.fg : theme.muted}
                />
              </box>
            );
          }}
        </For>
      </Scrollable>
    </box>
  );
}
