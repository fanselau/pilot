/**
 * Job completion callback — OpenClaw `agent --deliver` notification.
 *
 * Fire-and-forget notifications — NEVER throws. All failures are logged to stderr.
 * Uses route-first resolution (job route -> project route -> strict legacy derive)
 * and delivers via OpenClaw CLI with explicit reply routing.
 */

import { getProject, getJobSteps } from './db.js';
import { errMsg } from '../util/errors.js';
import { resolveNotifyRoute } from './notify-route.js';
import { executeOpenClawDeliver } from './openclaw-deliver.js';
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
  return `The project is now blocked. Run: pilot log ${job.id} to read the full build transcript, then pilot unblock "${job.project}" to unblock. Queue a new job with pilot add.`;
}

function buildDeliveryPrompt(job: Job): string {
  const verdict = parseJudgeVerdict(job.judgeVerdict);
  const failed = job.status === 'failed';

  const lines: string[] = [
    `A Pilot job just ${failed ? 'failed' : 'completed'}. Reply in your target chat with a concise, natural-language update for the team.`,
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
    const routeResult = resolveNotifyRoute(job, project);
    if (!routeResult.ok) {
      process.stderr.write(
        `[callback] OpenClaw notify route error for job ${job.id} (${routeResult.error.code}): ${routeResult.error.message}\n`,
      );
      return false;
    }

    const prompt = buildDeliveryPrompt(job);
    const delivery = await executeOpenClawDeliver(routeResult.route, prompt);

    if (!delivery.ok) {
      process.stderr.write(
        `[callback] OpenClaw delivery failed for job ${job.id}: ${delivery.error ?? 'unknown error'}\n`,
      );
      return false;
    }

    return true;
  } catch (error) {
    process.stderr.write(
      `[callback] notifyJobCompletion failed for job ${job.id}: ${errMsg(error)}\n`,
    );
    return false;
  }
}

export { buildDeliveryPrompt, notifyJobCompletion };
