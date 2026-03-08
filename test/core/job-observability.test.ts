import { describe, expect, it } from 'vitest';
import { estimateCostByModel, PRICING_CATALOG } from '../../src/core/pricing.js';
import type { TokenUsageBreakdown } from '../../src/core/types.js';

function tokens(overrides: Partial<TokenUsageBreakdown> = {}): TokenUsageBreakdown {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    ...overrides,
  };
}

describe('pricing catalog + estimate semantics', () => {
  it('keeps pricing assumptions centralized in PRICING_CATALOG', () => {
    expect(PRICING_CATALOG['anthropic/claude-sonnet-4-6']).toBeDefined();
    expect(PRICING_CATALOG['openai/gpt-5.3-codex']).toBeDefined();
  });

  it('estimates cost per model and rolls up multi-model totals', () => {
    const estimate = estimateCostByModel({
      'anthropic/claude-sonnet-4-6': tokens({ input: 1_000_000, output: 500_000, total: 1_500_000 }),
      'openai/gpt-5.3-codex': tokens({ input: 500_000, output: 500_000, total: 1_000_000 }),
    });

    expect(estimate.status).toBe('estimated');
    expect(estimate.byModel).toHaveLength(2);
    expect(estimate.byModel[0].model).toBe('anthropic/claude-sonnet-4-6');
    expect(estimate.byModel[1].model).toBe('openai/gpt-5.3-codex');
    expect(estimate.estimatedUsd).toBeCloseTo(23, 6);
  });

  it('marks estimate as partial when pricing assumptions are incomplete for observed token categories', () => {
    const estimate = estimateCostByModel({
      'anthropic/claude-sonnet-4-6': tokens({ input: 100_000, output: 100_000, reasoning: 50_000, total: 250_000 }),
    });

    expect(estimate.status).toBe('partial');
    expect(estimate.byModel[0].status).toBe('partial');
    expect(estimate.byModel[0].notes.join(' ')).toContain('Reasoning tokens are present but excluded');
  });

  it('marks estimate as unavailable for unknown models without inventing blended prices', () => {
    const estimate = estimateCostByModel({
      'unknown/provider-model': tokens({ input: 123, output: 456, total: 579 }),
    });

    expect(estimate.status).toBe('unavailable');
    expect(estimate.estimatedUsd).toBeNull();
    expect(estimate.byModel[0].status).toBe('unavailable');
    expect(estimate.byModel[0].notes.join(' ')).toContain('No pricing assumption found');
  });
});
