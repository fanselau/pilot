import type { Job, JobObservabilitySnapshot, JobStep } from './types.js';
import type { JobWhy } from './job-introspection.js';

interface BuildJobExportMarkdownInput {
  job: Job;
  steps: JobStep[];
  observability: JobObservabilitySnapshot;
  statusWhy: JobWhy;
  retryWhy: JobWhy;
  undoWhy: JobWhy;
  generatedAt?: Date;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatUsd(value: number | null): string {
  if (value === null) return 'unavailable';
  return `$${value.toFixed(4)} USD`;
}

function shortCommit(commit: string | null): string {
  if (!commit) return 'unavailable';
  return `${commit.slice(0, 12)} (${commit})`;
}

function limitText(text: string | null, max: number): string {
  if (!text) return 'unavailable';
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (!singleLine) return 'unavailable';
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max - 3)}...`;
}

function sortSteps(steps: JobStep[]): JobStep[] {
  return [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
}

function deriveStepContext(steps: JobStep[]): {
  currentOrFinal: JobStep | null;
  failedStep: JobStep | null;
} {
  const ordered = sortSteps(steps);
  if (ordered.length === 0) {
    return { currentOrFinal: null, failedStep: null };
  }

  const running = ordered.find((step) => step.status === 'running') ?? null;
  const currentOrFinal = running ?? ordered[ordered.length - 1] ?? null;
  const failedStep = [...ordered].reverse().find((step) => step.status === 'failed') ?? null;
  return { currentOrFinal, failedStep };
}

function deriveCommitDelta(job: Job): 'changed' | 'no-op' | 'unknown' {
  if (!job.gitBaseCommit || !job.gitHeadCommit) return 'unknown';
  return job.gitBaseCommit === job.gitHeadCommit ? 'no-op' : 'changed';
}

function extractPhaseReferences(steps: JobStep[]): string[] {
  return sortSteps(steps)
    .filter((step) => step.command.includes('phase'))
    .map((step) => {
      const args = step.args.trim();
      const suffix = args ? ` ${args}` : '';
      return `step ${step.stepIndex + 1}: ${step.command}${suffix}`;
    });
}

function buildJobExportMarkdown(input: BuildJobExportMarkdownInput): string {
  const { job, steps, observability, statusWhy, retryWhy, undoWhy } = input;
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();

  const lines: string[] = [];
  const observedModels = observability.observed.models;
  const intendedModel = observability.requested.intendedExecutorModel;
  const mismatch = intendedModel
    ? observedModels.length > 0 && !observedModels.includes(intendedModel)
    : false;

  const { currentOrFinal, failedStep } = deriveStepContext(steps);
  const commitDelta = deriveCommitDelta(job);
  const phaseRefs = extractPhaseReferences(steps);

  lines.push(`# Pilot Job Export: ${job.id}`);
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('Format: markdown (curated summary, no raw transcript dump)');
  lines.push('');

  lines.push('## Job Identity');
  lines.push('');
  lines.push(`- Job ID: \`${job.id}\``);
  lines.push(`- Project: \`${job.project}\``);
  lines.push(`- Scope: \`${job.scope}\``);
  lines.push(`- Description: ${limitText(job.description, 240)}`);
  lines.push(`- Status: \`${job.status}\``);
  lines.push(`- Attempts: ${job.attempts}`);
  lines.push(`- Created: ${job.createdAt}`);
  lines.push(`- Started: ${job.startedAt ?? 'unavailable'}`);
  lines.push(`- Completed: ${job.completedAt ?? 'unavailable'}`);
  lines.push('');

  lines.push('## Requested and Observed Models');
  lines.push('');
  lines.push(`- Requested run configuration (\`requested\`): profile=\`${observability.requested.modelProfile}\`, provider-mode=\`${observability.requested.providerMode}\`, scope=\`${observability.requested.scope}\``);
  lines.push(`- Requested executor model (\`requested\`): ${intendedModel ?? 'unavailable'}`);
  lines.push(`- Actual models (\`observed\` = ${observability.observed.status}): ${observedModels.length > 0 ? observedModels.map((model) => `\`${model}\``).join(', ') : 'unavailable'}`);
  lines.push(`- Model mismatch signal: ${mismatch ? 'requested executor was not observed in session data' : 'none detected or unavailable'}`);
  if (observability.requested.notes.length > 0 || observability.observed.notes.length > 0) {
    lines.push('- Notes:');
    for (const note of [...observability.requested.notes, ...observability.observed.notes]) {
      lines.push(`  - ${note}`);
    }
  }
  lines.push('');

  lines.push('## Token and Cost Observability');
  lines.push('');
  lines.push(`- Token status (\`observed\`): ${observability.tokens.status}`);
  if (observability.tokens.totals) {
    const totals = observability.tokens.totals;
    lines.push(`- Token totals (\`observed\`): input=${formatTokens(totals.input)}, output=${formatTokens(totals.output)}, reasoning=${formatTokens(totals.reasoning)}, cache-read=${formatTokens(totals.cacheRead)}, cache-write=${formatTokens(totals.cacheWrite)}, total=${formatTokens(totals.total)}`);
  } else {
    lines.push('- Token totals (\`observed\`): unavailable');
  }

  const tokenModels = Object.keys(observability.tokens.byModel);
  if (tokenModels.length > 0) {
    lines.push('- Per-model token rollup (curated):');
    lines.push('');
    lines.push('| Model | Input | Output | Reasoning | Cache Read | Cache Write | Total |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const model of tokenModels) {
      const bucket = observability.tokens.byModel[model];
      lines.push(`| \`${model}\` | ${formatTokens(bucket.input)} | ${formatTokens(bucket.output)} | ${formatTokens(bucket.reasoning)} | ${formatTokens(bucket.cacheRead)} | ${formatTokens(bucket.cacheWrite)} | ${formatTokens(bucket.total)} |`);
    }
  }

  lines.push('');
  lines.push(`- Cost estimate status (\`estimated\`): ${observability.cost.status}`);
  lines.push(`- Estimated cost (\`estimated\`): ${formatUsd(observability.cost.estimatedUsd)}`);
  if (observability.cost.byModel.length > 0) {
    lines.push('- Per-model cost estimate summary:');
    for (const item of observability.cost.byModel) {
      lines.push(`  - ${item.model}: status=${item.status}, estimated=${formatUsd(item.estimatedUsd)}`);
    }
  }
  if (observability.tokens.notes.length > 0 || observability.cost.notes.length > 0) {
    lines.push('- Notes:');
    for (const note of [...observability.tokens.notes, ...observability.cost.notes]) {
      lines.push(`  - ${note}`);
    }
  }
  lines.push('');

  lines.push('## Outcome and Failure Context');
  lines.push('');
  lines.push(`- Outcome summary: ${statusWhy.what}`);
  lines.push(`- Outcome rationale: ${statusWhy.why}`);
  lines.push(`- Next action: ${statusWhy.next}`);
  lines.push(`- Outcome badge/code: ${statusWhy.badge} / ${statusWhy.code}`);

  if (currentOrFinal) {
    const args = currentOrFinal.args.trim();
    lines.push(`- Current/final step: ${currentOrFinal.stepIndex + 1}/${steps.length} ${currentOrFinal.command}${args ? ` ${args}` : ''} [${currentOrFinal.status}]`);
    if (currentOrFinal.verdictSource || currentOrFinal.verdictReason) {
      lines.push(`- Current/final step verdict: ${limitText([currentOrFinal.verdictSource, currentOrFinal.verdictReason].filter(Boolean).join(': '), 240)}`);
    }
  } else {
    lines.push('- Current/final step: unavailable (no step metadata recorded)');
  }

  if (failedStep || job.error) {
    const failedLabel = failedStep
      ? `${failedStep.command}${failedStep.args.trim() ? ` ${failedStep.args.trim()}` : ''}`
      : 'unavailable';
    lines.push(`- Failure context: ${failedLabel}`);
    lines.push(`- Failure reason: ${limitText(failedStep?.verdictReason ?? job.error, 320)}`);
  }
  lines.push(`- Retry context: ${retryWhy.what} | ${retryWhy.why} | ${retryWhy.next}`);
  lines.push('');

  lines.push('## Commit and Change Signals');
  lines.push('');
  lines.push(`- Commit delta: ${commitDelta}`);
  lines.push(`- Base checkpoint: ${shortCommit(job.gitBaseCommit)}`);
  lines.push(`- Head checkpoint: ${shortCommit(job.gitHeadCommit)}`);
  lines.push(`- Undo safety context: ${undoWhy.what} | ${undoWhy.why} | ${undoWhy.next}`);
  lines.push('');

  lines.push('## Requirement and Phase References');
  lines.push('');
  lines.push(`- Requirement path: ${job.requirementPath ?? 'unavailable'}`);
  if (phaseRefs.length > 0) {
    lines.push('- Phase-related steps:');
    for (const ref of phaseRefs) {
      lines.push(`  - ${ref}`);
    }
  } else {
    lines.push('- Phase-related steps: unavailable');
  }
  lines.push('');

  return lines.join('\n').trimEnd();
}

export {
  buildJobExportMarkdown,
};

export type {
  BuildJobExportMarkdownInput,
};
