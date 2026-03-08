import { describe, expect, it } from 'vitest';
import { buildJobObservability } from '../../src/core/job-observability.js';
import { estimateCostByModel, PRICING_CATALOG } from '../../src/core/pricing.js';
import type { Job, TokenUsageBreakdown } from '../../src/core/types.js';

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

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j123',
    project: '/repo',
    scope: 'phase',
    description: 'observability snapshot',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08T00:00:00Z',
    startedAt: '2026-03-08T00:01:00Z',
    completedAt: '2026-03-08T00:02:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
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

describe('buildJobObservability', () => {
  it('builds an available snapshot for single-model terminal jobs', () => {
    const snapshot = buildJobObservability(
      makeJob({ sessionTitles: JSON.stringify(['pilot-phase-j123']) }),
      {
        findSessionByTitle: () => 'sess-1',
        getSessionModelsRecursive: () => ['anthropic/claude-sonnet-4-6'],
        getSessionTokenUsageByModelRecursive: () => ({
          'anthropic/claude-sonnet-4-6': {
            input: 120_000,
            output: 80_000,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        }),
        resolveTopLevelModel: () => ({ model: 'anthropic/claude-opus-4-6' }),
      },
    );

    expect(snapshot.terminal).toBe(true);
    expect(snapshot.requested.intendedExecutorModel).toBe('anthropic/claude-opus-4-6');
    expect(snapshot.observed.status).toBe('available');
    expect(snapshot.observed.models).toEqual(['anthropic/claude-sonnet-4-6']);
    expect(snapshot.tokens.status).toBe('available');
    expect(snapshot.tokens.totals?.total).toBe(200_000);
    expect(snapshot.cost.status).toBe('estimated');
    expect(snapshot.cost.estimatedUsd).toBeGreaterThan(0);
  });

  it('keeps multi-model usage explicit and marks cost partial when pricing is missing', () => {
    const snapshot = buildJobObservability(
      makeJob({
        sessionTitles: JSON.stringify(['pilot-phase-j123']),
      }),
      {
        findSessionByTitle: () => 'sess-2',
        getSessionModelsRecursive: () => ['anthropic/claude-sonnet-4-6', 'unknown/provider-model'],
        getSessionTokenUsageByModelRecursive: () => ({
          'anthropic/claude-sonnet-4-6': {
            input: 100_000,
            output: 50_000,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          'unknown/provider-model': {
            input: 25_000,
            output: 10_000,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        }),
      },
    );

    expect(snapshot.observed.models).toEqual([
      'anthropic/claude-sonnet-4-6',
      'unknown/provider-model',
    ]);
    expect(snapshot.tokens.byModel['anthropic/claude-sonnet-4-6'].total).toBe(150_000);
    expect(snapshot.tokens.byModel['unknown/provider-model'].total).toBe(35_000);
    expect(snapshot.cost.status).toBe('partial');
    expect(snapshot.cost.byModel.find((entry) => entry.model === 'unknown/provider-model')?.status).toBe('unavailable');
  });

  it('reports running jobs as partial live data and honest unavailable fields', () => {
    const snapshot = buildJobObservability(
      makeJob({
        status: 'running',
        completedAt: null,
        sessionTitles: JSON.stringify(['phase-a', 'phase-b']),
      }),
      {
        findSessionByTitle: (title) => (title === 'phase-a' ? 'sess-a' : null),
        getSessionModelsRecursive: () => ['openai/gpt-5.3-codex'],
        getSessionTokenUsageByModelRecursive: () => ({
          'openai/gpt-5.3-codex': {
            input: 10_000,
            output: 3_000,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        }),
      },
    );

    expect(snapshot.terminal).toBe(false);
    expect(snapshot.observed.status).toBe('partial');
    expect(snapshot.tokens.status).toBe('partial');
    expect(snapshot.observed.notes.join(' ')).toContain('still running');
    expect(snapshot.tokens.notes.join(' ')).toContain('still running');
    expect(snapshot.tokens.notes.join(' ')).toContain('Some session trees were unavailable');
  });

  it('falls back to persisted actual models when live session data is unavailable', () => {
    const snapshot = buildJobObservability(
      makeJob({
        sessionTitles: JSON.stringify(['missing-title']),
        actualModels: ['anthropic/claude-opus-4-6'],
      }),
      {
        findSessionByTitle: () => null,
        getSessionModelsRecursive: () => [],
        getSessionTokenUsageByModelRecursive: () => ({}),
      },
    );

    expect(snapshot.observed.status).toBe('partial');
    expect(snapshot.observed.models).toEqual(['anthropic/claude-opus-4-6']);
    expect(snapshot.tokens.status).toBe('unavailable');
    expect(snapshot.cost.status).toBe('unavailable');
    expect(snapshot.observed.notes.join(' ')).toContain('restored from persisted');
  });
});
