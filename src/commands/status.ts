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
  isSessionDone,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, blue, yellow } from '../util/colors.js';
import { formatRelativeTime } from '../util/format.js';
import type { Job } from '../core/types.js';

interface StatusOptions {
  json?: boolean;
}

/**
 * Sanitize job description for single-line display.
 * Strips newlines, collapses whitespace, extracts first heading if markdown,
 * and truncates to 50 chars.
 */
function sanitizeDesc(raw: string): string {
  // If it starts with a markdown heading, extract just the title
  const headingMatch = raw.match(/^#\s+(.+)/m);
  const clean = (headingMatch ? headingMatch[1] : raw)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 50 ? clean.slice(0, 50) + '…' : clean;
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

/**
 * Status integrity check: determine if a 'running' job has no backing opencode session.
 *
 * A job is stale when its most recent session title maps to a session in opencode DB
 * that is done (isSessionDone returns true — step-finish reason=stop/length).
 *
 * Returns false (not stale) when:
 * - No session titles recorded yet (job may just be starting)
 * - Most recent session not yet in opencode DB (session may still be initialising)
 * - On any parse/read error (err on side of caution)
 */
function isJobStale(job: Job): boolean {
  if (!job.sessionTitles) return false; // No titles yet — job may be starting

  try {
    const titles = JSON.parse(job.sessionTitles) as string[];
    if (titles.length === 0) return false;

    // Check ONLY the most recent session title (last element)
    const lastTitle = titles[titles.length - 1];
    const sessionId = findSessionByTitle(lastTitle);
    if (!sessionId) return false; // Not in opencode DB yet — might be initialising

    // Session exists in opencode DB — check if it's done (completed)
    // isSessionDone returns true when the session has ended (step-finish reason=stop/length)
    return isSessionDone(sessionId);
  } catch {
    return false; // Err on side of caution — don't show false stale warnings
  }
}

async function statusCommand(opts: StatusOptions): Promise<void> {
  const queue = getQueue();
  const recent = getRecent(10);

  const active = queue.filter((j) => j.status === 'running');
  const pending = queue.filter((j) => j.status === 'pending');

  // Status integrity: separate active jobs into healthy (session alive) and stale (session gone)
  const healthyActive = active.filter((j) => !isJobStale(j));
  const staleActive = active.filter((j) => isJobStale(j));

  if (isJsonMode()) {
    outputJson({
      version: '2.0.0',
      daemon: { active: false }, // TODO: detect daemon via PID/service
      active: healthyActive,
      stale: staleActive,
      queue: pending,
      recent,
    });
    return;
  }

  // Header
  outputHuman('');
  outputHuman(`  ${bold('pilot')} v2`);
  outputHuman('');

  // Active section (healthy — session is alive)
  if (healthyActive.length > 0) {
    outputHuman(`  ${bold('Active')} (${healthyActive.length})`);
    for (const job of healthyActive) {
      const elapsed = getJobElapsed(job);
      const desc = sanitizeDesc(job.description);
      outputHuman(
        `  ${blue('●')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}`,
      );

      // Show latest session activity if available
      const activity = getSessionActivity(job);
      if (activity) {
        outputHuman(`    ${dim('└ ' + activity)}`);
      }
    }
    outputHuman('');
  }

  // Stale active section (DB says running, session is gone)
  if (staleActive.length > 0) {
    outputHuman(`  ${bold('Stale')} (${staleActive.length}) — session ended but job not closed`);
    for (const job of staleActive) {
      const elapsed = getJobElapsed(job);
      const desc = sanitizeDesc(job.description);
      outputHuman(
        `  ${yellow('⚠')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${dim('[stale — will be reconciled]')}`,
      );
    }
    outputHuman('');
  }

  // Queue section
  if (pending.length > 0) {
    outputHuman(`  ${bold('Queue')} (${pending.length})`);
    for (const job of pending) {
      const desc = sanitizeDesc(job.description);
      outputHuman(
        `  ${dim('○')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim('pending')}`,
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
      const desc = sanitizeDesc(job.description);
      const failReason = job.status === 'failed' && job.error ? dim(` — ${job.error.slice(0, 60).replace(/\n/g, ' ')}`) : '';
      outputHuman(
        `  ${icon} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}${failReason}`,
      );
    }
    outputHuman('');
  }

  if (healthyActive.length === 0 && staleActive.length === 0 && pending.length === 0 && recent.length === 0) {
    outputHuman(`  ${dim('No jobs. Run: pilot add <project> <requirement>')}`);
    outputHuman('');
  }
}

export { statusCommand };
