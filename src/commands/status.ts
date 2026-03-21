/**
 * `pilot status` — One-shot dashboard showing active, queued, and recent jobs.
 *
 * Reads from both pilot.db (queue state) and opencode's DB (session enrichment).
 * Default command when no arguments provided.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { getQueue, getRecent, getProject, getJob } from '../core/db.js';
import { getConfig } from '../core/config.js';
import { buildJobObservability } from '../core/job-observability.js';
import { buildJudgeSignal } from '../core/judge-signal.js';
import {
  getLastMessage,
  findSessionByTitle,
  isSessionDone,
} from '../core/opencode-db.js';
import { buildJobWhy, buildUndoWhy } from '../core/job-introspection.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, blue, yellow } from '../util/colors.js';
import { formatRelativeTime } from '../util/format.js';
import type { Job, JobObservabilitySnapshot } from '../core/types.js';

interface RecoveryTag {
  tag: string;
  state: 'safe' | 'guarded' | 'unavailable';
  reason: 'checkpoint-ready' | 'newer-work' | 'diverged-history' | 'job-not-terminal' | 'checkpoint-missing';
  action: string;
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
  why?: boolean;
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

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function shortModel(model: string): string {
  const parts = model.split('/');
  return parts[parts.length - 1] ?? model;
}

function formatCompactObservability(snapshot: JobObservabilitySnapshot): string {
  const modelSignal = snapshot.observed.models.length === 0
    ? '?'
    : snapshot.observed.models.length === 1
      ? shortModel(snapshot.observed.models[0])
      : `mixed:${snapshot.observed.models.length}`;

  const tokenSignal = snapshot.tokens.totals
    ? formatCompactNumber(snapshot.tokens.totals.total)
    : '?';

  const costSignal = snapshot.cost.estimatedUsd === null
    ? '?'
    : snapshot.cost.estimatedUsd >= 1
      ? `~$${snapshot.cost.estimatedUsd.toFixed(2)}`
      : `~$${snapshot.cost.estimatedUsd.toFixed(4)}`;

  const markers: string[] = [];
  if (!snapshot.terminal) {
    markers.push('live');
  }
  if (
    snapshot.observed.status !== 'available'
    || snapshot.tokens.status !== 'available'
    || snapshot.cost.status !== 'estimated'
  ) {
    markers.push('partial');
  }

  const markerSuffix = markers.length > 0 ? ` ${markers.join('/')}` : '';
  return `model:${modelSignal} tok:${tokenSignal} cost:${costSignal}${markerSuffix}`;
}

function buildObservabilityMap(jobs: Job[]): Record<string, JobObservabilitySnapshot> {
  const map: Record<string, JobObservabilitySnapshot> = {};
  for (const job of jobs) {
    map[job.id] = buildJobObservability(job);
  }
  return map;
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

function getRecoveryTag(job: Job): RecoveryTag {
  const undo = buildUndoWhy(job);

  if (undo.code === 'undo-safe') {
    return {
      tag: undo.badge,
      state: 'safe',
      reason: 'checkpoint-ready',
      action: undo.next,
    };
  }

  if (undo.code === 'undo-guarded-newer-work') {
    return {
      tag: undo.badge,
      state: 'guarded',
      reason: 'newer-work',
      action: undo.next,
    };
  }

  if (undo.code === 'undo-guarded-diverged') {
    return {
      tag: undo.badge,
      state: 'guarded',
      reason: 'diverged-history',
      action: undo.next,
    };
  }

  return {
    tag: undo.badge,
    state: 'unavailable',
    reason: job.status === 'pending' || job.status === 'running' ? 'job-not-terminal' : 'checkpoint-missing',
    action: undo.next,
  };
}

function formatRecoveryTag(job: Job): string {
  const recovery = getRecoveryTag(job);
  return recovery.tag;
}

function buildRecoveryMap(jobs: Job[]): Record<string, RecoveryTag> {
  const entries = jobs.map((job) => [job.id, getRecoveryTag(job)] as const);
  return Object.fromEntries(entries);
}

function formatWhyLine(what: string, why: string, next: string): string {
  return `what: ${what} | why: ${why} | next: ${next}`;
}

function getPendingWhy(job: Job, nowEpochSeconds: number, queueGraceSeconds: number, runningProjects: Set<string>) {
  const project = getProject(job.project);
  return buildJobWhy(job, {
    nowEpochSeconds,
    queueGraceSeconds,
    projectBlocked: project?.status === 'blocked',
    blockedReason: project?.blockedReason ?? null,
    dependencyStatus: job.dependsOn ? getJob(job.dependsOn)?.status ?? null : null,
    hasRunningJobForProject: runningProjects.has(job.project),
  });
}

function formatPendingBadge(job: Job, nowEpochSeconds: number, queueGraceSeconds: number, runningProjects: Set<string>): string {
  const pendingWhy = getPendingWhy(job, nowEpochSeconds, queueGraceSeconds, runningProjects);
  if (pendingWhy.code === 'grace-wait' && typeof pendingWhy.remainingSeconds === 'number') {
    return `${pendingWhy.badge}:${pendingWhy.remainingSeconds}s`;
  }
  return pendingWhy.badge;
}

async function statusCommand(opts: StatusOptions): Promise<void> {
  const queue = getQueue();
  const recent = getRecent(10);
  const config = getConfig();
  const queueGraceSeconds = config.queueGraceSeconds ?? 0;
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const showWhy = opts.why ?? false;

  const active = queue.filter((j) => j.status === 'running');
  const pending = queue.filter((j) => j.status === 'pending');
  const reviewHold = queue.filter((j) => j.status === 'review_hold');
  const runningProjects = new Set(active.map((job) => job.project));

  // Status integrity: separate active jobs into healthy (session alive) and stale (session gone)
  const healthyActive = active.filter((j) => !isJobStale(j));
  const staleActive = active.filter((j) => isJobStale(j));

  const daemon = getDaemonStatus();

  const whyEntries: ReadonlyArray<readonly [string, ReturnType<typeof buildJobWhy>]> = [
    ...healthyActive.map((job) => [job.id, buildJobWhy(job)] as const),
    ...staleActive.map((job) => [job.id, buildJobWhy(job)] as const),
    ...pending.map((job) => [job.id, getPendingWhy(job, nowEpochSeconds, queueGraceSeconds, runningProjects)] as const),
    ...recent.map((job) => [job.id, buildJobWhy(job)] as const),
    ...reviewHold.map((job) => [job.id, buildJobWhy(job)] as const),
  ];
  const why = Object.fromEntries(whyEntries);
  const observability = buildObservabilityMap([...healthyActive, ...staleActive, ...pending, ...recent, ...reviewHold]);

  if (isJsonMode()) {
    const recovery = buildRecoveryMap([...healthyActive, ...staleActive, ...pending, ...recent, ...reviewHold]);
    outputJson({
      version: '2.0.0',
      daemon: { active: daemon.status === 'active', pid: daemon.pid, detail: daemon.detail },
      active: healthyActive,
      stale: staleActive,
      queue: pending,
      recent,
      reviewHold,
      recovery,
      why,
      observability,
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
        `  ${blue('●')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${dim(`[${formatRecoveryTag(job)}]`)}  ${dim(`[obs ${formatCompactObservability(observability[job.id])}]`)}`,
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
        `  ${yellow('⚠')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${dim('[stale — will be reconciled]')}  ${dim(`[${formatRecoveryTag(job)}]`)}  ${dim(`[obs ${formatCompactObservability(observability[job.id])}]`)}`,
      );
    }
    outputHuman('');
  }

  // Review Hold section (jobs intentionally paused awaiting human review)
  if (reviewHold.length > 0) {
    outputHuman(`  ${bold('Review Hold')} (${reviewHold.length}) — awaiting human review`);
    for (const job of reviewHold) {
      const elapsed = getJobElapsed(job);
      const desc = sanitizeDesc(job.description);
      outputHuman(
        `  ${yellow('●')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${yellow('review hold')}  ${dim(`[${formatRecoveryTag(job)}]`)}`,
      );
      if (job.resumeHint) {
        outputHuman(`    ${dim('└ ' + job.resumeHint.split('\n')[0])}`);
      }
    }
    outputHuman('');
  }

  // Queue section
  if (pending.length > 0) {
    outputHuman(`  ${bold('Queue')} (${pending.length})`);
    for (const job of pending) {
      const desc = sanitizeDesc(job.description);
      const pendingBadge = formatPendingBadge(job, nowEpochSeconds, queueGraceSeconds, runningProjects);
      const pendingWhy = why[job.id];
      outputHuman(
        `  ${dim('○')} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim('pending')}  ${dim(`[${pendingBadge}]`)}  ${dim(`[${formatRecoveryTag(job)}]`)}`,
      );
      if (showWhy && pendingWhy.code !== 'launchable') {
        outputHuman(`    ${dim(`└ ${formatWhyLine(pendingWhy.what, pendingWhy.why, pendingWhy.next)}`)}`);
      }
    }
    outputHuman('');
  }

  // Recent section
  if (recent.length > 0) {
    outputHuman(`  ${bold('Recent')}`);
    for (const job of recent) {
      const judgeSignal = buildJudgeSignal(job);
      const icon =
        job.status === 'completed'
          ? judgeSignal.outcome === 'inconclusive' ? yellow('⚠') : green('✓')
          : job.status === 'failed'
            ? red('✗')
            : job.status === 'completed_pending_review'
              ? yellow('◑')   // amber — work done, review pending
              : job.status === 'review_hold'
                ? yellow('◐') // amber — actively paused for review
                : dim('◌');
      const elapsed = job.completedAt ? formatRelativeTime(job.completedAt) : '';
      const desc = sanitizeDesc(job.description);
      const judgeBadge =
        job.status === 'completed' && job.scope === 'phase' && judgeSignal.badge
          ? `${dim(`[${judgeSignal.badge}]`)} `
          : '';
      const statusWhy = why[job.id];
      const statusBadge =
        job.status === 'failed' || job.status === 'cancelled'
          ? `${dim(`[${statusWhy.badge}]`)} `
          : job.status === 'completed_pending_review'
            ? `${yellow('review pending')} `   // amber, not red
            : job.status === 'review_hold'
              ? `${yellow('review hold')} `    // amber, not red
              : statusWhy.code === 'no-commit-delta'
                ? `${dim('[no-op]')} `
                : '';
      const failReason = job.status === 'failed' && job.error ? dim(` — ${job.error.slice(0, 60).replace(/\n/g, ' ')}`) : '';
      outputHuman(
        `  ${icon} ${dim(job.id)}  ${job.project}  ${dim(job.scope)}  "${desc}"  ${dim(elapsed)}  ${judgeBadge}${statusBadge}${dim(`[${formatRecoveryTag(job)}]`)}  ${dim(`[obs ${formatCompactObservability(observability[job.id])}]`)}${failReason}`,
      );
      if (showWhy && (job.status === 'failed' || job.status === 'cancelled' || statusWhy.code === 'no-commit-delta')) {
        outputHuman(`    ${dim(`└ ${formatWhyLine(statusWhy.what, statusWhy.why, statusWhy.next)}`)}`);
      }
    }
    outputHuman('');
  }

  if (healthyActive.length === 0 && staleActive.length === 0 && pending.length === 0 && recent.length === 0 && reviewHold.length === 0) {
    outputHuman(`  ${dim('No jobs. Run: pilot add <project> <requirement>')}`);
    outputHuman('');
  }
}

export { statusCommand };
