/**
 * `pilot status` — One-shot dashboard showing active, queued, and recent jobs.
 *
 * Reads from both pilot.db (queue state) and opencode's DB (session enrichment).
 * Default command when no arguments provided.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { getQueue, getRecent } from '../core/db.js';
import { getConfig } from '../core/config.js';
import {
  getLastMessage,
  findSessionByTitle,
  isSessionDone,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, blue, yellow } from '../util/colors.js';
import { formatRelativeTime } from '../util/format.js';
import type { Job } from '../core/types.js';

interface RecoveryTag {
  tag: string;
  state: 'safe' | 'guarded' | 'unavailable';
  reason:
    | 'checkpoint-ready'
    | 'dirty-start'
    | 'newer-work'
    | 'diverged-history'
    | 'job-not-terminal'
    | 'checkpoint-missing';
  action: string;
}

/**
 * Determine if a completed phase job is "inconclusive" (judge failed or gave benefit of doubt).
 * Quick jobs skip the judge entirely — they always show ✓.
 * Phase jobs are inconclusive when:
 * - judgeVerdict is null (no verdict recorded)
 * - parsed verdict has confidence === 0 (benefit-of-doubt stored by runner)
 */
function isInconclusive(job: Job): boolean {
  if (job.status !== 'completed' || job.scope !== 'phase') return false;
  if (!job.judgeVerdict) return true; // No verdict at all for a phase job
  try {
    const v = JSON.parse(job.judgeVerdict) as { confidence?: number };
    return typeof v.confidence === 'number' && v.confidence === 0;
  } catch {
    return true; // Unparseable verdict = inconclusive
  }
}

/**
 * Detect the daemon runner status by checking the PID file and process liveness.
 */
function getDaemonStatus(): { status: 'active' | 'stopped'; pid?: number; detail: string } {
  const config = getConfig();
  const pidPath = path.join(config.pilotDir, 'daemon.pid');

  try {
    const pidContent = readFileSync(pidPath, 'utf8').trim();
    const pid = parseInt(pidContent, 10);
    if (isNaN(pid)) {
      return { status: 'stopped', detail: 'stopped (invalid PID file)' };
    }

    try {
      process.kill(pid, 0); // Check if process is alive (signal 0 = no-op)
      return { status: 'active', pid, detail: `active (PID ${pid})` };
    } catch {
      return { status: 'stopped', detail: 'stopped (stale PID file)' };
    }
  } catch {
    // No PID file — check systemd as fallback
    try {
      const result = execSync('systemctl --user is-active pilot-runner 2>/dev/null', { encoding: 'utf8' }).trim();
      if (result === 'active') {
        return { status: 'active', detail: 'active (systemd)' };
      }
    } catch {
      // systemctl not available or service not found — ignore
    }
    return { status: 'stopped', detail: 'stopped — run: pilot service start' };
  }
}

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

function inferKnownGuardState(job: Job): 'newer-work' | 'diverged-history' | null {
  const lower = `${job.error ?? ''} ${job.resumeHint ?? ''}`.toLowerCase();
  if (
    lower.includes('newer commits exist') ||
    lower.includes('newer work') ||
    lower.includes('ahead of this checkpoint')
  ) {
    return 'newer-work';
  }
  if (lower.includes('diverged')) {
    return 'diverged-history';
  }
  return null;
}

function getRecoveryTag(job: Job): RecoveryTag {
  if (job.status === 'pending' || job.status === 'running') {
    return {
      tag: 'undo:unavailable',
      state: 'unavailable',
      reason: 'job-not-terminal',
      action: 'wait for terminal status',
    };
  }

  if (!job.gitBaseCommit || !job.gitHeadCommit) {
    return {
      tag: 'undo:unavailable',
      state: 'unavailable',
      reason: 'checkpoint-missing',
      action: 'job has no recorded checkpoints',
    };
  }

  const knownGuard = inferKnownGuardState(job);
  if (knownGuard === 'newer-work') {
    return {
      tag: 'undo:guarded-newer-work',
      state: 'guarded',
      reason: 'newer-work',
      action: 'undo newer work first or use --force',
    };
  }

  if (knownGuard === 'diverged-history') {
    return {
      tag: 'undo:guarded-diverged',
      state: 'guarded',
      reason: 'diverged-history',
      action: 'inspect history before using --force',
    };
  }

  if (job.startedDirty) {
    return {
      tag: 'undo:guarded-dirty-start',
      state: 'guarded',
      reason: 'dirty-start',
      action: 'requires --force (dirty start)',
    };
  }

  return {
    tag: 'undo:safe',
    state: 'safe',
    reason: 'checkpoint-ready',
    action: 'safe to preview with pilot undo --dry-run',
  };
}

function formatRecoveryTag(job: Job): string {
  const recovery = getRecoveryTag(job);
  return `${recovery.tag} ${recovery.action}`;
}

function buildRecoveryMap(jobs: Job[]): Record<string, RecoveryTag> {
  const entries = jobs.map((job) => [job.id, getRecoveryTag(job)] as const);
  return Object.fromEntries(entries);
}

async function statusCommand(opts: StatusOptions): Promise<void> {
  const queue = getQueue();
  const recent = getRecent(10);

  const active = queue.filter((j) => j.status === 'running');
  const pending = queue.filter((j) => j.status === 'pending');

  // Status integrity: separate active jobs into healthy (session alive) and stale (session gone)
  const healthyActive = active.filter((j) => !isJobStale(j));
  const staleActive = active.filter((j) => isJobStale(j));

  const daemon = getDaemonStatus();

  if (isJsonMode()) {
    const recovery = buildRecoveryMap([...healthyActive, ...staleActive, ...pending, ...recent]);
    outputJson({
      version: '2.0.0',
      daemon: { active: daemon.status === 'active', pid: daemon.pid, detail: daemon.detail },
      active: healthyActive,
      stale: staleActive,
      queue: pending,
      recent,
      recovery,
    });
    return;
  }

  // Header
  outputHuman('');
  outputHuman(`  ${bold('pilot')} v2`);

  // Runner status
  const runnerIcon = daemon.status === 'active' ? green('●') : dim('○');
  outputHuman(`  Runner: ${runnerIcon} ${daemon.detail}`);
  outputHuman('');

  // Active section (healthy — session is alive)
  if (healthyActive.length > 0) {
    outputHuman(`  ${bold('Active')} (${healthyActive.length})`);
    for (const job of healthyActive) {
      const elapsed = getJobElapsed(job);
      const desc = sanitizeDesc(job.description);
      outputHuman(
        `  ${blue('●')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${dim(`[${formatRecoveryTag(job)}]`)}`,
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
        `  ${yellow('⚠')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${dim('[stale — will be reconciled]')}  ${dim(`[${formatRecoveryTag(job)}]`)}`,
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
        `  ${dim('○')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim('pending')}  ${dim(`[${formatRecoveryTag(job)}]`)}`,
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
          ? isInconclusive(job) ? yellow('⚠') : green('✓')
          : job.status === 'failed'
            ? red('✗')
            : dim('◌');
      const elapsed = job.completedAt ? formatRelativeTime(job.completedAt) : '';
      const desc = sanitizeDesc(job.description);
      const failReason = job.status === 'failed' && job.error ? dim(` — ${job.error.slice(0, 60).replace(/\n/g, ' ')}`) : '';
      outputHuman(
        `  ${icon} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${dim(`[${formatRecoveryTag(job)}]`)}${failReason}`,
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
