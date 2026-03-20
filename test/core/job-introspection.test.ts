import { describe, it, expect } from 'vitest';
import type { Job } from '../../src/core/types.js';
import { buildJobWhy, buildRetryWhy, buildUndoWhy, hasNoCommitDelta } from '../../src/core/job-introspection.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'demo-proj',
    scope: 'quick',
    description: 'do thing',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08 00:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 0,
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
    notifyRoute: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

describe('buildJobWhy', () => {
  it('returns grace-wait with remainingSeconds for fresh queued jobs', () => {
    const job = makeJob({
      createdAt: '2026-03-08 00:00:00',
      status: 'pending',
      skipGracePeriod: false,
    });

    const why = buildJobWhy(job, {
      nowEpochSeconds: Date.parse('2026-03-08T00:00:30Z') / 1000,
      queueGraceSeconds: 120,
    });

    expect(why.code).toBe('grace-wait');
    expect(why.badge).toBe('grace-wait');
    expect(why.remainingSeconds).toBe(90);
  });

  it('returns blocked-project for pending jobs on blocked projects', () => {
    const why = buildJobWhy(makeJob({ status: 'pending' }), {
      projectBlocked: true,
      blockedReason: 'previous failure',
    });

    expect(why.code).toBe('project-blocked');
    expect(why.badge).toBe('blocked-project');
  });

  it('returns depends-on when dependency is not completed', () => {
    const why = buildJobWhy(makeJob({ status: 'pending', dependsOn: 'z9k1' }), {
      dependencyStatus: 'running',
    });

    expect(why.code).toBe('depends-on');
    expect(why.badge).toBe('depends-on');
  });

  it('returns project-serial when same-project job is active', () => {
    const why = buildJobWhy(makeJob({ status: 'pending' }), {
      hasRunningJobForProject: true,
    });

    expect(why.code).toBe('project-serial');
    expect(why.badge).toBe('project-serial');
  });

  it('returns no-commit-delta when base/head match', () => {
    const why = buildJobWhy(
      makeJob({
        status: 'completed',
        gitBaseCommit: 'abc',
        gitHeadCommit: 'abc',
      }),
    );

    expect(why.code).toBe('no-commit-delta');
    expect(why.badge).toBe('no-op');
  });
});

describe('buildRetryWhy', () => {
  it('marks failed no-op jobs as needs-revision', () => {
    const why = buildRetryWhy(
      makeJob({
        status: 'failed',
        gitBaseCommit: '123',
        gitHeadCommit: '123',
      }),
    );

    expect(why.code).toBe('needs-revision');
    expect(why.badge).toBe('needs-revision');
  });

  it('marks generic failed jobs as retryable', () => {
    const why = buildRetryWhy(
      makeJob({
        status: 'failed',
        error: 'network timeout while launching session',
      }),
    );

    expect(why.code).toBe('failed');
    expect(why.badge).toBe('failed');
  });
});

describe('buildUndoWhy', () => {
  it('returns undo-safe for checkpointed terminal jobs', () => {
    const why = buildUndoWhy(
      makeJob({
        status: 'completed',
        gitBaseCommit: '111',
        gitHeadCommit: '222',
      }),
    );

    expect(why.code).toBe('undo-safe');
    expect(why.badge).toBe('undo:safe');
  });

  it('returns undo-safe even when started dirty (dirty-start no longer blocks)', () => {
    const why = buildUndoWhy(
      makeJob({
        status: 'failed',
        gitBaseCommit: '111',
        gitHeadCommit: '222',
        startedDirty: true,
      }),
    );

    expect(why.code).toBe('undo-safe');
    expect(why.badge).toBe('undo:safe');
  });

  it('returns undo-unavailable when checkpoints are missing', () => {
    const why = buildUndoWhy(
      makeJob({
        status: 'completed',
        gitBaseCommit: null,
        gitHeadCommit: null,
      }),
    );

    expect(why.code).toBe('undo-unavailable');
    expect(why.badge).toBe('undo:unavailable');
  });
});

describe('hasNoCommitDelta', () => {
  it('detects identical base/head checkpoints', () => {
    const job = makeJob({ gitBaseCommit: 'abc', gitHeadCommit: 'abc' });
    expect(hasNoCommitDelta(job)).toBe(true);
  });
});
