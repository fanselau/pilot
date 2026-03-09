import type {
  JobCostEstimate,
  JobCostEstimateByModel,
  TokenUsageBreakdown,
} from './types.js';

interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  reasoningPerMillionUsd?: number;
  cacheReadPerMillionUsd?: number;
  cacheWritePerMillionUsd?: number;
  assumptions: string[];
}

const PRICING_CATALOG: Record<string, ModelPricing> = {
  'anthropic/claude-haiku-4-5': {
    inputPerMillionUsd: 0.8,
    outputPerMillionUsd: 4.0,
    assumptions: ['Approximate public Haiku input/output pricing assumptions.'],
  },
  'anthropic/claude-sonnet-4-6': {
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
    assumptions: ['Approximate public Sonnet input/output pricing assumptions.'],
  },
  'anthropic/claude-opus-4-6': {
    inputPerMillionUsd: 15.0,
    outputPerMillionUsd: 75.0,
    assumptions: ['Approximate public Opus input/output pricing assumptions.'],
  },
  'openai/gpt-5.4': {
    inputPerMillionUsd: 5.0,
    outputPerMillionUsd: 20.0,
    assumptions: [
      'Assumed GPT-5.4 blended pricing for high/medium variants.',
      'Variant-specific prices are not distinguished yet.',
    ],
  },
};

function estimateForModel(model: string, tokens: TokenUsageBreakdown): JobCostEstimateByModel {
  const pricing = PRICING_CATALOG[model];
  if (!pricing) {
    return {
      model,
      status: 'unavailable',
      estimatedUsd: null,
      tokens,
      notes: [`No pricing assumption found for ${model}.`],
    };
  }

  const notes = [...pricing.assumptions];
  let status: JobCostEstimateByModel['status'] = 'estimated';

  let estimatedUsd =
    (tokens.input / 1_000_000) * pricing.inputPerMillionUsd
    + (tokens.output / 1_000_000) * pricing.outputPerMillionUsd;

  if (tokens.reasoning > 0) {
    if (pricing.reasoningPerMillionUsd === undefined) {
      status = 'partial';
      notes.push('Reasoning tokens are present but excluded from estimate.');
    } else {
      estimatedUsd += (tokens.reasoning / 1_000_000) * pricing.reasoningPerMillionUsd;
    }
  }

  if (tokens.cacheRead > 0) {
    if (pricing.cacheReadPerMillionUsd === undefined) {
      status = 'partial';
      notes.push('Cache-read tokens are present but excluded from estimate.');
    } else {
      estimatedUsd += (tokens.cacheRead / 1_000_000) * pricing.cacheReadPerMillionUsd;
    }
  }

  if (tokens.cacheWrite > 0) {
    if (pricing.cacheWritePerMillionUsd === undefined) {
      status = 'partial';
      notes.push('Cache-write tokens are present but excluded from estimate.');
    } else {
      estimatedUsd += (tokens.cacheWrite / 1_000_000) * pricing.cacheWritePerMillionUsd;
    }
  }

  return {
    model,
    status,
    estimatedUsd,
    tokens,
    notes,
  };
}

function estimateCostByModel(tokenUsageByModel: Record<string, TokenUsageBreakdown>): JobCostEstimate {
  const models = Object.keys(tokenUsageByModel).sort();
  if (models.length === 0) {
    return {
      status: 'unavailable',
      currency: 'USD',
      estimatedUsd: null,
      byModel: [],
      notes: ['No per-model token usage available.'],
    };
  }

  const byModel = models.map((model) => estimateForModel(model, tokenUsageByModel[model]));
  const notes = byModel.flatMap((entry) => entry.notes);
  const knownCosts = byModel
    .map((entry) => entry.estimatedUsd)
    .filter((value): value is number => value !== null);

  const estimatedUsd = knownCosts.length > 0
    ? knownCosts.reduce((sum, value) => sum + value, 0)
    : null;

  let status: JobCostEstimate['status'] = 'estimated';
  if (knownCosts.length === 0) {
    status = 'unavailable';
  } else if (byModel.some((entry) => entry.status !== 'estimated')) {
    status = 'partial';
  }

  return {
    status,
    currency: 'USD',
    estimatedUsd,
    byModel,
    notes,
  };
}

export {
  PRICING_CATALOG,
  estimateCostByModel,
};
