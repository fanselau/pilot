/**
 * StatusBar — top bar with title and aggregate job counts.
 *
 * Fixed height: 1 row. Shows "Pilot v2" title on the left and
 * queue/running/completed counts on the right.
 */

/* @jsxImportSource @opentui/solid */

import { statusColors, theme } from '../theme.js';
import type { Job } from '../../core/types.js';

export function StatusBar(props: {
  queue: Job[];
  running: Job[];
  completed: Job[];
}) {
  const summary = () =>
    `${props.queue.length} queued │ ${props.running.length} running │ ${props.completed.length} done`;

  return (
    <box flexDirection="row" height={1}>
      <text content=" Pilot v2 " fg={statusColors.running} attributes={1} />
      <box flexGrow={1} />
      <text content={`${summary()} `} fg={theme.muted} />
    </box>
  );
}
