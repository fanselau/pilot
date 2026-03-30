import { buildJobWhy, buildRetryWhy } from './job-introspection.js';
import { buildJobObservability } from './job-observability.js';
import { buildJudgeSignal } from './judge-signal.js';
import { findSessionByTitle, getLatestUsefulAssistantTextMessage } from './opencode-db.js';
import type { Job, JobObservabilitySnapshot, JobStep } from './types.js';

export interface StepExecutiveSummary {
  stepIndex: number;
  command: string;
  args: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  source: string;
  sessionTitle: string | null;
  verdictSource: string | null;
  verdictReason: string | null;
  error: string | null;
  durationMs: number | null;
  shortSummary: string | null;
  evidence: string[];
}

export interface JobExecutiveSummary {
  what: string;
  why: string;
  next: string;
  statusBadge: string;
  outcome: 'success' | 'failure' | 'review_pending' | 'review_hold' | 'unknown';
  currentOrFinalStep: {
    index: number;
    total: number;
    command: string;
    status: string;
  } | null;
  failureReason: string | null;
  judge: {
    verdict: string | null;
    confidence: number | null;
    reason: string | null;
    badge: string;
  } | null;
  verification: {
    status: string | null;
    actionableGapCount: number | null;
    humanVerificationCount: number | null;
    routingDecision: string | null;
    routingReason: string | null;
    artifactPath: string | null;
  } | null;
  commitDelta: {
    state: 'unknown' | 'no-op' | 'changed';
    baseCommit: string | null;
    headCommit: string | null;
  };
  observability: JobObservabilitySnapshot;
  keyArtifacts: string[];
  lastAssistantMessages: Array<{
    stepIndex: number;
    sessionTitle: string | null;
    text: string;
  }>;
  steps: StepExecutiveSummary[];
  drilldown: {
    summaryCommand: string;
    logCommand: string;
    reviewCommand?: string;
    unblockCommand?: string;
  };
}

function truncateOneLine(text: string | null | undefined, maxLength = 160): string | null {
  if (typeof text !== 'string') return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function resolveCommitDelta(job: Job): JobExecutiveSummary['commitDelta'] {
  const baseCommit = job.gitBaseCommit;
  const headCommit = job.gitHeadCommit;
  if (!baseCommit || !headCommit) {
    return { state: 'unknown', baseCommit, headCommit };
  }
  return {
    state: baseCommit === headCommit ? 'no-op' : 'changed',
    baseCommit,
    headCommit,
  };
}

function resolveSessionId(step: JobStep): string | null {
  if (step.sessionId) {
    return step.sessionId;
  }
  if (step.sessionTitle) {
    return findSessionByTitle(step.sessionTitle);
  }
  return null;
}

function extractPathLikeTokens(text: string): string[] {
  const matches = text.match(/(?:^|[\s("'`])([A-Za-z0-9._/-]+\.[A-Za-z0-9._-]+)(?=$|[\s),:"'`])/g) ?? [];
  return matches
    .map((match) => match.replace(/^[\s("'`]+/, '').replace(/[),:"'`]+$/, ''))
    .filter((match) => match.includes('/') || match.includes('.'));
}

function buildStepEvidence(step: JobStep, artifactPath: string | null, assistantSummary: string | null): string[] {
  const evidence = [
    truncateOneLine(step.verdictReason, 120),
    truncateOneLine(step.error, 120),
    truncateOneLine(artifactPath, 120),
    truncateOneLine(assistantSummary, 120),
  ].filter((entry): entry is string => Boolean(entry));

  return Array.from(new Set(evidence)).slice(0, 4);
}

function resolveNextAction(job: Job, drilldown: JobExecutiveSummary['drilldown']): string {
  switch (job.status) {
    case 'completed':
      return `Review the changes, then continue with follow-up work. Run \`${drilldown.logCommand}\` for the full transcript.`;
    case 'completed_pending_review':
      return `Human review required. Run \`${drilldown.reviewCommand ?? `pilot review ${job.id} --approve`}\` to approve or reject.`;
    case 'review_hold':
      return `Execution paused. Run \`${drilldown.reviewCommand ?? `pilot review ${job.id} --approve`}\` to resume.`;
    case 'failed':
    case 'cancelled':
      return drilldown.unblockCommand
        ? `Inspect the failure, then run \`${drilldown.unblockCommand}\` and queue a corrective job.`
        : `Inspect the failure with \`${drilldown.logCommand}\`, fix the issue, and queue a new job.`;
    default:
      return `Run \`${drilldown.summaryCommand}\` for the latest state.`;
  }
}

function mapOutcome(status: Job['status']): JobExecutiveSummary['outcome'] {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'failure';
    case 'completed_pending_review':
      return 'review_pending';
    case 'review_hold':
      return 'review_hold';
    default:
      return 'unknown';
  }
}

function resolveCurrentOrFinalStep(steps: JobStep[]): JobExecutiveSummary['currentOrFinalStep'] {
  if (steps.length === 0) return null;
  const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const chosen = ordered.find((step) => step.status === 'running') ?? ordered[ordered.length - 1];
  if (!chosen) return null;
  return {
    index: chosen.stepIndex + 1,
    total: ordered.length,
    command: chosen.command,
    status: chosen.status,
  };
}

function resolveFailureReason(job: Job, steps: JobStep[]): string | null {
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    return null;
  }
  const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const failedStep = [...ordered].reverse().find((step) => step.status === 'failed');
  const currentOrFinal = ordered.find((step) => step.status === 'running') ?? ordered[ordered.length - 1] ?? null;
  return failedStep?.verdictReason ?? job.error ?? currentOrFinal?.verdictReason ?? null;
}

export function buildJobExecutiveSummary(job: Job, steps: JobStep[]): JobExecutiveSummary {
  const orderedSteps = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const why = buildJobWhy(job);
  const retry = buildRetryWhy(job);
  const judgeSignal = buildJudgeSignal(job);
  const verification = judgeSignal.verification
    ? {
      status: judgeSignal.verification.status,
      actionableGapCount: judgeSignal.verification.actionableGapCount,
      humanVerificationCount: judgeSignal.verification.humanVerificationCount,
      routingDecision: judgeSignal.verification.routingDecision,
      routingReason: judgeSignal.verification.routingReason,
      artifactPath: judgeSignal.verification.artifactPath,
    }
    : null;

  const stepSummaries = orderedSteps.map((step) => {
    const sessionId = resolveSessionId(step);
    const assistantMessage = sessionId ? getLatestUsefulAssistantTextMessage(sessionId) : null;
    const assistantSummary = truncateOneLine(assistantMessage?.content ?? null);
    const shortSummary = assistantSummary
      ?? truncateOneLine(step.verdictReason)
      ?? truncateOneLine(step.error);

    return {
      stepIndex: step.stepIndex + 1,
      command: step.command,
      args: step.args,
      status: step.status,
      source: step.source,
      sessionTitle: step.sessionTitle,
      verdictSource: step.verdictSource,
      verdictReason: step.verdictReason,
      error: step.error,
      durationMs: step.durationMs,
      shortSummary,
      evidence: buildStepEvidence(step, verification?.artifactPath ?? null, assistantSummary),
      assistantSummary,
      assistantCreatedAt: assistantMessage?.createdAt ?? null,
    };
  });

  const currentOrFinal = resolveCurrentOrFinalStep(orderedSteps);
  const preferredWhat = (() => {
    const running = stepSummaries.find((step) => step.status === 'running' && step.assistantSummary);
    if (running?.assistantSummary) return running.assistantSummary;
    const finalStep = [...stepSummaries].reverse().find((step) => step.assistantSummary);
    if (finalStep?.assistantSummary) return finalStep.assistantSummary;
    const lastCompleted = [...stepSummaries].reverse().find((step) => step.status === 'completed' && step.assistantSummary);
    if (lastCompleted?.assistantSummary) return lastCompleted.assistantSummary;
    return null;
  })();

  const lastAssistantMessages = [...stepSummaries]
    .filter((step) => step.assistantSummary && step.assistantCreatedAt !== null)
    .sort((a, b) => (b.assistantCreatedAt ?? 0) - (a.assistantCreatedAt ?? 0))
    .reduce<Array<{ stepIndex: number; sessionTitle: string | null; text: string }>>((acc, step) => {
      if (!step.assistantSummary) return acc;
      if (acc.some((entry) => entry.text === step.assistantSummary)) return acc;
      acc.push({
        stepIndex: step.stepIndex,
        sessionTitle: step.sessionTitle,
        text: step.assistantSummary,
      });
      return acc;
    }, [])
    .slice(0, 3);

  const keyArtifacts = Array.from(new Set([
    verification?.artifactPath ?? null,
    ...lastAssistantMessages.flatMap((entry) => extractPathLikeTokens(entry.text)),
  ].filter((entry): entry is string => Boolean(entry)))).slice(0, 5);

  const drilldown: JobExecutiveSummary['drilldown'] = {
    summaryCommand: `pilot summary ${job.id}`,
    logCommand: `pilot log ${job.id}`,
  };
  if (job.status === 'completed_pending_review' || job.status === 'review_hold') {
    drilldown.reviewCommand = `pilot review ${job.id} --approve`;
  }
  if ((job.status === 'failed' || job.status === 'cancelled') && retry.next.includes('pilot unblock')) {
    drilldown.unblockCommand = `pilot unblock "${job.project}"`;
  }

  const nextAction = resolveNextAction(job, drilldown);

  return {
    what: preferredWhat ?? why.what,
    why: why.why,
    next: nextAction,
    statusBadge: why.badge,
    outcome: mapOutcome(job.status),
    currentOrFinalStep: currentOrFinal,
    failureReason: resolveFailureReason(job, orderedSteps),
    judge: judgeSignal.badge || judgeSignal.verdict || judgeSignal.reason || judgeSignal.confidence !== null
      ? {
        verdict: judgeSignal.verdict,
        confidence: judgeSignal.confidence,
        reason: judgeSignal.reason,
        badge: judgeSignal.badge,
      }
      : null,
    verification,
    commitDelta: resolveCommitDelta(job),
    observability: buildJobObservability(job),
    keyArtifacts,
    lastAssistantMessages,
    steps: stepSummaries.map(({ assistantSummary: _assistantSummary, assistantCreatedAt: _assistantCreatedAt, ...step }) => step),
    drilldown,
  };
}
