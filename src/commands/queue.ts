/**
 * `pilot queue` — Display pending and running jobs from pilot.db.
 *
 * Shows active queue items in a formatted table.
 * --history flag shows completed/failed/cancelled jobs.
 */

import { getQueue, getRecent } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, blue } from '../util/colors.js';
import { formatRelativeTime } from '../util/format.js';

interface QueueOptions {
  json?: boolean;
  history?: boolean;
}

async function queueCommand(opts: QueueOptions): Promise<void> {
  if (opts.history) {
    const recent = getRecent(50);

    if (isJsonMode()) {
      outputJson({ history: recent });
      return;
    }

    outputHuman('');
    outputHuman(`  ${bold('History')} (last ${recent.length})`);
    outputHuman('');

    if (recent.length === 0) {
      outputHuman(`  ${dim('No completed jobs')}`);
      outputHuman('');
      return;
    }

    for (const job of recent) {
      const icon =
        job.status === 'completed'
          ? green('✓')
          : job.status === 'failed'
            ? red('✗')
            : dim('◌');
      const elapsed = job.completedAt
        ? formatRelativeTime(job.completedAt)
        : '';
      const desc =
        job.description.length > 40
          ? job.description.slice(0, 40) + '…'
          : job.description;
      outputHuman(
        `  ${icon}  ${dim(job.id)}  ${job.project.padEnd(14)}  ${dim(job.scope.padEnd(10))}  ${desc.padEnd(42)}  ${dim(elapsed)}`,
      );
    }

    outputHuman('');
    return;
  }

  const queue = getQueue();

  if (isJsonMode()) {
    outputJson({ queue });
    return;
  }

  outputHuman('');

  if (queue.length === 0) {
    outputHuman(`  ${dim('Queue empty')}`);
    outputHuman('');
    return;
  }

  outputHuman(
    `  ${bold('id')}    ${bold('project').padEnd(14)}  ${bold('scope').padEnd(10)}  ${bold('description').padEnd(36)}  ${bold('status')}`,
  );

  for (const job of queue) {
    const icon = job.status === 'running' ? blue('●') : dim('○');
    const statusStr =
      job.status === 'running'
        ? `${blue('running')} ${dim(job.startedAt ? formatRelativeTime(job.startedAt) : '')}`
        : dim('pending');
    const desc =
      job.description.length > 35
        ? job.description.slice(0, 35) + '…'
        : job.description;
    outputHuman(
      `  ${icon} ${dim(job.id)}  ${job.project.padEnd(14)}  ${dim(job.scope.padEnd(10))}  ${desc.padEnd(36)}  ${statusStr}`,
    );
  }

  outputHuman('');
}

export { queueCommand };
