import type {
  Job,
  JobObservabilitySnapshot,
  TokenUsageBreakdown,
} from './types.js';
import { findSessionByTitle, getSessionModelsRecursive, getSessionTokenUsageByModelRecursive } from './opencode-db.js';
import { resolveTopLevelModel } from './models.js';
import { estimateCostByModel } from './pricing.js';

type TokenBuckets = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

interface BuildJobObservabilityDeps {
  findSessionByTitle: (title: string) => string | null;
  getSessionModelsRecursive: (sessionId: string, depth?: number, visited?: Set<string>) => string[];
  getSessionTokenUsageByModelRecursive: (sessionId: string, depth?: number, visited?: Set<string>) => Record<string, TokenBuckets>;
  resolveTopLevelModel: typeof resolveTopLevelModel;
  estimateCostByModel: typeof estimateCostByModel;
}

const DEFAULT_DEPS: BuildJobObservabilityDeps = {
  findSessionByTitle,
  getSessionModelsRecursive,
  getSessionTokenUsageByModelRecursive,
  resolveTopLevelModel,
  estimateCostByModel,
};

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function toNonNegativeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

function normalizeModel(model: string): string {
  return model.trim();
}

function toTokenBreakdown(buckets: TokenBuckets): TokenUsageBreakdown {
  const input = toNonNegativeNumber(buckets.input);
  const output = toNonNegativeNumber(buckets.output);
  const reasoning = toNonNegativeNumber(buckets.reasoning);
  const cacheRead = toNonNegativeNumber(buckets.cacheRead);
  const cacheWrite = toNonNegativeNumber(buckets.cacheWrite);
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: input + output + reasoning + cacheRead + cacheWrite,
  };
}

function emptyTokens(): TokenUsageBreakdown {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  };
}

function parseSessionTitles(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function buildJobObservability(
  job: Job,
  overrides: Partial<BuildJobObservabilityDeps> = {},
): JobObservabilitySnapshot {
  const deps = { ...DEFAULT_DEPS, ...overrides };

  const requestedNotes: string[] = [];
  let intendedExecutorModel: string | null = null;
  try {
    intendedExecutorModel = deps.resolveTopLevelModel(job.scope, job.modelProfile, job.providerMode).model;
  } catch {
    requestedNotes.push('Requested executor model could not be resolved from profile/provider mode.');
  }

  const sessionTitles = parseSessionTitles(job.sessionTitles);
  const missingSessionTitles: string[] = [];
  const observedNotes: string[] = [];
  const tokenNotes: string[] = [];

  const observedModels = new Set<string>();
  const tokenUsageByModel: Record<string, TokenUsageBreakdown> = {};

  const visitedModelSessions = new Set<string>();
  const visitedTokenSessions = new Set<string>();
  const rootSessionIds = new Set<string>();

  for (const title of sessionTitles) {
    const sessionId = deps.findSessionByTitle(title);
    if (!sessionId) {
      missingSessionTitles.push(title);
      continue;
    }

    if (rootSessionIds.has(sessionId)) {
      continue;
    }
    rootSessionIds.add(sessionId);

    for (const modelRaw of deps.getSessionModelsRecursive(sessionId, 0, visitedModelSessions)) {
      const model = normalizeModel(modelRaw);
      if (model) {
        observedModels.add(model);
      }
    }

    const usage = deps.getSessionTokenUsageByModelRecursive(sessionId, 0, visitedTokenSessions);
    for (const [modelRaw, bucket] of Object.entries(usage)) {
      const model = normalizeModel(modelRaw);
      if (!model) {
        continue;
      }

      const current = tokenUsageByModel[model] ?? emptyTokens();
      const next = toTokenBreakdown(bucket);
      tokenUsageByModel[model] = {
        input: current.input + next.input,
        output: current.output + next.output,
        reasoning: current.reasoning + next.reasoning,
        cacheRead: current.cacheRead + next.cacheRead,
        cacheWrite: current.cacheWrite + next.cacheWrite,
        total: current.total + next.total,
      };
    }
  }

  if (observedModels.size === 0 && Array.isArray(job.actualModels)) {
    for (const modelRaw of job.actualModels) {
      const model = normalizeModel(modelRaw);
      if (model) {
        observedModels.add(model);
      }
    }
    if (observedModels.size > 0) {
      observedNotes.push('Observed models were restored from persisted job metadata.');
    }
  }

  if (sessionTitles.length === 0) {
    observedNotes.push('No session titles are recorded for this job yet.');
    tokenNotes.push('No session titles are recorded for this job yet.');
  }

  if (missingSessionTitles.length > 0) {
    const summary = missingSessionTitles.length <= 3
      ? missingSessionTitles.join(', ')
      : `${missingSessionTitles.slice(0, 3).join(', ')}, +${missingSessionTitles.length - 3} more`;
    observedNotes.push(`Some session titles could not be resolved in opencode DB (${summary}).`);
    tokenNotes.push(`Some session trees were unavailable (${summary}).`);
  }

  const tokenModels = Object.keys(tokenUsageByModel).sort();
  const tokenTotals = tokenModels.reduce((acc, model) => {
    const current = tokenUsageByModel[model];
    return {
      input: acc.input + current.input,
      output: acc.output + current.output,
      reasoning: acc.reasoning + current.reasoning,
      cacheRead: acc.cacheRead + current.cacheRead,
      cacheWrite: acc.cacheWrite + current.cacheWrite,
      total: acc.total + current.total,
    };
  }, emptyTokens());

  let observedStatus: JobObservabilitySnapshot['observed']['status'] = 'available';
  if (observedModels.size === 0) {
    observedStatus = 'unavailable';
  } else if (missingSessionTitles.length > 0 || observedNotes.length > 0) {
    observedStatus = 'partial';
  }

  let tokenStatus: JobObservabilitySnapshot['tokens']['status'] = 'available';
  if (tokenModels.length === 0) {
    tokenStatus = 'unavailable';
  } else if (missingSessionTitles.length > 0) {
    tokenStatus = 'partial';
  }

  if (!TERMINAL_STATUSES.has(job.status)) {
    if (observedStatus === 'available') {
      observedStatus = 'partial';
    }
    if (tokenStatus === 'available') {
      tokenStatus = 'partial';
    }
    observedNotes.push('Job is still running; observed model set may still change.');
    tokenNotes.push('Job is still running; token totals are live and may increase.');
  }

  const sortedObservedModels = Array.from(observedModels).sort();
  const sortedTokenUsageByModel: Record<string, TokenUsageBreakdown> = {};
  for (const model of tokenModels) {
    sortedTokenUsageByModel[model] = tokenUsageByModel[model];
  }

  const cost = deps.estimateCostByModel(sortedTokenUsageByModel);

  return {
    jobId: job.id,
    jobStatus: job.status,
    terminal: TERMINAL_STATUSES.has(job.status),
    requested: {
      modelProfile: job.modelProfile,
      providerMode: job.providerMode,
      scope: job.scope,
      intendedExecutorModel,
      notes: requestedNotes,
    },
    observed: {
      status: observedStatus,
      models: sortedObservedModels,
      notes: observedNotes,
    },
    tokens: {
      status: tokenStatus,
      totals: tokenModels.length > 0 ? tokenTotals : null,
      byModel: sortedTokenUsageByModel,
      notes: tokenNotes,
    },
    cost,
  };
}

export {
  buildJobObservability,
};
