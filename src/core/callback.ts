/**
 * Job completion callback — multi-backend fan-out notification.
 *
 * Fire-and-forget notifications — NEVER throws. All failures are logged to stderr.
 * Uses resolveNotifyRoutes() to get NotifyRoute[], then fans out delivery to all
 * backends via Promise.allSettled(). Returns true if at least one backend succeeded.
 */

import { getProject, getJobSteps } from './db.js';
import { buildJobExecutiveSummary } from './job-summary.js';
import { errMsg } from '../util/errors.js';
import { resolveNotifyRoutes } from './notify-route.js';
import { getBackend } from './notify-backends/registry.js';
import type { NotifyRoute } from './notify-backends/types.js';
import type { Job } from './types.js';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return 'unknown';

  try {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0 || Number.isNaN(ms)) return 'unknown';

    const totalMinutes = Math.round(ms / 60_000);
    if (totalMinutes < 1) return '<1m';
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } catch {
    return 'unknown';
  }
}

function buildOutcomeHeadline(job: Job, summary: ReturnType<typeof buildJobExecutiveSummary>): string {
  if (summary.outcome === 'failure') {
    return `Failure — ${truncate(summary.failureReason ?? summary.what, 160)}`;
  }
  if (summary.outcome === 'review_pending') {
    return `Review pending — ${truncate(summary.what, 160)}`;
  }
  if (summary.outcome === 'review_hold') {
    return `Review hold — ${truncate(summary.what, 160)}`;
  }
  return `Success — ${truncate(summary.what, 160)}`;
}

function buildDeliveryPrompt(job: Job): string {
  const summary = buildJobExecutiveSummary(job, getJobSteps(job.id));
  const lines: string[] = [buildOutcomeHeadline(job, summary), '', `What: ${truncate(summary.what, 220)}`, `Why: ${truncate(summary.why, 220)}`, `Next: ${truncate(summary.next, 220)}`, ''];

  if (summary.outcome === 'failure' && summary.failureReason) {
    lines.push(`Evidence:`);
    lines.push(`Failure: ${truncate(summary.failureReason, 300)}`);
  } else if (summary.outcome === 'review_pending') {
    lines.push('Evidence:');
    lines.push('This is not a failure. Human review is required before closing the loop.');
  } else if (summary.outcome === 'review_hold') {
    lines.push('Evidence:');
    lines.push('This is not a failure. Execution resumes on approval.');
  } else {
    lines.push('Key result: ' + truncate(summary.lastAssistantMessages[0]?.text ?? summary.what, 300));
  }

  if (summary.keyArtifacts.length > 0) {
    lines.push(`Artifacts: ${summary.keyArtifacts.join(', ')}`);
  }
  if (summary.judge) {
    lines.push(`Judge: ${summary.judge.badge}${summary.judge.reason ? ` — ${truncate(summary.judge.reason, 220)}` : ''}`);
  }
  if (summary.verification) {
    lines.push(`Verification: ${summary.verification.status ?? '—'} | actionable=${summary.verification.actionableGapCount ?? 0} | human=${summary.verification.humanVerificationCount ?? 0} | routing=${summary.verification.routingDecision ?? '—'}`);
  }

  lines.push('', 'Drilldown:', `- pilot summary ${job.id}`, `- pilot log ${job.id}`, '- pilot status --why');
  if (summary.drilldown.unblockCommand) {
    lines.push(`- ${summary.drilldown.unblockCommand}`);
  }
  if (job.status === 'completed_pending_review') {
    lines.push(`- pilot review ${job.id} --approve`);
    lines.push(`- pilot review ${job.id} --reject "reason"`);
  } else if (job.status === 'review_hold') {
    lines.push(`- pilot review ${job.id} --approve`);
  } else if (summary.drilldown.reviewCommand) {
    lines.push(`- ${summary.drilldown.reviewCommand}`);
  }

  lines.push('', 'Identifiers:', `job_id: ${job.id}`, `project: ${job.project}`, `scope: ${job.scope}`, `status: ${job.status}`, `description: ${truncate(job.description, 180)}`, `duration: ${formatDuration(job.startedAt, job.completedAt)}`, '', 'This is a real event. Do not ignore it.');

  return lines.join('\n');
}

async function notifyJobCompletion(job: Job): Promise<boolean> {
  try {
    if (job.scope === 'milestone') return false;

    const project = getProject(job.project);
    const routes = resolveNotifyRoutes(job, project);

    if (routes.length === 0) {
      process.stderr.write(`[callback] no notify routes for job ${job.id}\n`);
      return false;
    }

    const prompt = buildDeliveryPrompt(job);

    const results = await Promise.allSettled(
      routes.map(async (route: NotifyRoute) => {
        const backend = getBackend(route.kind);
        if (!backend) {
          process.stderr.write(`[callback] unknown backend '${route.kind}' for job ${job.id}\n`);
          return { ok: false, error: `unknown backend: ${route.kind}` };
        }
        const result = await backend.deliver(route, prompt, job);
        if (result.ok) {
          process.stderr.write(`[callback] backend '${route.kind}' delivered for job ${job.id}\n`);
        } else {
          process.stderr.write(`[callback] backend '${route.kind}' failed for job ${job.id}: ${result.error ?? 'unknown'}\n`);
        }
        return result;
      }),
    );

    // Return true if at least one backend succeeded
    return results.some(
      (r) => r.status === 'fulfilled' && r.value.ok === true,
    );
  } catch (error) {
    process.stderr.write(
      `[callback] notifyJobCompletion failed for job ${job.id}: ${errMsg(error)}\n`,
    );
    return false;
  }
}

export { buildDeliveryPrompt, notifyJobCompletion };
