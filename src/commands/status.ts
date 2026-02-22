/**
 * `pilot status` — One-shot dashboard showing active, queued, and recent jobs.
 *
 * Reads from both pilot.db (queue state) and opencode's DB (session enrichment).
 * Default command when no arguments provided.
 */

import { getQueue, getRecent } from '../core/db.js';
import {
  getLastMessage,
  findSessionByTitle,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, blue } from '../util/colors.js';
import { formatRelativeTime } from '../util/format.js';
import type { Job } from '../core/types.js';

interface StatusOptions {
  json?: boolean;
}

/**
 * Enrich a running job with session info from opencode DB.
 * Returns a display-friendly elapsed time string.
 */
function getJobElapsed(job: Job): string {
  if (!job.startedAt) return '';
  return formatRelativeTime(job.startedAt);
}

/**
 * Try to get the latest session activity for a running job.
 * Looks through session titles stored on the job.
 */
function getSessionActivity(job: Job): string | null {
  if (!job.sessionTitles) return null;

  try {
    const titles = JSON.parse(job.sessionTitles) as string[];
    if (titles.length === 0) return null;

    // Check last session title for activity
    const lastTitle = titles[titles.length - 1];
    const sessionId = findSessionByTitle(lastTitle);
    if (!sessionId) return null;

    const lastMsg = getLastMessage(sessionId);
    if (!lastMsg) return null;

    const preview = lastMsg.content.slice(0, 60).replace(/\n/g, ' ');
    return preview || null;
  } catch {
    return null;
  }
}

async function statusCommand(opts: StatusOptions): Promise<void> {
  const queue = getQueue();
  const recent = getRecent(10);

  const active = queue.filter((j) => j.status === 'running');
  const pending = queue.filter((j) => j.status === 'pending');

  if (isJsonMode()) {
    outputJson({
      version: '2.0.0',
      daemon: { active: false }, // TODO: detect daemon via PID/service
      active,
      queue: pending,
      recent,
    });
    return;
  }

  // Header
  outputHuman('');
  outputHuman(`  ${bold('pilot')} v2`);
  outputHuman('');

  // Active section
  if (active.length > 0) {
    outputHuman(`  ${bold('Active')} (${active.length})`);
    for (const job of active) {
      const elapsed = getJobElapsed(job);
      const desc =
        job.description.length > 50
          ? job.description.slice(0, 50) + '…'
          : job.description;
      outputHuman(
        `  ${blue('●')} ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}`,
      );

      // Show latest session activity if available
      const activity = getSessionActivity(job);
      if (activity) {
        outputHuman(`    ${dim('└ ' + activity)}`);
      }
    }
    outputHuman('');
  }

  // Queue section
  if (pending.length > 0) {
    outputHuman(`  ${bold('Queue')} (${pending.length})`);
    for (const job of pending) {
      const desc =
        job.description.length > 50
          ? job.description.slice(0, 50) + '…'
          : job.description;
      outputHuman(
        `  ${dim('○')} ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim('pending')}`,
      );
    }
    outputHuman('');
  }

  // Recent section
  if (recent.length > 0) {
    outputHuman(`  ${bold('Recent')}`);
    for (const job of recent) {
      const icon =
        job.status === 'completed'
          ? green('✓')
          : job.status === 'failed'
            ? red('✗')
            : dim('◌');
      const elapsed = job.completedAt ? formatRelativeTime(job.completedAt) : '';
      const desc =
        job.description.length > 50
          ? job.description.slice(0, 50) + '…'
          : job.description;
      outputHuman(
        `  ${icon} ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}`,
      );
    }
    outputHuman('');
  }

  if (active.length === 0 && pending.length === 0 && recent.length === 0) {
    outputHuman(`  ${dim('No jobs. Run: pilot add <project> <requirement>')}`);
    outputHuman('');
  }
}

export { statusCommand };
