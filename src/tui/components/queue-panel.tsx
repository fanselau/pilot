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
import type { Job } from '../../core/types.js';

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function QueuePanel(props: {
  jobs: Job[];
  selectedIndex: number;
  focused: boolean;
  blockedProjects?: Set<string>;
}) {
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
            const indicator = () => selected() ? '▸' : ' ';
            const blockedPrefix = () => isProjectBlocked() ? '⊘ ' : '';
            const line = () =>
              `${indicator()} ${blockedPrefix()}#${job.id}  ${job.project}  ${job.scope}${job.modelProfile !== 'balanced' ? `  [${job.modelProfile}]` : ''}  "${truncate(job.description, 30)}"`;

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
