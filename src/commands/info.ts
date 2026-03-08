/**
 * `pilot info <id>` — Full job metadata dump.
 *
 * Shows all job fields, delegation plan, steps with session IDs,
 * per-session token usage from opencode DB, and cost estimate.
 *
 * Flags:
 *   --json    Output as JSON
 */

import { getJob, getJobSteps } from '../core/db.js';
import { resolveProjectDir } from '../core/config.js';
import {
  classifyHeadRelation,
  isGitWorktree,
  isWorktreeDirty,
  resolveCommitOrNull,
} from '../core/git-recovery.js';
import { buildJobWhy, buildRetryWhy, buildUndoWhy } from '../core/job-introspection.js';
import { findSessionByTitle, getSessionTokens } from '../core/opencode-db.js';
import { resolveAllAgentModels } from '../core/models.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, yellow, cyan } from '../util/colors.js';
import type { DelegationPlan, Job, JobStep } from '../core/types.js';
import type { HeadRelation } from '../core/git-recovery.js';

// ── Cost estimation ────────────────────────────────────────────────────────

// Sonnet pricing (rough estimate): $3/M input, $15/M output
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_COST_PER_M +
         (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatStatusColor(status: string): string {
  switch (status) {
    case 'completed': return green(status);
    case 'failed':    return red(status);
    case 'running':   return yellow(status);
    case 'cancelled': return dim(status);
    default:          return cyan(status);
  }
}

function hr(): string {
  return '────────────────────────────────────────────────────────────────────────────';
}

interface RecoveryInfo {
  tag: string;
  state: 'safe' | 'guarded' | 'unavailable';
  reason:
    | 'checkpoint-ready'
    | 'no-commit-delta'
    | 'dirty-start'
    | 'newer-work'
    | 'diverged-history'
    | 'worktree-dirty-now'
    | 'missing-checkpoints'
    | 'not-git-worktree'
    | 'current-head-unresolved'
    | 'base-checkpoint-unresolved'
    | 'head-checkpoint-unresolved';
  guidance: string;
  baseCommit: string | null;
  headCommit: string | null;
  currentHead: string | null;
  baseShort: string | null;
  headShort: string | null;
  currentShort: string | null;
  allowDirtyStart: boolean;
  startedDirty: boolean;
  relation: HeadRelation | null;
  blockedByNewerWork: boolean;
  diverged: boolean;
  producedCommitDelta: boolean | null;
  worktreeDirtyNow: boolean | null;
  projectIsGit: boolean;
}

interface InfoTriage {
  whatIs: string;
  whatHappened: string;
  whatNext: string;
  providerProfile: string;
  attempts: number;
  step: {
    kind: 'current' | 'final';
    index: number;
    total: number;
    command: string;
    status: JobStep['status'];
    verdictSource: string | null;
    verdictReason: string | null;
  } | null;
  checkpoints: {
    baseCommit: string | null;
    headCommit: string | null;
    delta: 'changed' | 'no-op' | 'unknown';
  };
  retry: ReturnType<typeof buildRetryWhy>;
  undo: ReturnType<typeof buildUndoWhy>;
  recoveryTag: string;
}

function shortCommit(commit: string | null): string | null {
  return commit ? commit.slice(0, 12) : null;
}

function formatCommitDisplay(commit: string | null): string {
  if (!commit) {
    return '—';
  }
  return `${commit.slice(0, 12)} (${commit})`;
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolveCompactStep(steps: JobStep[]): InfoTriage['step'] {
  if (steps.length === 0) return null;
  const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const running = ordered.find((step) => step.status === 'running');
  const chosen = running ?? ordered[ordered.length - 1];
  return {
    kind: running ? 'current' : 'final',
    index: chosen.stepIndex + 1,
    total: ordered.length,
    command: chosen.command,
    status: chosen.status,
    verdictSource: chosen.verdictSource,
    verdictReason: chosen.verdictReason,
  };
}

function buildInfoTriage(job: Job, steps: JobStep[], recovery: RecoveryInfo): InfoTriage {
  const statusWhy = buildJobWhy(job);
  const retry = buildRetryWhy(job);
  const undo = buildUndoWhy(job);

  const whatIs = `${job.scope} job in ${job.project}: ${normalizeSingleLine(job.description)}`;

  const happenedParts = [statusWhy.what];
  if (job.status === 'failed' && job.error) {
    happenedParts.push(`Last failure: ${normalizeSingleLine(job.error)}`);
  }
  const whatHappened = normalizeSingleLine(happenedParts.join(' '));

  let whatNext = statusWhy.next;
  if (job.status === 'failed' || job.status === 'cancelled') {
    whatNext = retry.next;
  } else if (job.status === 'completed') {
    whatNext = undo.next;
  }

  const delta = recovery.producedCommitDelta === null
    ? 'unknown'
    : recovery.producedCommitDelta
      ? 'changed'
      : 'no-op';

  return {
    whatIs,
    whatHappened,
    whatNext,
    providerProfile: `${job.modelProfile}/${job.providerMode}`,
    attempts: job.attempts,
    step: resolveCompactStep(steps),
    checkpoints: {
      baseCommit: recovery.baseCommit,
      headCommit: recovery.headCommit,
      delta,
    },
    retry,
    undo,
    recoveryTag: recovery.tag,
  };
}

function inferRecoveryFromMetadata(
  state: RecoveryInfo['state'],
  reason: RecoveryInfo['reason'],
  guidance: string,
  baseCommit: string | null,
  headCommit: string | null,
  currentHead: string | null,
  allowDirtyStart: boolean,
  startedDirty: boolean,
): RecoveryInfo {
  return {
    tag:
      state === 'safe'
        ? 'undo:safe'
        : state === 'guarded'
          ? 'undo:guarded'
          : 'undo:unavailable',
    state,
    reason,
    guidance,
    baseCommit,
    headCommit,
    currentHead,
    baseShort: shortCommit(baseCommit),
    headShort: shortCommit(headCommit),
    currentShort: shortCommit(currentHead),
    allowDirtyStart,
    startedDirty,
    relation: null,
    blockedByNewerWork: false,
    diverged: false,
    producedCommitDelta:
      baseCommit !== null && headCommit !== null ? baseCommit !== headCommit : null,
    worktreeDirtyNow: null,
    projectIsGit: false,
  };
}

async function buildRecoveryInfo(job: {
  id: string;
  project: string;
  gitBaseCommit: string | null;
  gitHeadCommit: string | null;
  allowDirtyStart: boolean;
  startedDirty: boolean;
}): Promise<RecoveryInfo> {
  const projectDir = resolveProjectDir(job.project);
  const hasCheckpoints = !!job.gitBaseCommit && !!job.gitHeadCommit;

  if (!hasCheckpoints) {
    return inferRecoveryFromMetadata(
      'unavailable',
      'missing-checkpoints',
      'Undo unavailable: this job has no recorded base/head checkpoints.',
      job.gitBaseCommit,
      job.gitHeadCommit,
      null,
      job.allowDirtyStart,
      job.startedDirty,
    );
  }

  const inGitWorktree = await isGitWorktree(projectDir);
  if (!inGitWorktree) {
    return inferRecoveryFromMetadata(
      'unavailable',
      'not-git-worktree',
      'Undo unavailable: project is not currently a git worktree.',
      job.gitBaseCommit,
      job.gitHeadCommit,
      null,
      job.allowDirtyStart,
      job.startedDirty,
    );
  }

  const [currentHead, baseCommit, headCommit, worktreeDirtyNow] = await Promise.all([
    resolveCommitOrNull(projectDir, 'HEAD'),
    resolveCommitOrNull(projectDir, job.gitBaseCommit!),
    resolveCommitOrNull(projectDir, job.gitHeadCommit!),
    isWorktreeDirty(projectDir),
  ]);

  if (!currentHead) {
    return {
      ...inferRecoveryFromMetadata(
        'unavailable',
        'current-head-unresolved',
        'Undo unavailable: could not resolve current repository HEAD.',
        baseCommit,
        headCommit,
        currentHead,
        job.allowDirtyStart,
        job.startedDirty,
      ),
      projectIsGit: true,
      worktreeDirtyNow,
    };
  }

  if (!baseCommit) {
    return {
      ...inferRecoveryFromMetadata(
        'unavailable',
        'base-checkpoint-unresolved',
        `Undo unavailable: stored base checkpoint ${job.gitBaseCommit} cannot be resolved.`,
        baseCommit,
        headCommit,
        currentHead,
        job.allowDirtyStart,
        job.startedDirty,
      ),
      projectIsGit: true,
      worktreeDirtyNow,
    };
  }

  if (!headCommit) {
    return {
      ...inferRecoveryFromMetadata(
        'unavailable',
        'head-checkpoint-unresolved',
        `Undo unavailable: stored head checkpoint ${job.gitHeadCommit} cannot be resolved.`,
        baseCommit,
        headCommit,
        currentHead,
        job.allowDirtyStart,
        job.startedDirty,
      ),
      projectIsGit: true,
      worktreeDirtyNow,
    };
  }

  const producedCommitDelta = baseCommit !== headCommit;
  const relation = await classifyHeadRelation(projectDir, headCommit, currentHead);
  const blockedByNewerWork = relation === 'newer-work-exists';
  const diverged = relation === 'diverged';

  let state: RecoveryInfo['state'] = 'safe';
  let reason: RecoveryInfo['reason'] = 'checkpoint-ready';
  let guidance = 'Undo is safe to preview now (recommended: pilot undo <id> --dry-run).';
  let tag = 'undo:safe';

  if (!producedCommitDelta) {
    reason = 'no-commit-delta';
    guidance = 'This job recorded no commit delta between base/head checkpoints (nothing to undo).';
  }

  if (job.startedDirty) {
    state = 'guarded';
    reason = 'dirty-start';
    tag = 'undo:guarded-dirty-start';
    guidance = 'Undo guarded: job started from a dirty worktree; override requires --force and may discard pre-existing edits.';
  }

  if (blockedByNewerWork) {
    state = 'guarded';
    reason = 'newer-work';
    tag = 'undo:guarded-newer-work';
    guidance = 'Undo blocked by newer work: current HEAD is ahead of this job checkpoint. Undo newer work first or use --force.';
  }

  if (diverged) {
    state = 'guarded';
    reason = 'diverged-history';
    tag = 'undo:guarded-diverged';
    guidance = 'Undo guarded: current HEAD diverged from this checkpoint. Review history and use --force only intentionally.';
  }

  if (worktreeDirtyNow) {
    state = 'guarded';
    reason = 'worktree-dirty-now';
    tag = 'undo:guarded-dirty-worktree';
    guidance = 'Undo blocked right now: worktree has local changes. Commit/stash/discard them first.';
  }

  return {
    tag,
    state,
    reason,
    guidance,
    baseCommit,
    headCommit,
    currentHead,
    baseShort: shortCommit(baseCommit),
    headShort: shortCommit(headCommit),
    currentShort: shortCommit(currentHead),
    allowDirtyStart: job.allowDirtyStart,
    startedDirty: job.startedDirty,
    relation,
    blockedByNewerWork,
    diverged,
    producedCommitDelta,
    worktreeDirtyNow,
    projectIsGit: true,
  };
}

// ── Main command ──────────────────────────────────────────────────────────

async function infoCommand(id: string, opts: { json?: boolean }): Promise<void> {
  void opts; // opts.json handled via global isJsonMode()

  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }

  const steps = getJobSteps(id);

  // Parse delegation plan
  let delegationPlan: DelegationPlan | null = null;
  if (job.delegationPlan) {
    try {
      delegationPlan = JSON.parse(job.delegationPlan) as DelegationPlan;
    } catch {
      delegationPlan = null;
    }
  }

  // Parse session titles
  let sessionTitles: string[] = [];
  if (job.sessionTitles) {
    try {
      sessionTitles = JSON.parse(job.sessionTitles) as string[];
    } catch {
      sessionTitles = [];
    }
  }

  // Resolve token usage per session title
  interface SessionTokenInfo {
    title: string;
    sessionId: string | null;
    tokens: { input: number; output: number };
  }

  const sessionTokens: SessionTokenInfo[] = sessionTitles.map((title) => {
    const sessionId = findSessionByTitle(title);
    const tokens = sessionId ? getSessionTokens(sessionId) : { input: 0, output: 0 };
    return { title, sessionId, tokens };
  });

  // Aggregate totals
  let totalInput = 0;
  let totalOutput = 0;
  for (const s of sessionTokens) {
    totalInput += s.tokens.input;
    totalOutput += s.tokens.output;
  }
  const totalTokens = totalInput + totalOutput;
  const estimatedCostUsd = estimateCost(totalInput, totalOutput);
  const recovery = await buildRecoveryInfo(job);
  const triage = buildInfoTriage(job, steps, recovery);

  // ── JSON output ────────────────────────────────────────────────────────

  const resolvedModels = resolveAllAgentModels(job.modelProfile, job.providerMode);

  if (isJsonMode()) {
    outputJson({
      job,
      triage,
      delegationPlan,
      steps,
      sessions: sessionTokens,
      recovery,
      resolvedModels,
      actualModels: job.actualModels,
      tokenUsage: {
        totalInput,
        totalOutput,
        total: totalTokens,
        estimatedCostUsd: parseFloat(estimatedCostUsd.toFixed(4)),
      },
    });
    return;
  }

  // ── Human output ───────────────────────────────────────────────────────

  outputHuman('');
  outputHuman(`  ${bold(`Job #${job.id}`)}`);
  outputHuman(`  ${hr()}`);
  outputHuman('');

  outputHuman(`  ${bold('Triage')}`);
  outputHuman(`  ${hr()}`);
  outputHuman(`  ${dim('What this is:')} ${triage.whatIs}`);
  outputHuman(`  ${dim('What happened:')} ${triage.whatHappened}`);
  outputHuman(`  ${dim('What next:')} ${triage.whatNext}`);
  outputHuman(`  ${dim('Run profile:')} ${triage.providerProfile} · attempts ${triage.attempts}`);
  if (triage.step) {
    outputHuman(`  ${dim('Current/final step:')} ${triage.step.kind} ${triage.step.index}/${triage.step.total} ${triage.step.command} [${triage.step.status}]`);
    if (triage.step.verdictSource || triage.step.verdictReason) {
      const verdictParts = [triage.step.verdictSource, triage.step.verdictReason]
        .filter((part): part is string => Boolean(part));
      outputHuman(`  ${dim('Step verdict:')} ${normalizeSingleLine(verdictParts.join(': '))}`);
    }
  } else {
    outputHuman(`  ${dim('Current/final step:')} no recorded step metadata`);
  }
  outputHuman(
    `  ${dim('Checkpoints:')} ${formatCommitDisplay(triage.checkpoints.baseCommit)} -> ${formatCommitDisplay(triage.checkpoints.headCommit)} (${triage.checkpoints.delta})`,
  );
  outputHuman(`  ${dim('Retryability:')} ${triage.retry.badge} (${triage.retry.code})`);
  outputHuman(`  ${dim('Undo safety:')} ${triage.undo.badge} (${triage.undo.code})`);
  outputHuman(`  ${dim('Recovery tag:')} ${triage.recoveryTag}`);
  outputHuman('');

  // Core fields
  const pad = (label: string) => label.padEnd(12);
  outputHuman(`  ${dim(pad('Project:'))}  ${job.project}`);
  outputHuman(`  ${dim(pad('Scope:'))}    ${job.scope}`);
  outputHuman(`  ${dim(pad('Description:'))} ${job.description}`);
  outputHuman(`  ${dim(pad('Status:'))}   ${formatStatusColor(job.status)}`);
  if (job.error) {
    outputHuman(`  ${dim(pad('Error:'))}    ${red(job.error)}`);
  }

  // Show judge verdict for completed phase jobs
  if (job.status === 'completed' && job.scope === 'phase') {
    if (!job.judgeVerdict) {
      outputHuman(`  ${dim(pad('Verdict:'))}  ${yellow('⚠ no judge verdict')}`);
    } else {
      try {
        const v = JSON.parse(job.judgeVerdict) as { verdict?: string; confidence?: number; summary?: string };
        const isInc = typeof v.confidence === 'number' && v.confidence === 0;
        const verdictStr = isInc
          ? yellow(`⚠ inconclusive — ${v.summary ?? 'benefit of doubt'}`)
          : green(`✓ ${v.verdict} (${v.confidence}%) — ${v.summary ?? ''}`);
        outputHuman(`  ${dim(pad('Verdict:'))}  ${verdictStr}`);
      } catch {
        outputHuman(`  ${dim(pad('Verdict:'))}  ${yellow('⚠ unparseable verdict')}`);
      }
    }
  }

  outputHuman('');

  // Config / timing
  outputHuman(`  ${dim(pad('Model:'))}    ${job.modelProfile}/${job.providerMode}`);
  if (job.actualModels && job.actualModels.length > 0) {
    const actualStr = job.actualModels.join(', ');
    const resolvedExecutor = resolvedModels['gsd-executor']?.model ?? '';
    const hasMismatch = !job.actualModels.some(m => m === resolvedExecutor);
    const colorFn = hasMismatch ? yellow : dim;
    outputHuman(`  ${colorFn(pad('Actual:'))}   ${colorFn(actualStr)}${hasMismatch ? yellow(' (differs from intended)') : ''}`);
  } else if (job.status === 'completed' || job.status === 'failed') {
    outputHuman(`  ${dim(pad('Actual:'))}   ${dim('—')}`);
  }
  outputHuman(`  ${dim(pad('Attempts:'))} ${job.attempts}`);
  outputHuman(`  ${dim(pad('Created:'))}  ${job.createdAt}`);
  outputHuman(`  ${dim(pad('Started:'))}  ${job.startedAt ?? '—'}`);
  outputHuman(`  ${dim(pad('Completed:'))} ${job.completedAt ?? '—'}`);
  if (job.dependsOn) {
    outputHuman(`  ${dim(pad('Depends On:'))} ${job.dependsOn}`);
  }
  outputHuman('');

  outputHuman(`  ${bold('Recovery')}`);
  outputHuman(`  ${hr()}`);
  outputHuman(`  ${dim(pad('Safety:'))}   ${recovery.tag} (${recovery.state})`);
  outputHuman(`  ${dim(pad('Base:'))}     ${formatCommitDisplay(recovery.baseCommit)}`);
  outputHuman(`  ${dim(pad('Head:'))}     ${formatCommitDisplay(recovery.headCommit)}`);
  outputHuman(`  ${dim(pad('Current:'))}  ${formatCommitDisplay(recovery.currentHead)}`);
  outputHuman(`  ${dim(pad('Dirty start:'))} ${recovery.startedDirty ? 'yes' : 'no'}`);
  outputHuman(`  ${dim(pad('Allow dirty:'))} ${recovery.allowDirtyStart ? 'yes' : 'no'}`);
  outputHuman(`  ${dim(pad('Worktree:'))} ${recovery.worktreeDirtyNow === null ? '—' : recovery.worktreeDirtyNow ? 'dirty' : 'clean'}`);
  if (recovery.relation) {
    outputHuman(`  ${dim(pad('Relation:'))} ${recovery.relation}`);
  }
  outputHuman(`  ${dim(pad('Guidance:'))} ${recovery.guidance}`);
  outputHuman('');

  // Resolved models (when not default profile)
  if (job.modelProfile !== 'balanced') {
    outputHuman(`  ${bold('Resolved Models')}`);
    outputHuman(`  ${hr()}`);
    for (const [agentName, entry] of Object.entries(resolvedModels)) {
      const shortAgent = agentName.replace('gsd-', '');
      const display = entry.variant ? `${entry.model} (variant: ${entry.variant})` : entry.model;
      outputHuman(`    ${dim(shortAgent.padEnd(24))} ${display}`);
    }
    outputHuman('');
  }

  // Delegation plan
  if (delegationPlan && delegationPlan.steps.length > 0) {
    outputHuman(`  ${bold('Delegation Plan')}`);
    outputHuman(`  ${hr()}`);
    if (delegationPlan.reasoning) {
      outputHuman(`  ${dim(delegationPlan.reasoning)}`);
      outputHuman('');
    }
    delegationPlan.steps.forEach((step, i) => {
      outputHuman(`    ${dim(`${i + 1}.`)} ${step.command} ${dim(`"${step.args}"`)}`);
    });
    outputHuman('');
  }

  // Steps
  if (steps.length > 0) {
    outputHuman(`  ${bold('Steps')}`);
    outputHuman(`  ${hr()}`);

    for (const step of steps) {
      const num = `${step.stepIndex + 1}.`;
      const cmd = step.command + (step.args ? ` ${step.args}` : '');

      // Duration
      let durationStr = '';
      if (step.durationMs !== null) {
        const totalSec = Math.round(step.durationMs / 1000);
        if (totalSec < 60) {
          durationStr = ` (${totalSec}s)`;
        } else {
          const m = Math.floor(totalSec / 60);
          const s = totalSec % 60;
          durationStr = s > 0 ? ` (${m}m ${s}s)` : ` (${m}m)`;
        }
      }

      // Status icon
      let icon: string;
      let colorFn: (s: string) => string;
      switch (step.status) {
        case 'completed': icon = '✓'; colorFn = green; break;
        case 'failed':    icon = '✗'; colorFn = red; break;
        case 'skipped':   icon = '○'; colorFn = dim; break;
        default:          icon = '⟳'; colorFn = yellow; break;
      }

      // Verdict
      let verdictStr = '';
      if (step.verdictSource || step.verdictReason) {
        const parts: string[] = [];
        if (step.verdictSource) parts.push(step.verdictSource);
        if (step.verdictReason) {
          const reason = step.verdictReason.length > 60
            ? step.verdictReason.slice(0, 57) + '...'
            : step.verdictReason;
          parts.push(reason);
        }
        verdictStr = ` [${parts.join(': ')}]`;
      }

      outputHuman(`    ${colorFn(`${icon} ${num} ${cmd}${durationStr}${verdictStr}`)}`);

      // Session info + tokens
      if (step.sessionTitle) {
        const sessionId = findSessionByTitle(step.sessionTitle);
        const tokens = sessionId ? getSessionTokens(sessionId) : null;
        const tokenStr = tokens && (tokens.input + tokens.output) > 0
          ? `  Tokens: ${formatTokenCount(tokens.input)} in / ${formatTokenCount(tokens.output)} out`
          : '';
        outputHuman(`      ${dim(`Session: ${step.sessionTitle}${tokenStr}`)}`);
      }
    }
    outputHuman('');
  }

  // Token usage summary
  outputHuman(`  ${bold('Token Usage')}`);
  outputHuman(`  ${hr()}`);
  if (totalTokens > 0) {
    outputHuman(
      `  Total: ${formatTokenCount(totalInput)} input / ${formatTokenCount(totalOutput)} output (${formatTokenCount(totalTokens)} total)`,
    );
    outputHuman(
      `  Est. cost: $${estimatedCostUsd.toFixed(2)} (based on claude-sonnet-4-20250514 pricing: $${INPUT_COST_PER_M}/$${OUTPUT_COST_PER_M} per 1M)`,
    );
  } else {
    outputHuman(`  ${dim('No token data available')}`);
  }
  outputHuman('');
}

export { infoCommand };
