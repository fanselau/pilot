/**
 * Job completion callback — multi-backend fan-out notification.
 *
 * Fire-and-forget notifications — NEVER throws. All failures are logged to stderr.
 * Uses resolveNotifyRoutes() to get NotifyRoute[], then fans out delivery to all
 * backends via Promise.allSettled(). Returns true if at least one backend succeeded.
 */

import { getProject, getJobSteps } from './db.js';
import { errMsg } from '../util/errors.js';
import { resolveNotifyRoutes } from './notify-route.js';
import { getBackend } from './notify-backends/registry.js';
import type { NotifyRoute } from './notify-backends/types.js';
import type { Job } from './types.js';

interface ParsedJudgeVerdict {
  verdict: string;
  confidence: number;
  reason?: string;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function parseJudgeVerdict(value: string | null): ParsedJudgeVerdict | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ParsedJudgeVerdict>;
    if (typeof parsed.verdict !== 'string' || typeof parsed.confidence !== 'number') {
      return null;
    }
    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
    };
  } catch {
    return null;
  }
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

function nextStepGuidance(job: Job): string {
  if (job.status === 'completed') {
    return 'Acknowledge completion and continue with the next planned item.';
  }
  if (job.status === 'completed_pending_review') {
    return `Autonomous work is complete. Human review is needed. Run: pilot review ${job.id} --approve  OR  pilot review ${job.id} --reject "reason"`;
  }
  if (job.status === 'review_hold') {
    return `Execution is paused for mid-phase human review. Run: pilot review ${job.id} --approve  to resume, or pilot review ${job.id} --reject "reason" to cancel.`;
  }
  return `The project is now blocked. Run: pilot log ${job.id} to read the full build transcript, then pilot unblock "${job.project}" to unblock. Queue a new job with pilot add.`;
}

function buildDeliveryPrompt(job: Job): string {
  const verdict = parseJudgeVerdict(job.judgeVerdict);
  const failed = job.status === 'failed';
  const reviewPending = job.status === 'completed_pending_review';
  const reviewHold = job.status === 'review_hold';

  const statusWord = failed ? 'failed'
    : reviewPending ? 'completed (pending human review)'
    : reviewHold ? 'paused for human review'
    : 'completed';

  const lines: string[] = [
    `A Pilot job just ${statusWord}. Reply in your target chat with a concise, natural-language update for the team.`,
    '',
    'Job details:',
    `job_id: ${job.id}`,
    `project: ${job.project}`,
    `description: ${truncate(job.description, 180)}`,
    `status: ${job.status}`,
    `duration: ${formatDuration(job.startedAt, job.completedAt)}`,
  ];

  if (verdict) {
    lines.push(`verdict: ${verdict.verdict}`);
    lines.push(`confidence: ${verdict.confidence}%`);
    if (verdict.reason) {
      lines.push(`verdict_reason: ${truncate(verdict.reason, 300)}`);
    }
  }

  if (job.error) {
    lines.push(`error: ${truncate(job.error, 300)}`);
  }

  // Enrich notification for hung-session failures
  const isHungFailure = job.error?.includes('Retry budget exhausted')
    || (job.error?.includes('consecutive') && job.error?.includes('hangs'));
  if (isHungFailure && failed) {
    if (job.lastHungReason) {
      lines.push(`hung_reason: ${job.lastHungReason}`);
    }
    lines.push(`hung_count: ${job.hungCount ?? 0}`);
    if (job.sessionTitles) {
      try {
        const titles = JSON.parse(job.sessionTitles) as string[];
        const lastTitle = titles[titles.length - 1];
        if (lastTitle) {
          lines.push(`session_title: ${lastTitle}`);
        }
      } catch { /* ignore parse failures */ }
    }
    lines.push('');
    lines.push('This job failed because the AI session kept getting stuck waiting for interactive input.');
    lines.push('The operator should check if the project has an interactive prompt or confirmation dialog that blocks automation.');
  }

  // Build step history summary for notification
  const steps = getJobSteps(job.id);
  if (steps.length > 0) {
    lines.push('');
    lines.push('Step history:');
    for (const step of steps) {
      const statusIcon = step.status === 'completed' ? '✓'
        : step.status === 'failed' ? '✗'
        : step.status === 'pending' ? '○'
        : step.status === 'skipped' ? '⊘'
        : '◆';
      const sourceTag = step.source !== 'delegation' ? ` [${step.source}]` : '';
      const errorSuffix = step.error ? ` — ${truncate(step.error, 80)}` : '';
      lines.push(`  ${statusIcon} Step ${step.stepIndex + 1}: ${step.command} ${truncate(step.args, 40)}${sourceTag}${errorSuffix}`);
    }
  }

  lines.push(`next_step: ${nextStepGuidance(job)}`);
  lines.push('');

  if (failed) {
    lines.push(`Flag the failure clearly. The project is now blocked — no further jobs will run until someone unblocks it.`);
    lines.push(`Tell the team to run pilot log ${job.id} to inspect the transcript, then pilot unblock "${job.project}" and queue a new job with pilot add.`);
  } else if (reviewPending) {
    lines.push('The autonomous work is complete but human review is needed. This is NOT a failure — the project is NOT blocked.');
    lines.push(`Tell the team to run pilot review ${job.id} --approve when review passes, or pilot review ${job.id} --reject "reason" to note issues.`);
  } else if (reviewHold) {
    lines.push('Execution is paused for mid-phase human review. This is NOT a failure — the project is NOT blocked.');
    lines.push(`Tell the team to run pilot review ${job.id} --approve to resume execution.`);
  } else {
    lines.push('Acknowledge success, mention the project and what was done, and note the natural next action.');
  }
  lines.push('Do NOT choose NO_REPLY — this is a real event the team needs to know about.');

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
