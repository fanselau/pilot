/**
 * `pilot log [id]` — Full session activity stream from opencode DB.
 *
 * Shows tool calls, patches, text, delegation/execution session sections.
 * Smart default: if no ID, shows latest running job.
 *
 * Flags:
 *   --follow     Poll for new parts in real-time
 *   --last N     Show last N parts
 *   --verbose    Show reasoning parts and full tool output
 *   --delegation Show ONLY delegation session(s)
 */

import { getJob, getQueue, getJobSteps, getRetryAttempts } from '../core/db.js';
import { buildJobWhy, buildRetryWhy } from '../core/job-introspection.js';
import { buildJobObservability } from '../core/job-observability.js';
import { buildJudgeSignal } from '../core/judge-signal.js';
import {
  findSessionByTitle,
  getSessionParts,
  getChildSessions,
  getSessionTokens,
  getSessionTokensRecursive,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, cyan, green, yellow, red } from '../util/colors.js';
import type { SessionPart, Job, JobStep, JobObservabilitySnapshot } from '../core/types.js';

const KNOWN_GSD_COMMANDS = [
  'add-phase', 'plan-phase', 'execute-phase', 'verify-phase', 'ui-phase', 'ui-review',
  'judge', 'debugger', 'fast', 'quick',
  'new-project', 'new-milestone', 'audit-milestone',
];

interface LogOptions {
  json?: boolean;
  summary?: boolean;
  follow?: boolean;
  last?: number;
  verbose?: boolean;
  delegation?: boolean;
  chain?: boolean;
  flat?: boolean;    // suppress child session expansion
  task?: number;     // show only the Nth child session (1-indexed)
}

// ── Session categorization ────────────────────────────────────────────────

interface CategorizedSession {
  title: string;
  sessionId: string | null;
  type: 'delegation' | 'execution' | 'verify';
  command?: string;   // extracted command for execution sessions
}

interface AttemptSessionGroup {
  attemptNumber: number;
  source: 'archived' | 'current';
  retryStrategy: string | null;
  retryHint: string | null;
  sessions: CategorizedSession[];
}

/**
 * Categorize session titles into delegation vs execution vs verify.
 * Delegation pattern: `pilot-delegate-{jobId}-N`
 * Verify pattern: `pilot-verify-{jobId}-N`
 * Everything else is execution.
 */
function categorizeSessions(sessionTitles: string[]): CategorizedSession[] {
  return sessionTitles.map((title) => {
    const isDelegation = title.startsWith('pilot-delegate-');
    const isVerify = title.startsWith('pilot-verify-');
    const sessionId = findSessionByTitle(title);

    if (isDelegation) {
      return { title, sessionId, type: 'delegation' as const };
    }

    if (isVerify) {
      return { title, sessionId, type: 'verify' as const };
    }

    // Extract command from title by matching against known GSD commands
    let command: string | undefined;
    for (const cmd of KNOWN_GSD_COMMANDS) {
      if (title.includes(`-${cmd}-`) || title.includes(`-gsd-${cmd}-`)) {
        command = cmd;
        break;
      }
    }

    return { title, sessionId, type: 'execution' as const, command };
  });
}

function parseSessionTitles(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // Treat malformed payloads as no sessions.
  }
  return [];
}

function deduplicateSessions(sessions: CategorizedSession[]): CategorizedSession[] {
  const seenTitles = new Set<string>();
  return sessions.filter((session) => {
    if (seenTitles.has(session.title)) return false;
    seenTitles.add(session.title);
    return true;
  });
}

function filterCurrentAttemptSessions(
  sessions: CategorizedSession[],
  steps: JobStep[],
): CategorizedSession[] {
  const uniqueSessions = deduplicateSessions(sessions);
  const stepSessionTitles = new Set(
    steps.filter((step) => step.sessionTitle).map((step) => step.sessionTitle!),
  );
  if (stepSessionTitles.size === 0) {
    return uniqueSessions;
  }

  return uniqueSessions.filter(
    (session) => session.type === 'delegation'
      || session.type === 'verify'
      || stepSessionTitles.has(session.title),
  );
}

function resolveCurrentAttemptNumber(job: Job): number {
  return job.attempts;
}

function buildAttemptSessionGroups(job: Job, steps: JobStep[], chainMode: boolean): AttemptSessionGroup[] {
  const currentTitles = parseSessionTitles(job.sessionTitles);
  const currentSessions = categorizeSessions(currentTitles);
  const currentAttemptNumber = resolveCurrentAttemptNumber(job);
  const currentGroup: AttemptSessionGroup = {
    attemptNumber: currentAttemptNumber,
    source: 'current',
    retryStrategy: null,
    retryHint: job.retryHint,
    sessions: filterCurrentAttemptSessions(currentSessions, steps),
  };

  if (!chainMode) {
    return [currentGroup];
  }

  const archivedGroups: AttemptSessionGroup[] = getRetryAttempts(job.id).map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    source: 'archived',
    retryStrategy: attempt.retryStrategy,
    retryHint: attempt.retryHint,
    sessions: deduplicateSessions(categorizeSessions(attempt.sessionTitles ?? [])),
  }));

  return [...archivedGroups, currentGroup].sort((a, b) => {
    if (a.attemptNumber !== b.attemptNumber) {
      return a.attemptNumber - b.attemptNumber;
    }
    if (a.source === b.source) {
      return 0;
    }
    return a.source === 'archived' ? -1 : 1;
  });
}

// ── Part formatting ───────────────────────────────────────────────────────

/** Return current terminal width, defaulting to 120 if stdout is not a TTY. */
const termWidth = (): number => process.stdout.columns ?? 120;

/**
 * Soft-truncate a string to maxLen characters, appending '…' if truncated.
 */
function truncateForTerminal(s: string, maxLen: number): string {
  const limit = Math.max(20, maxLen);
  return s.length <= limit ? s : s.slice(0, limit) + '…';
}

/**
 * Format a timestamp as HH:MM:SS.
 */
function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a single part for human output (compact, one line per part).
 */
function formatPart(part: SessionPart, verbose: boolean): string[] {
  const time = dim(formatTime(part.createdAt));
  const lines: string[] = [];

  if (part.type === 'tool') {
    const tool = part.tool ?? 'unknown';

    if (tool === 'bash') {
      const rawCmd = part.toolInput ?? '';
      const cmd = verbose
        ? rawCmd
        : truncateForTerminal(rawCmd, Math.max(40, termWidth() - 30));
      lines.push(`  ${time}  ${yellow(`[assistant] bash $ ${cmd}`)}`);
      // Show output (dim, indented)
      if (part.toolOutput) {
        const output = verbose
          ? part.toolOutput
          : truncateForTerminal(part.toolOutput, Math.max(40, termWidth() - 20));
        if (output.trim()) {
          lines.push(`  ${dim('             → ' + output.replace(/\n/g, '\n               '))}`);
        }
      }
    } else if (tool === 'read' || tool === 'write' || tool === 'edit') {
      lines.push(`  ${time}  ${yellow(`[assistant] ${tool} ${part.toolInput ?? ''}`)}`);
    } else if (tool === 'glob' || tool === 'grep') {
      const rawInput = part.toolInput ?? '';
      const input = verbose
        ? rawInput
        : truncateForTerminal(rawInput, Math.max(40, termWidth() - 40));
      lines.push(`  ${time}  ${yellow(`[assistant] ${tool} ${input}`)}`);
    } else {
      const rawInput = part.toolInput ?? '';
      const input = verbose
        ? rawInput
        : truncateForTerminal(rawInput, Math.max(40, termWidth() - 40));
      lines.push(`  ${time}  ${yellow(`[assistant] ${tool} ${input}`)}`);
    }
    return lines;
  }

  if (part.type === 'text') {
    const text = part.text ?? '';
    if (!text.trim()) return [];

    const roleStr = part.role === 'user'
      ? green('[user]')
      : cyan('[assistant]');
    const content = verbose
      ? text.replace(/\n/g, '\n               ')
      : truncateForTerminal(text.split('\n')[0] ?? '', Math.max(40, termWidth() - 25)).replace(/\n/g, ' ');
    lines.push(`  ${time}  ${roleStr} ${content}`);
    return lines;
  }

  if (part.type === 'patch') {
    const files = part.patchFiles?.join(', ') ?? 'unknown';
    lines.push(`  ${time}  ${green(`[assistant] patch ${files}`)}`);
    return lines;
  }

  if (part.type === 'reasoning') {
    if (!verbose) return []; // Skip by default
    const text = part.text ?? '';
    if (!text.trim()) return [];
    const content = text.replace(/\n/g, '\n               ');
    lines.push(`  ${time}  ${dim(`[thinking] ${content}`)}`);
    return lines;
  }

  // step-start, step-finish — skip entirely
  return [];
}

// ── Step formatting ───────────────────────────────────────────────────

/**
 * Format duration in human-friendly form (Xs, Xm Ys).
 */
function formatStepDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Format token count compactly: >=1M → "1.2M", >=1k → "45.2k", else raw.
 */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatObservabilityStatus(status: JobObservabilitySnapshot['tokens']['status']): string {
  switch (status) {
    case 'available':
      return 'available';
    case 'partial':
      return 'partial/live';
    default:
      return 'unavailable';
  }
}

function formatEstimatedCost(observability: JobObservabilitySnapshot): string {
  if (observability.cost.estimatedUsd === null) {
    return `unavailable (${observability.cost.status})`;
  }
  const precision = observability.cost.estimatedUsd >= 1 ? 2 : 4;
  return `~$${observability.cost.estimatedUsd.toFixed(precision)} (${observability.cost.status})`;
}

/**
 * Render a compact step summary for the human log output.
 * Includes per-step token usage when available from opencode DB.
 */
function formatStepsSummary(steps: JobStep[]): string[] {
  if (steps.length === 0) return [];

  const lines: string[] = [];
  lines.push(`  ${dim('Steps:')}`);

  for (const step of steps) {
    const num = `${step.stepIndex + 1}.`;
    const cmd = step.command + (step.args ? ` ${step.args}` : '');
    const duration = formatStepDuration(step.durationMs);
    const durationStr = duration ? ` (${duration})` : '';

    let icon: string;
    let statusColor: (s: string) => string;
    switch (step.status) {
      case 'completed':
        icon = '✓';
        statusColor = green;
        break;
      case 'failed':
        icon = '✗';
        statusColor = red;
        break;
      case 'skipped':
        icon = '○';
        statusColor = dim;
        break;
      default: // running
        icon = '⟳';
        statusColor = yellow;
        break;
    }

    let verdictStr = '';
    if (step.verdictSource || step.verdictReason) {
      const parts: string[] = [];
      if (step.verdictSource) parts.push(step.verdictSource);
      if (step.verdictReason) {
        // Truncate long reasons
        const reason = step.verdictReason.length > 60
          ? step.verdictReason.slice(0, 57) + '...'
          : step.verdictReason;
        parts.push(reason);
      }
      verdictStr = ` [${parts.join(': ')}]`;
    }

    // Per-step token usage (from opencode DB via session title — recursive to include subagents)
    let tokenStr = '';
    if (step.sessionTitle) {
      const sessionId = findSessionByTitle(step.sessionTitle);
      if (sessionId) {
        const tokens = getSessionTokensRecursive(sessionId);
        const total = tokens.input + tokens.output;
        if (total > 0) {
          const reasoningStr = tokens.reasoning > 0 ? ` (${formatTokenCount(tokens.reasoning)} thinking)` : '';
          tokenStr = ` · ${formatTokenCount(total)} tok${reasoningStr}`;
        }
      }
    }

    lines.push(`    ${statusColor(`${icon} ${num} ${cmd}${durationStr}${tokenStr}${verdictStr}`)}`);
  }

  return lines;
}

type OutcomeSignal = 'pass' | 'fail' | null;

interface LogSummaryStep {
  kind: 'current' | 'final';
  index: number;
  total: number;
  command: string;
  status: JobStep['status'];
  verdictSource: string | null;
  verdictReason: string | null;
}

interface LogSummaryData {
  what: string;
  why: string;
  next: string;
  badge: string;
  code: string;
  step: LogSummaryStep | null;
  signals: {
    build: OutcomeSignal;
    test: OutcomeSignal;
  };
  observability: JobObservabilitySnapshot;
  failureContext: {
    failed: boolean;
    failedStep: {
      index: number;
      total: number;
      command: string;
      verdictSource: string | null;
      verdictReason: string | null;
    } | null;
    completedBeforeFailure: {
      completed: number;
      total: number;
    };
    retry: ReturnType<typeof buildRetryWhy>;
  };
  commitDelta: {
    state: 'changed' | 'no-op' | 'unknown';
    baseCommit: string | null;
    headCommit: string | null;
  };
  failureReason: string | null;
  verification: ReturnType<typeof buildJudgeSignal>['verification'];
}

function mergeOutcome(current: OutcomeSignal, incoming: OutcomeSignal): OutcomeSignal {
  if (current === 'fail' || incoming === 'fail') return 'fail';
  if (current === 'pass') return 'pass';
  return incoming;
}

function detectOutcomeFromText(text: string, kind: 'build' | 'test'): OutcomeSignal {
  const lower = text.toLowerCase();
  if (!lower.trim()) return null;

  if (kind === 'build') {
    const buildMentioned = /(build|compile|compilation|tsc)/.test(lower);
    if (!buildMentioned) return null;
    if (/(failed|failure|error|errors|broke|broken)/.test(lower)) return 'fail';
    if (/(pass|passed|success|succeeded|successful|clean|ok)/.test(lower)) return 'pass';
    return null;
  }

  const testMentioned = /(test|tests|vitest|jest|pytest|unit test|integration test)/.test(lower);
  if (!testMentioned) return null;
  if (/(failed|failing|failure|error|errors|red)/.test(lower)) return 'fail';
  if (/(pass|passed|success|succeeded|successful|green|ok)/.test(lower)) return 'pass';
  return null;
}

function collectOutcomeSignals(steps: JobStep[]): { build: OutcomeSignal; test: OutcomeSignal } {
  let build: OutcomeSignal = null;
  let test: OutcomeSignal = null;

  const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  for (const step of ordered) {
    const text = `${step.verdictSource ?? ''} ${step.verdictReason ?? ''}`;
    build = mergeOutcome(build, detectOutcomeFromText(text, 'build'));
    test = mergeOutcome(test, detectOutcomeFromText(text, 'test'));
  }

  return { build, test };
}

function resolveSummaryStep(steps: JobStep[]): LogSummaryStep | null {
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

function resolveCommitDelta(job: Job): LogSummaryData['commitDelta'] {
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

function shortCommit(commit: string | null): string {
  return commit ? commit.slice(0, 12) : '—';
}

function buildSummaryData(job: Job, steps: JobStep[]): LogSummaryData {
  const why = buildJobWhy(job);
  const retry = buildRetryWhy(job);
  const observability = buildJobObservability(job);
  const step = resolveSummaryStep(steps);
  const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  const failedStep = [...ordered].reverse().find((entry) => entry.status === 'failed');
  const completedCount = ordered.filter((entry) => entry.status === 'completed').length;

  let failureReason: string | null = null;
  if (job.status === 'failed' || job.status === 'cancelled') {
    failureReason = failedStep?.verdictReason ?? job.error ?? step?.verdictReason ?? null;
  }

  return {
    what: why.what,
    why: why.why,
    next: why.next,
    badge: why.badge,
    code: why.code,
    step,
    signals: collectOutcomeSignals(steps),
    observability,
    failureContext: {
      failed: job.status === 'failed' || job.status === 'cancelled',
      failedStep: failedStep
        ? {
          index: failedStep.stepIndex + 1,
          total: ordered.length,
          command: failedStep.command,
          verdictSource: failedStep.verdictSource,
          verdictReason: failedStep.verdictReason,
        }
        : null,
      completedBeforeFailure: {
        completed: completedCount,
        total: ordered.length,
      },
      retry,
    },
    commitDelta: resolveCommitDelta(job),
    failureReason,
    verification: buildJudgeSignal(job).verification,
  };
}

function renderSummaryHuman(job: Job, summary: LogSummaryData): void {
  outputHuman('');
  outputHuman(`  ${bold(job.project)} · ${job.scope} · ${dim(job.id)}`);
  outputHuman(`  ${bold('Summary')}`);
  outputHuman(`  ${dim(`status: ${job.status}  attempts: ${job.attempts}  badge: ${summary.badge}`)}`);

  if (summary.step) {
    outputHuman(
      `  ${dim(`${summary.step.kind} step:`)} ${summary.step.index}/${summary.step.total} ${summary.step.command} ${dim(`[${summary.step.status}]`)}`,
    );
    if (summary.step.verdictSource || summary.step.verdictReason) {
      const verdictParts = [summary.step.verdictSource, summary.step.verdictReason]
        .filter((part): part is string => Boolean(part));
      outputHuman(`  ${dim(`step verdict: ${verdictParts.join(': ')}`)}`);
    }
  } else {
    outputHuman(`  ${dim('step: no step metadata recorded')}`);
  }

  const signalParts: string[] = [];
  if (summary.signals.build) signalParts.push(`build=${summary.signals.build}`);
  if (summary.signals.test) signalParts.push(`test=${summary.signals.test}`);
  if (signalParts.length > 0) {
    outputHuman(`  ${dim(`signals: ${signalParts.join('  ')}`)}`);
  }

  const observedModels = summary.observability.observed.models.length > 0
    ? summary.observability.observed.models.join(', ')
    : '—';
  outputHuman(
    `  ${dim(`observed models (${formatObservabilityStatus(summary.observability.observed.status)}): ${observedModels}`)}`,
  );
  if (summary.observability.tokens.totals) {
    const totals = summary.observability.tokens.totals;
    outputHuman(
      `  ${dim(`tokens (${formatObservabilityStatus(summary.observability.tokens.status)}): ${formatTokenCount(totals.total)} total (${formatTokenCount(totals.input)} in / ${formatTokenCount(totals.output)} out / ${formatTokenCount(totals.reasoning)} thinking)`)}`,
    );
  } else {
    outputHuman(`  ${dim(`tokens (${formatObservabilityStatus(summary.observability.tokens.status)}): unavailable`)}`);
  }
  outputHuman(`  ${dim(`estimated cost: ${formatEstimatedCost(summary.observability)}`)}`);

  if (summary.commitDelta.state === 'unknown') {
    outputHuman('  commit delta: unknown (missing recovery checkpoints)');
  } else if (summary.commitDelta.state === 'no-op') {
    outputHuman(
      `  commit delta: no-op (${shortCommit(summary.commitDelta.baseCommit)} == ${shortCommit(summary.commitDelta.headCommit)})`,
    );
  } else {
    outputHuman(
      `  commit delta: changed (${shortCommit(summary.commitDelta.baseCommit)} -> ${shortCommit(summary.commitDelta.headCommit)})`,
    );
  }

  if (summary.failureReason) {
    outputHuman(`  ${red(`failure: ${summary.failureReason}`)}`);
  }

  if (summary.verification) {
    outputHuman(
      `  ${dim(`structured verification: status=${summary.verification.status ?? '—'} actionable=${summary.verification.actionableGapCount ?? 0} human=${summary.verification.humanVerificationCount ?? 0} routing=${summary.verification.routingDecision ?? '—'}`)}`,
    );
    if (summary.verification.routingReason) {
      outputHuman(`  ${dim(`routing reason: ${summary.verification.routingReason}`)}`);
    }
  }

  if (summary.failureContext.failed) {
    if (summary.failureContext.failedStep) {
      const failureStep = summary.failureContext.failedStep;
      outputHuman(
        `  ${dim(`failure step: ${failureStep.index}/${failureStep.total} ${failureStep.command}`)}`,
      );
      if (failureStep.verdictSource || failureStep.verdictReason) {
        const reason = [failureStep.verdictSource, failureStep.verdictReason]
          .filter((part): part is string => Boolean(part))
          .join(': ');
        outputHuman(`  ${dim(`failure detail: ${reason}`)}`);
      }
    } else {
      outputHuman(`  ${dim('failure step: unavailable (no step metadata)')}`);
    }
    outputHuman(
      `  ${dim(`completed before failure: ${summary.failureContext.completedBeforeFailure.completed}/${summary.failureContext.completedBeforeFailure.total}`)}`,
    );
    outputHuman(
      `  ${dim(`retry guidance: ${summary.failureContext.retry.badge} (${summary.failureContext.retry.code}) — ${summary.failureContext.retry.next}`)}`,
    );
  }

  for (const note of summary.observability.observed.notes) {
    outputHuman(`  ${dim(`observed note: ${note}`)}`);
  }
  for (const note of summary.observability.tokens.notes) {
    outputHuman(`  ${dim(`token note: ${note}`)}`);
  }
  for (const note of summary.observability.cost.notes) {
    outputHuman(`  ${dim(`cost note: ${note}`)}`);
  }

  outputHuman(`  ${dim(`what: ${summary.what}`)}`);
  outputHuman(`  ${dim(`why: ${summary.why}`)}`);
  outputHuman(`  ${dim(`next: ${summary.next}`)}`);
  outputHuman('');
}

// ── Agent identity extraction ─────────────────────────────────────────────

/**
 * Extract a meaningful agent identity from a session title.
 *
 * Session titles follow patterns like:
 * - `pilot-redelegate-{jobId}-{attempt}-{ts}` → 'pilot-redelegate'
 * - `pilot-delegate-{jobId}-{attempt}-{ts}` → 'pilot-delegate'
 * - `{project}-gsd-{name}-{suffix}` → 'gsd-{name}'
 * - `{project}-{command}-{jobId}-{ts}` → '{command}' (for known GSD commands)
 * - Non-empty unrecognized → full title (preserves whatever identity exists)
 * - Empty → 'subagent' (only truly empty gets generic fallback)
 */
function extractAgentIdentity(title: string): string {
  if (!title) return 'subagent';

  // 1. Pilot redelegation: pilot-redelegate-{jobId}-{attempt}-{ts}
  if (title.startsWith('pilot-redelegate-')) return 'pilot-redelegate';

  // 2. Pilot delegation: pilot-delegate-{jobId}-{attempt}-{ts}
  if (title.startsWith('pilot-delegate-')) return 'pilot-delegate';

  // 3. GSD agent name anywhere: gsd-{name}
  const gsdMatch = title.match(/gsd-(\w+(?:-\w+)*)/);
  if (gsdMatch) return gsdMatch[0];

  // 4. Runner command-step pattern: {project}-{command}-{jobId}-{ts}
  //    Try to extract a known command from the title
  for (const cmd of KNOWN_GSD_COMMANDS) {
    const pattern = `-${cmd}-`;
    const idx = title.indexOf(pattern);
    if (idx >= 0) return cmd;
    // Also check if title ends with the command (no trailing segment)
    if (title.endsWith(`-${cmd}`)) return cmd;
  }

  // 5. Non-empty unknown — preserve as-is
  return title;
}

// ── Child session rendering ───────────────────────────────────────────────

/**
 * Render child sessions for a parent session inline.
 * Used for expanding task tool parts to show subagent activity.
 */
function renderChildSessions(
  parentSessionId: string,
  verbose: boolean,
  indent: string = '    ',
  depth: number = 0,
): void {
  if (depth >= 2) return;  // max 2 levels

  const children = getChildSessions(parentSessionId);
  if (children.length === 0) return;

  for (const child of children) {
    const agentType = extractAgentIdentity(child.title);

    outputHuman(`${indent}${dim(`── Subagent: ${agentType} ──`)}`);
    outputHuman('');

    const childParts = getSessionParts(child.id);
    if (childParts.length === 0) {
      outputHuman(`${indent}${dim('(no activity yet)')}`);
    } else {
      for (const part of childParts) {
        const lines = formatPart(part, verbose);
        for (const line of lines) {
          outputHuman(`${indent}${line}`);
        }
      }
      // Recurse into grandchildren
      renderChildSessions(child.id, verbose, indent + '  ', depth + 1);
    }
    outputHuman('');
  }
}

// ── Part collection ───────────────────────────────────────────────────────

/**
 * Collect parts from a set of categorized sessions.
 * Returns parts grouped by session for sectioned display.
 */
function collectSessionParts(
  sessions: CategorizedSession[],
  since?: number,
): Array<{ session: CategorizedSession; parts: SessionPart[] }> {
  const result: Array<{ session: CategorizedSession; parts: SessionPart[] }> = [];

  for (const session of sessions) {
    if (!session.sessionId) {
      result.push({ session, parts: [] });
      continue;
    }
    const parts = getSessionParts(session.sessionId, since);
    result.push({ session, parts });
  }

  return result;
}

// ── Main command ──────────────────────────────────────────────────────────

async function logCommand(
  idOrUndefined: string | undefined,
  opts: LogOptions,
): Promise<void> {
  let jobId = idOrUndefined;

  // Smart default: if no ID, show latest running job
  if (!jobId) {
    const queue = getQueue();
    const running = queue.find((j) => j.status === 'running');
    if (running) {
      jobId = running.id;
    } else {
      process.stderr.write(
        'No running jobs. Specify a job ID: pilot log <id>\n',
      );
      process.exit(1);
    }
  }

  const job = getJob(jobId);
  if (!job) {
    process.stderr.write(`Job not found: ${jobId}\n`);
    process.exit(1);
  }

  // Get step records for this job
  const steps = getJobSteps(jobId);
  const attemptGroups = buildAttemptSessionGroups(job, steps, opts.chain === true);

  const summary = buildSummaryData(job, steps);

  if (opts.summary) {
    if (isJsonMode()) {
      outputJson({
        job: {
          id: job.id,
          project: job.project,
          scope: job.scope,
          description: job.description,
          status: job.status,
          attempts: job.attempts,
          currentStep: job.currentStep,
        },
        summary,
      });
      return;
    }

    renderSummaryHuman(job, summary);
    return;
  }

  // Apply --delegation filter
  const filteredAttemptGroups = opts.delegation
    ? attemptGroups.map((group) => ({
      ...group,
      sessions: group.sessions.filter((session) => session.type === 'delegation'),
    }))
    : attemptGroups;
  const sessions = filteredAttemptGroups.flatMap((group) => group.sessions);

  // JSON mode
  if (isJsonMode()) {
    const sessionData = collectSessionParts(sessions);

    // Build per-step token usage map
    const tokenUsageByStep: Record<number, { input: number; output: number }> = {};
    for (const step of steps) {
      if (step.sessionTitle) {
        const sessionId = findSessionByTitle(step.sessionTitle);
        if (sessionId) {
          tokenUsageByStep[step.stepIndex] = getSessionTokens(sessionId);
        }
      }
    }

    outputJson({
      job: {
        id: job.id,
        project: job.project,
        scope: job.scope,
        description: job.description,
        status: job.status,
        modelProfile: job.modelProfile,
        providerMode: job.providerMode,
        attempts: job.attempts,
        actualModels: job.actualModels,
      },
      steps: steps.map((s) => ({
        ...s,
        tokenUsage: tokenUsageByStep[s.stepIndex] ?? null,
      })),
      sessions: sessionData.map(({ session, parts }) => ({
        title: session.title,
        type: session.type,
        command: session.command,
        parts,
      })),
      tokenUsage: tokenUsageByStep,
      ...(opts.chain
        ? {
          chain: {
            enabled: true,
            attempts: filteredAttemptGroups.map((group) => ({
              attempt: group.attemptNumber,
              source: group.source,
              retryStrategy: group.retryStrategy,
              retryHint: group.retryHint,
              sessions: collectSessionParts(group.sessions).map(({ session, parts }) => ({
                title: session.title,
                type: session.type,
                command: session.command,
                parts,
              })),
            })),
          },
        }
        : {}),
    });
    return;
  }

  // Human header
  const desc =
    job.description.length > 50
      ? job.description.slice(0, 50) + '…'
      : job.description;
  outputHuman('');
  outputHuman(
    `  ${bold(job.project)} · ${job.scope} · "${desc}" · ${dim(job.id)}`,
  );
  outputHuman(
    `  ${dim(`Model: ${job.modelProfile}/${job.providerMode}   Attempts: ${job.attempts}`)}`,
  );
  if (job.actualModels && job.actualModels.length > 0) {
    const actualStr = job.actualModels.join(', ');
    outputHuman(`  ${dim(`Actual model: ${actualStr}`)}`);
  }

  // Show review items for review-state jobs (amber, not red — not a failure)
  if (job.status === 'completed_pending_review' && job.resumeHint) {
    outputHuman('');
    outputHuman(`  ${yellow('Review items:')}`);
    for (const line of job.resumeHint.split('\n')) {
      if (line.trim()) {
        outputHuman(`    ${dim(line)}`);
      }
    }
  }
  if (job.status === 'review_hold' && job.resumeHint) {
    outputHuman('');
    outputHuman(`  ${yellow('Review hold reason:')}`);
    outputHuman(`    ${dim(job.resumeHint)}`);
  }

  outputHuman('');

  // Step summary (if steps exist)
  if (steps.length > 0) {
    const stepLines = formatStepsSummary(steps);
    for (const line of stepLines) {
      outputHuman(line);
    }
    outputHuman('');
  }

  const verbose = opts.verbose ?? false;

  // --task N: show only the Nth child session across all sessions
  if (opts.task !== undefined) {
    let taskIndex = 0;
    let found = false;

    for (const sess of sessions) {
      if (!sess.sessionId) continue;
      const children = getChildSessions(sess.sessionId);
      for (const child of children) {
        taskIndex++;
        if (taskIndex === opts.task) {
          const agentType = extractAgentIdentity(child.title);

          outputHuman('');
          outputHuman(`  ${bold(agentType)} · ${dim(child.title)}`);
          outputHuman('');

          const childParts = getSessionParts(child.id);
          if (childParts.length === 0) {
            outputHuman(`  ${dim('No activity yet')}`);
          } else {
            for (const part of childParts) {
              const lines = formatPart(part, verbose);
              for (const line of lines) {
                outputHuman(line);
              }
            }
          }
          outputHuman('');
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      process.stderr.write(`Task ${opts.task} not found. Use pilot log ${jobId} to see available tasks.\n`);
      process.exit(1);
    }
    return;
  }

  // "Waiting" state: job is running but no sessions yet
  const currentAttemptSessions = filteredAttemptGroups
    .filter((group) => group.source === 'current')
    .flatMap((group) => group.sessions);
  if (job.status === 'running' && (currentAttemptSessions.length === 0 || currentAttemptSessions.every((s) => s.sessionId === null))) {
    outputHuman(`  ${dim('Waiting for session to start...')}`);
    if (!opts.follow) {
      outputHuman('');
      return;
    }
  }

  // Collect and render parts by session
  const groupedSessionData = filteredAttemptGroups.map((group) => ({
    group,
    sessionData: collectSessionParts(group.sessions),
  }));
  let totalParts = 0;

  for (const { group, sessionData } of groupedSessionData) {
    if (opts.chain) {
      const meta: string[] = [];
      if (group.source === 'current') {
        meta.push('current');
      }
      if (group.retryStrategy) {
        meta.push(group.retryStrategy);
      }
      const suffix = meta.length > 0 ? ` (${meta.join(', ')})` : '';
      outputHuman(`  ${dim(`── Attempt ${group.attemptNumber}${suffix} ──`)}`);
      if (group.retryHint) {
        outputHuman(`  ${dim(`   hint: ${group.retryHint}`)}`);
      }
      outputHuman('');
    }

    if (sessionData.length === 0) {
      if (!opts.follow) {
        outputHuman(`  ${dim('(no activity yet)')}`);
        outputHuman('');
      }
      continue;
    }

    for (const { session, parts } of sessionData) {
      // Section header
      if (sessions.length > 1 || session.type === 'delegation' || session.type === 'verify') {
        let sectionLabel: string;
        if (session.type === 'delegation') {
          sectionLabel = `── Delegation ──`;
        } else if (session.type === 'verify') {
          sectionLabel = `── Verification ──`;
        } else {
          sectionLabel = `── Execution: ${session.command ?? 'unknown'} ──`;
        }
        outputHuman(`  ${dim(sectionLabel)}`);
        outputHuman('');
      }

      if (parts.length === 0) {
        if (!opts.follow) {
          outputHuman(`  ${dim('(no activity yet)')}`);
          outputHuman('');
        }
        continue;
      }

      // Apply --last filter (per-session)
      const displayParts = opts.last ? parts.slice(-opts.last) : parts;

      for (const part of displayParts) {
        const lines = formatPart(part, verbose);
        for (const line of lines) {
          outputHuman(line);
        }

        // Expand child sessions for task parts (unless --flat)
        if (!opts.flat && part.type === 'tool' && part.tool === 'task' && session.sessionId) {
          renderChildSessions(session.sessionId, verbose, '    ');
        }
      }
      totalParts += displayParts.length;
      outputHuman('');
    }
  }

  if (totalParts === 0 && !opts.follow) {
    outputHuman(`  ${dim('No activity yet')}`);
    outputHuman('');
    return;
  }

  // --follow mode: poll for new parts
  if (opts.follow) {
    outputHuman(dim('  Following… (Ctrl-C to stop)'));

    // Track lastSeen per session
    const lastSeenMap = new Map<string, number>();
    for (const groupData of groupedSessionData) {
      for (const { session, parts } of groupData.sessionData) {
        if (session.sessionId && parts.length > 0) {
          lastSeenMap.set(session.sessionId, parts[parts.length - 1].createdAt);
        }
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 500));

      // Re-read session titles (new sessions may appear)
      let currentTitles: string[] = [];
      const updatedJob = getJob(jobId);

      // Stop following when job reaches terminal state (including review states — session is done)
      if (updatedJob && ['completed', 'failed', 'cancelled', 'completed_pending_review', 'review_hold'].includes(updatedJob.status)) {
        outputHuman(dim(`  Job ${jobId} ${updatedJob.status}. Done.`));
        break;
      }
      if (updatedJob?.sessionTitles) {
        currentTitles = parseSessionTitles(updatedJob.sessionTitles);
      }

      const currentSessions = filterCurrentAttemptSessions(categorizeSessions(currentTitles), steps);
      const filteredSessions = opts.delegation
        ? currentSessions.filter((s) => s.type === 'delegation')
        : currentSessions;

      for (const session of filteredSessions) {
        if (!session.sessionId) continue;

        const since = lastSeenMap.get(session.sessionId);
        const newParts = getSessionParts(session.sessionId, since);

        for (const part of newParts) {
          const lines = formatPart(part, verbose);
          for (const line of lines) {
            outputHuman(line);
          }
          lastSeenMap.set(session.sessionId, part.createdAt);
        }
      }
    }
  }
}

export { logCommand, extractAgentIdentity };
