import { describe, expect, it } from 'vitest';
import type { Job, JobObservabilitySnapshot, JobStep } from '../../src/core/types.js';
import type { JobWhy } from '../../src/core/job-introspection.js';
import { buildJobExportMarkdown } from '../../src/core/job-export.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'alpha',
    scope: 'phase',
    description: 'Implement export command for observability.',
    requirementPath: 'requirements/job-observability-cost-tracking-and-export.md',
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08T01:00:00Z',
    startedAt: '2026-03-08T01:01:00Z',
    completedAt: '2026-03-08T01:12:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 2,
    sessionTitles: '["alpha-execute-phase-1"]',
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: ['anthropic/claude-sonnet-4-6'],
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

function makeStep(overrides: Partial<JobStep> = {}): JobStep {
  return {
    id: 1,
    jobId: 'ab12',
    stepIndex: 0,
    command: 'execute-phase',
    args: '45 --auto',
    sessionTitle: 'alpha-execute-phase-1',
    sessionId: 's1',
    status: 'completed',
    verdictSource: 'semantic-check',
    verdictReason: 'build passed and tests passed',
    startedAt: '2026-03-08T01:01:00Z',
    completedAt: '2026-03-08T01:06:00Z',
    durationMs: 300000,
    ...overrides,
  };
}

function makeObservability(overrides: Partial<JobObservabilitySnapshot> = {}): JobObservabilitySnapshot {
  return {
    jobId: 'ab12',
    jobStatus: 'completed',
    terminal: true,
    requested: {
      modelProfile: 'balanced',
      providerMode: 'hybrid',
      scope: 'phase',
      intendedExecutorModel: 'anthropic/claude-sonnet-4-6',
      notes: [],
    },
    observed: {
      status: 'available',
      models: ['anthropic/claude-sonnet-4-6'],
      notes: [],
    },
    tokens: {
      status: 'available',
      totals: {
        input: 1200,
        output: 800,
        reasoning: 300,
        cacheRead: 50,
        cacheWrite: 20,
        total: 2370,
      },
      byModel: {
        'anthropic/claude-sonnet-4-6': {
          input: 1200,
          output: 800,
          reasoning: 300,
          cacheRead: 50,
          cacheWrite: 20,
          total: 2370,
        },
      },
      notes: [],
    },
    cost: {
      status: 'estimated',
      currency: 'USD',
      estimatedUsd: 0.032,
      byModel: [
        {
          model: 'anthropic/claude-sonnet-4-6',
          status: 'estimated',
          estimatedUsd: 0.032,
          tokens: {
            input: 1200,
            output: 800,
            reasoning: 300,
            cacheRead: 50,
            cacheWrite: 20,
            total: 2370,
          },
          notes: [],
        },
      ],
      notes: [],
    },
    ...overrides,
  };
}

const statusWhy: JobWhy = {
  code: 'undo-safe',
  badge: 'undo:safe',
  what: 'Undo checkpoints look compatible.',
  why: 'Base/head checkpoints exist with no active guard signals.',
  next: 'Run pilot undo ab12 --dry-run to preview rollback.',
};

const retryWhy: JobWhy = {
  code: 'retry-unavailable',
  badge: 'retry-unavailable',
  what: 'Job is completed.',
  why: 'Retry only applies to failed or cancelled jobs.',
  next: 'Queue a new job for follow-up work.',
};

const undoWhy: JobWhy = {
  code: 'undo-safe',
  badge: 'undo:safe',
  what: 'Undo checkpoints look compatible.',
  why: 'Base/head checkpoints exist with no active guard signals.',
  next: 'Run pilot undo ab12 --dry-run to preview rollback.',
};

describe('buildJobExportMarkdown', () => {
  it('builds a success artifact with requested/observed/estimated semantics and commit delta', () => {
    const markdown = buildJobExportMarkdown({
      job: makeJob(),
      steps: [
        makeStep({ stepIndex: 0, command: 'plan-phase', args: '45 --auto' }),
        makeStep({ id: 2, stepIndex: 1, command: 'execute-phase', args: '45 --auto' }),
      ],
      observability: makeObservability(),
      statusWhy,
      retryWhy,
      undoWhy,
      generatedAt: new Date('2026-03-08T01:20:00Z'),
    });

    expect(markdown).toContain('# Pilot Job Export: ab12');
    expect(markdown).toContain('Requested run configuration (`requested`)');
    expect(markdown).toContain('Actual models (`observed` = available): `anthropic/claude-sonnet-4-6`');
    expect(markdown).toContain('Cost estimate status (`estimated`): estimated');
    expect(markdown).toContain('Estimated cost (`estimated`): $0.0320 USD');
    expect(markdown).toContain('Commit delta: changed');
    expect(markdown).toContain('Requirement path: requirements/job-observability-cost-tracking-and-export.md');
    expect(markdown).toContain('step 1: plan-phase 45 --auto');
    expect(markdown).toContain('step 2: execute-phase 45 --auto');
  });

  it('builds a failure artifact with failure context and retry guidance', () => {
    const markdown = buildJobExportMarkdown({
      job: makeJob({
        status: 'failed',
        error: 'verification failed',
        gitHeadCommit: '1111111111111111111111111111111111111111',
      }),
      steps: [
        makeStep({ stepIndex: 0, command: 'plan-phase', status: 'completed' }),
        makeStep({
          id: 2,
          stepIndex: 1,
          command: 'execute-phase',
          status: 'failed',
          verdictReason: 'build failed due to type errors in export command implementation',
        }),
      ],
      observability: makeObservability({
        jobStatus: 'failed',
      }),
      statusWhy: {
        code: 'retryable-failure',
        badge: 'retryable',
        what: 'Last run failed but appears retryable.',
        why: 'Latest failure: verification failed',
        next: 'Run pilot retry ab12.',
      },
      retryWhy: {
        code: 'retryable-failure',
        badge: 'retryable',
        what: 'Last run failed but appears retryable.',
        why: 'Latest failure: verification failed',
        next: 'Run pilot retry ab12.',
      },
      undoWhy: {
        code: 'undo-safe',
        badge: 'undo:safe',
        what: 'Undo checkpoints look compatible.',
        why: 'Base/head checkpoints exist with no active guard signals.',
        next: 'Run pilot undo ab12 --dry-run to preview rollback.',
      },
    });

    expect(markdown).toContain('Outcome summary: Last run failed but appears retryable.');
    expect(markdown).toContain('Failure context: execute-phase 45 --auto');
    expect(markdown).toContain('Failure reason: build failed due to type errors in export command implementation');
    expect(markdown).toContain('Retry context: Last run failed but appears retryable.');
    expect(markdown).toContain('Commit delta: no-op');
  });
});
