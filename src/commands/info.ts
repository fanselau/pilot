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
import { findSessionByTitle, getSessionTokens } from '../core/opencode-db.js';
import { resolveAllAgentModels } from '../core/models.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, red, yellow, cyan } from '../util/colors.js';
import type { DelegationPlan } from '../core/types.js';

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

  // ── JSON output ────────────────────────────────────────────────────────

  const resolvedModels = resolveAllAgentModels(job.modelProfile, job.providerMode);

  if (isJsonMode()) {
    outputJson({
      job,
      delegationPlan,
      steps,
      sessions: sessionTokens,
      resolvedModels,
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

  // Core fields
  const pad = (label: string) => label.padEnd(12);
  outputHuman(`  ${dim(pad('Project:'))}  ${job.project}`);
  outputHuman(`  ${dim(pad('Scope:'))}    ${job.scope}`);
  outputHuman(`  ${dim(pad('Description:'))} ${job.description}`);
  outputHuman(`  ${dim(pad('Status:'))}   ${formatStatusColor(job.status)}`);
  if (job.error) {
    outputHuman(`  ${dim(pad('Error:'))}    ${red(job.error)}`);
  }
  outputHuman('');

  // Config / timing
  outputHuman(`  ${dim(pad('Model:'))}    ${job.modelProfile}/${job.providerMode}`);
  outputHuman(`  ${dim(pad('Attempts:'))} ${job.attempts}/${job.maxAttempts}`);
  outputHuman(`  ${dim(pad('Created:'))}  ${job.createdAt}`);
  outputHuman(`  ${dim(pad('Started:'))}  ${job.startedAt ?? '—'}`);
  outputHuman(`  ${dim(pad('Completed:'))} ${job.completedAt ?? '—'}`);
  if (job.dependsOn) {
    outputHuman(`  ${dim(pad('Depends On:'))} ${job.dependsOn}`);
  }
  outputHuman('');

  // Resolved models (when not default profile)
  if (job.modelProfile !== 'balanced') {
    outputHuman(`  ${bold('Resolved Models')}`);
    outputHuman(`  ${hr()}`);
    for (const [agentName, modelId] of Object.entries(resolvedModels)) {
      const shortAgent = agentName.replace('gsd-', '');
      outputHuman(`    ${dim(shortAgent.padEnd(24))} ${modelId}`);
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
