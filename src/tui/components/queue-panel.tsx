/**
 * QueuePanel — scrollable list of pending jobs.
 *
 * Renders a bordered panel with a list of queued jobs. Supports
 * keyboard navigation with highlighted selection indicator.
 * Each row shows: ▸ #id  project  scope  "description"
 *
 * Dim foreground color for "waiting" feel.
 */

/* @jsxImportSource @opentui/solid */

import { For } from 'solid-js';
import { Scrollable } from '../widgets/scrollable.js';
import { statusColors, theme } from '../theme.js';
import { buildJobWhy, buildUndoWhy } from '../../core/job-introspection.js';
import type { Job, JobStatus } from '../../core/types.js';

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export interface QueueRowContext {
  selected?: boolean;
  blockedProjects?: Set<string>;
  blockedProjectReasons?: Map<string, string | null>;
  runningProjects?: Set<string>;
  jobStatusById?: Map<string, JobStatus>;
  queueGraceSeconds?: number;
  nowEpochSeconds?: number;
}

function getPendingBadge(job: Job, context: QueueRowContext): string | null {
  const pendingWhy = buildJobWhy(job, {
    nowEpochSeconds: context.nowEpochSeconds,
    queueGraceSeconds: context.queueGraceSeconds,
    projectBlocked: (context.blockedProjects ?? new Set()).has(job.project),
    blockedReason: context.blockedProjectReasons?.get(job.project) ?? null,
    dependencyStatus: job.dependsOn
      ? context.jobStatusById?.get(job.dependsOn) ?? null
      : null,
    hasRunningJobForProject: (context.runningProjects ?? new Set()).has(job.project),
  });

  if (pendingWhy.code === 'grace-wait' && typeof pendingWhy.remainingSeconds === 'number') {
    return `${pendingWhy.badge}:${pendingWhy.remainingSeconds}s`;
  }
  if (pendingWhy.code === 'launchable') {
    return null;
  }
  return pendingWhy.badge;
}

export function buildQueueBadges(job: Job, context: QueueRowContext = {}): string[] {
  if (job.status === 'pending') {
    const pendingBadge = getPendingBadge(job, context);
    return pendingBadge ? [pendingBadge] : [];
  }

  const why = buildJobWhy(job);
  const badges: string[] = [why.badge];
  const undoWhy = buildUndoWhy(job);
  if (
    undoWhy.code === 'undo-guarded-dirty-start'
    || undoWhy.code === 'undo-guarded-newer-work'
    || undoWhy.code === 'undo-guarded-diverged'
  ) {
    badges.push(undoWhy.badge);
  }
  return badges;
}

export function buildQueueRowLine(job: Job, context: QueueRowContext = {}): string {
  const selected = context.selected ?? false;
  const indicator = selected ? '▸' : ' ';
  const isProjectBlocked = (context.blockedProjects ?? new Set()).has(job.project);
  const blockedPrefix = isProjectBlocked ? '⊘ ' : '';
  const badges = buildQueueBadges(job, context);
  const badgeText = badges.map((badge) => `[${badge}]`).join(' ');
  const profile = job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : '';
  const badgeSection = badgeText ? `  ${badgeText}` : '';

  return `${indicator} ${blockedPrefix}#${job.id}  ${job.project}  ${job.scope}${profile}  "${truncate(job.description, 30)}"${badgeSection}`;
}

export function QueuePanel(props: {
  jobs: Job[];
  selectedIndex: number;
  focused: boolean;
  blockedProjects?: Set<string>;
  blockedProjectReasons?: Map<string, string | null>;
  runningProjects?: Set<string>;
  jobStatusById?: Map<string, JobStatus>;
  queueGraceSeconds?: number;
}) {
  const nowEpochSeconds = () => Math.floor(Date.now() / 1000);

  return (
    <box
      borderStyle="rounded"
      border={true}
      borderColor={props.focused ? statusColors.running : theme.border}
      title=" Queue "
      flexGrow={1}
      flexDirection="column"
    >
      <Scrollable>
        <For each={props.jobs}>
          {(job, i) => {
            const selected = () => props.focused && i() === props.selectedIndex;
            const isProjectBlocked = () => (props.blockedProjects ?? new Set()).has(job.project);
            const line = () =>
              buildQueueRowLine(job, {
                selected: selected(),
                blockedProjects: props.blockedProjects,
                blockedProjectReasons: props.blockedProjectReasons,
                runningProjects: props.runningProjects,
                jobStatusById: props.jobStatusById,
                queueGraceSeconds: props.queueGraceSeconds,
                nowEpochSeconds: nowEpochSeconds(),
              });

            return (
              <box backgroundColor={selected() ? theme.highlight : undefined}>
                <text
                  content={line()}
                  fg={isProjectBlocked() ? statusColors.failed : statusColors.pending}
                />
              </box>
            );
          }}
        </For>
      </Scrollable>
    </box>
  );
}
