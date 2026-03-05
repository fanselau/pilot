/**
 * `pilot queue` — Display pending and running jobs from pilot.db.
 *
 * Shows active queue items in a formatted table.
 * --history flag shows completed/failed/cancelled jobs.
 */

import { getQueue, getRecent } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, blue, yellow } from '../util/colors.js';
import { formatRelativeTime } from '../util/format.js';
import type { Job } from '../core/types.js';

/**
 * Determine if a completed phase job is "inconclusive" (judge failed or gave benefit of doubt).
 * Quick jobs skip the judge entirely — they always show ✓.
 */
function isInconclusive(job: Job): boolean {
  if (job.status !== 'completed' || job.scope !== 'phase') return false;
  if (!job.judgeVerdict) return true;
  try {
    const v = JSON.parse(job.judgeVerdict) as { confidence?: number };
    return typeof v.confidence === 'number' && v.confidence === 0;
  } catch {
    return true;
  }
}

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
          ? isInconclusive(job) ? yellow('⚠') : green('✓')
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
    const notify = job.callbackSessionKey ? dim(`  notify:${job.callbackSessionKey}`) : '';
    outputHuman(
      `  ${icon} ${dim(job.id)}  ${job.project.padEnd(14)}  ${dim(job.scope.padEnd(10))}  ${desc.padEnd(36)}  ${statusStr}${notify}`,
    );
  }

  outputHuman('');
}

export { queueCommand };
