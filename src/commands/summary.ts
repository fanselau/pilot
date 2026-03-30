import { getJob, getJobSteps, getQueue } from '../core/db.js';
import { buildJobExecutiveSummary } from '../core/job-summary.js';
import type { Job, JobStep } from '../core/types.js';
import { bold, dim } from '../util/colors.js';
import { isJsonMode, outputHuman, outputJson } from '../util/output.js';

interface SummaryOptions {
  json?: boolean;
}

interface SummaryPayload {
  job: {
    id: string;
    project: string;
    scope: string;
    description: string;
    status: string;
    attempts: number;
    currentStep: number;
  };
  summary: ReturnType<typeof buildJobExecutiveSummary>;
}

function formatSummaryPayload(job: Job, steps: JobStep[]): SummaryPayload {
  return {
    job: {
      id: job.id,
      project: job.project,
      scope: job.scope,
      description: job.description,
      status: job.status,
      attempts: job.attempts,
      currentStep: job.currentStep,
    },
    summary: buildJobExecutiveSummary(job, steps),
  };
}

function renderSummaryHuman(job: Job, payload: SummaryPayload): void {
  const { summary } = payload;
  outputHuman('');
  outputHuman(`  ${bold(`${job.project} · ${job.scope} · ${job.id} · ${summary.outcome} · ${summary.statusBadge}`)}`);
  outputHuman(`  ${dim(`status: ${job.status}  attempts: ${job.attempts}`)}`);
  outputHuman(`  ${dim(`what: ${summary.what}`)}`);
  outputHuman(`  ${dim(`why: ${summary.why}`)}`);
  outputHuman(`  ${dim(`next: ${summary.next}`)}`);

  if (summary.currentOrFinalStep) {
    outputHuman(`  ${dim(`step: ${summary.currentOrFinalStep.index}/${summary.currentOrFinalStep.total} ${summary.currentOrFinalStep.command} [${summary.currentOrFinalStep.status}]`)}`);
  } else {
    outputHuman(`  ${dim('step: no step metadata recorded')}`);
  }

  if (summary.judge) {
    outputHuman(`  ${dim(`judge: ${summary.judge.badge}${summary.judge.reason ? ` — ${summary.judge.reason}` : ''}`)}`);
  }
  if (summary.verification) {
    outputHuman(
      `  ${dim(`verification: ${summary.verification.status ?? '—'} · actionable=${summary.verification.actionableGapCount ?? 0} · human=${summary.verification.humanVerificationCount ?? 0} · routing=${summary.verification.routingDecision ?? '—'}`)}`,
    );
  }

  if (summary.failureReason) {
    outputHuman(`  ${dim(`failure: ${summary.failureReason}`)}`);
  }

  if (summary.keyArtifacts.length > 0) {
    outputHuman(`  ${dim(`key artifacts: ${summary.keyArtifacts.join(', ')}`)}`);
  }

  if (summary.lastAssistantMessages.length > 0) {
    outputHuman(`  ${dim('assistant messages:')}`);
    for (const entry of summary.lastAssistantMessages) {
      outputHuman(`  ${dim(`${entry.stepIndex}. ${entry.text}`)}`);
    }
  }

  outputHuman(`  ${dim('drilldown:')}`);
  outputHuman(`  ${dim(`- ${summary.drilldown.summaryCommand}`)}`);
  outputHuman(`  ${dim(`- ${summary.drilldown.logCommand}`)}`);
  if (summary.drilldown.reviewCommand) {
    outputHuman(`  ${dim(`- ${summary.drilldown.reviewCommand}`)}`);
  }
  if (summary.drilldown.unblockCommand) {
    outputHuman(`  ${dim(`- ${summary.drilldown.unblockCommand}`)}`);
  }
  outputHuman('');
}

async function summaryCommand(idOrUndefined: string | undefined, _opts: SummaryOptions): Promise<void> {
  let jobId = idOrUndefined;
  if (!jobId) {
    const running = getQueue().find((job) => job.status === 'running');
    if (!running) {
      process.stderr.write('No running jobs. Specify a job ID: pilot summary <id>\n');
      process.exit(1);
    }
    jobId = running.id;
  }

  const job = getJob(jobId);
  if (!job) {
    process.stderr.write(`Job not found: ${jobId}\n`);
    process.exit(1);
  }

  const payload = formatSummaryPayload(job, getJobSteps(jobId));

  if (isJsonMode()) {
    outputJson(payload as unknown as Record<string, unknown>);
    return;
  }

  renderSummaryHuman(job, payload);
}

export { formatSummaryPayload, renderSummaryHuman, summaryCommand };
export type { SummaryOptions, SummaryPayload };
