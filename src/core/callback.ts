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

const OUTCOME_EMOJI: Record<string, string> = {
  success: '✅',
  failure: '❌',
  review_pending: '👀',
  review_hold: '⏸️',
  unknown: '❓',
};

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'success': return 'Completed';
    case 'failure': return 'Failed';
    case 'review_pending': return 'Needs Review';
    case 'review_hold': return 'Paused';
    default: return 'Unknown';
  }
}

function projectName(project: string): string {
  const parts = project.split('/');
  return parts.length >= 2 ? parts.slice(-2).join('/') : parts[parts.length - 1] ?? project;
}

function buildDeliveryPrompt(job: Job): string {
  const summary = buildJobExecutiveSummary(job, getJobSteps(job.id));
  const emoji = OUTCOME_EMOJI[summary.outcome] ?? '❓';
  const label = outcomeLabel(summary.outcome);
  const duration = formatDuration(job.startedAt, job.completedAt);
  const proj = projectName(job.project);
  const lines: string[] = [];

  // ── Header: one-line scannable outcome ──
  lines.push(`${emoji} **Pilot \`${job.id}\` — ${label}** (${job.scope}, ${duration})`);
  lines.push(`> **${proj}** · ${truncate(job.description, 140)}`);
  lines.push('');

  // ── Body: outcome-specific content ──
  if (summary.outcome === 'failure') {
    lines.push(`**Failure:** ${truncate(summary.failureReason ?? summary.what, 300)}`);
    if (summary.lastAssistantMessages[0]) {
      lines.push(`**Agent said:** ${truncate(summary.lastAssistantMessages[0].text, 300)}`);
    }
  } else if (summary.outcome === 'review_pending') {
    lines.push(`**Summary:** ${truncate(summary.what, 300)}`);
    lines.push('**Action required:** Human review needed. Do not approve automatically — a human must inspect the work first.');
  } else if (summary.outcome === 'review_hold') {
    lines.push(`**Summary:** ${truncate(summary.what, 300)}`);
    lines.push('**Paused:** Waiting for human review. Do not approve automatically — a human must decide whether the work is acceptable.');
  } else {
    // success
    const agentSaid = summary.lastAssistantMessages[0]?.text;
    if (agentSaid && agentSaid !== summary.what) {
      lines.push(`**Summary:** ${truncate(summary.what, 300)}`);
      lines.push(`**Agent said:** ${truncate(agentSaid, 300)}`);
    } else {
      lines.push(`**Summary:** ${truncate(summary.what, 300)}`);
    }
  }

  // ── Artifacts ──
  if (summary.keyArtifacts.length > 0) {
    lines.push(`**Artifacts:** ${summary.keyArtifacts.map(a => `\`${a}\``).join(', ')}`);
  }

  // ── Judge + Verification (only for phase jobs that have them) ──
  if (summary.judge && summary.judge.verdict) {
    const conf = summary.judge.confidence !== null ? ` (${summary.judge.confidence}%)` : '';
    const reason = summary.judge.reason ? ` — ${truncate(summary.judge.reason, 160)}` : '';
    lines.push(`**Judge:** ${summary.judge.verdict}${conf}${reason}`);
  }
  if (summary.verification && summary.verification.routingDecision) {
    const gaps = summary.verification.actionableGapCount ?? 0;
    const human = summary.verification.humanVerificationCount ?? 0;
    if (gaps > 0 || human > 0) {
      lines.push(`**Verification:** ${gaps} actionable gap${gaps !== 1 ? 's' : ''}, ${human} need${human !== 1 ? '' : 's'} human check`);
    }
  }

  // ── Commit delta (one line, only when meaningful) ──
  if (summary.commitDelta.state === 'changed') {
    lines.push(`**Commits:** \`${summary.commitDelta.baseCommit?.slice(0, 8)}\` → \`${summary.commitDelta.headCommit?.slice(0, 8)}\``);
  } else if (summary.commitDelta.state === 'no-op') {
    lines.push('**Commits:** no changes');
  }

  lines.push('');

  // ── Next action: clear, concrete, outcome-specific ──
  lines.push(`**Next:** ${truncate(summary.next, 300)}`);
  lines.push('');

  // ── Commands: compact, copy-pasteable ──
  const cmds: string[] = [];
  if (summary.drilldown.unblockCommand) {
    cmds.push(summary.drilldown.unblockCommand);
  }
  cmds.push(`pilot summary ${job.id}`);
  cmds.push(`pilot log ${job.id}`);

  lines.push('```');
  for (const cmd of cmds) {
    lines.push(cmd);
  }
  lines.push('```');

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
