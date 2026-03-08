import { describe, it, expect } from 'vitest';
import {
  parseStepInfo,
  buildHeaderLines,
  buildTokenHeaderLine,
  buildActualHeaderLine,
  buildEstimatedCostHeaderLine,
} from '../../src/tui/views/detail.js';
import type {
  DelegationPlan,
  Job,
  JobObservabilitySnapshot,
  TokenUsageBreakdown,
} from '../../src/core/types.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'my-project',
    scope: 'phase',
    description: 'Implement authentication system',
    requirementPath: null,
    status: 'running',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-03T10:00:00Z',
    startedAt: '2026-03-03T10:05:00Z',
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '2222222222222222222222222222222222222222',
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

function makeDelegationPlan(steps: Array<{ command: string; args: string }>): string {
  const plan: DelegationPlan = {
    steps,
    reasoning: 'test delegation plan',
  };
  return JSON.stringify(plan);
}

function totals(overrides: Partial<TokenUsageBreakdown> = {}): TokenUsageBreakdown {
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

function makeSnapshot(overrides: Partial<JobObservabilitySnapshot> = {}): JobObservabilitySnapshot {
  return {
    jobId: 'ab12',
    jobStatus: 'running',
    terminal: false,
    requested: {
      modelProfile: 'balanced',
      providerMode: 'hybrid',
      scope: 'phase',
      intendedExecutorModel: 'anthropic/claude-sonnet-4-6',
      notes: [],
    },
    observed: {
      status: 'partial',
      models: ['anthropic/claude-sonnet-4-6'],
      notes: [],
    },
    tokens: {
      status: 'partial',
      totals: totals({ input: 12_000, output: 8_000, reasoning: 1_000, total: 21_000 }),
      byModel: {
        'anthropic/claude-sonnet-4-6': totals({ input: 12_000, output: 8_000, reasoning: 1_000, total: 21_000 }),
      },
      notes: [],
    },
    cost: {
      status: 'partial',
      currency: 'USD',
      estimatedUsd: 0.14,
      byModel: [],
      notes: ['Reasoning tokens are present but excluded from estimate.'],
    },
    ...overrides,
  };
}

describe('parseStepInfo', () => {
  it('returns em-dash placeholders when delegationPlan is missing', () => {
    const result = parseStepInfo(makeJob({ delegationPlan: null }));
    expect(result.label).toBe('—');
    expect(result.index).toBe('—');
  });

  it('parses current step metadata from delegation plan', () => {
    const plan = makeDelegationPlan([
      { command: 'plan-phase', args: '45 --auto' },
      { command: 'execute-phase', args: '45 --auto' },
      { command: 'verify-phase', args: '45' },
    ]);
    const result = parseStepInfo(makeJob({ delegationPlan: plan, currentStep: 1 }));
    expect(result.label).toContain('execute-phase');
    expect(result.index).toBe('2/3');
  });
});

describe('detail observability header helpers', () => {
  it('buildTokenHeaderLine marks running jobs as live when partial', () => {
    const line = buildTokenHeaderLine(makeSnapshot());
    expect(line).toBe('Tokens: live 21.0k tok (12.0k in / 8.0k out / 1.0k reasoning)');
  });

  it('buildTokenHeaderLine falls back to unavailable semantics', () => {
    expect(buildTokenHeaderLine(null)).toBe('Tokens: unavailable');
    expect(buildTokenHeaderLine(null, 1500)).toBe('Tokens: 1.5k tok (legacy)');
  });

  it('buildActualHeaderLine marks mismatches explicitly', () => {
    const actual = buildActualHeaderLine(
      makeSnapshot({
        observed: {
          status: 'available',
          models: ['openai/gpt-5.3-codex'],
          notes: [],
        },
        terminal: true,
        jobStatus: 'completed',
      }),
      'anthropic/claude-sonnet-4-6',
    );

    expect(actual.mismatch).toBe(true);
    expect(actual.line).toContain('MISMATCH');
  });

  it('buildEstimatedCostHeaderLine includes partial caveats', () => {
    const line = buildEstimatedCostHeaderLine(makeSnapshot());
    expect(line).toContain('Estimated cost: ~$0.140 est');
    expect(line).toContain('partial;');
  });

  it('buildEstimatedCostHeaderLine shows unavailable for missing data', () => {
    const line = buildEstimatedCostHeaderLine(
      makeSnapshot({
        cost: {
          status: 'unavailable',
          currency: 'USD',
          estimatedUsd: null,
          byModel: [],
          notes: ['No pricing assumption found'],
        },
      }),
    );
    expect(line).toBe('Estimated cost: live unavailable');
  });
});

describe('buildHeaderLines observability contract', () => {
  it('renders requested/actual/estimated parity lines', () => {
    const job = makeJob({
      delegationPlan: makeDelegationPlan([
        { command: 'plan-phase', args: '45 --auto' },
        { command: 'execute-phase', args: '45 --auto' },
      ]),
      currentStep: 1,
    });

    const lines = buildHeaderLines(job, 120, {}, makeSnapshot());
    expect(lines[0]).toContain('#ab12');
    expect(lines[3]).toContain('Step 2/2');
    expect(lines[4]).toContain('Tokens: live');
    expect(lines[5]).toContain('Requested: balanced/hybrid');
    expect(lines[6]).toContain('Actual: live');
    expect(lines[7]).toContain('Estimated cost:');
    expect(lines[8]).toContain('Recovery: unavailable (active job)');
  });

  it('renders unavailable semantics when no observability snapshot is present', () => {
    const lines = buildHeaderLines(makeJob(), 100, {}, null);
    expect(lines[4]).toBe('Tokens: live unavailable');
    expect(lines[6]).toBe('Actual: live unavailable');
    expect(lines[7]).toBe('Estimated cost: live unavailable');
  });

  it('keeps reason lines in the header output', () => {
    const pending = makeJob({ status: 'pending', createdAt: '2026-03-08T00:00:00Z' });
    const lines = buildHeaderLines(
      pending,
      120,
      {
        nowEpochSeconds: Math.floor(new Date('2026-03-08T00:00:30Z').getTime() / 1000),
        queueGraceSeconds: 120,
      },
      null,
    );

    expect(lines.some((line) => line.includes('Wait: grace-wait:90s'))).toBe(true);
  });
});
