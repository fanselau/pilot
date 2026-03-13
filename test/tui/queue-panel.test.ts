import { describe, it, expect } from 'vitest';
import { buildQueueBadges, buildQueueRowLine } from '../../src/tui/components/queue-panel.js';
import type { Job } from '../../src/core/types.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'demo-project',
    scope: 'phase',
    description: 'Implement queue visibility',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08T00:00:00Z',
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
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

describe('queue panel badge helpers', () => {
  it('shows grace-wait badge with remaining time for grace-gated pending jobs', () => {
    const job = makeJob({ status: 'pending' });
    const badges = buildQueueBadges(job, {
      queueGraceSeconds: 120,
      nowEpochSeconds: Math.floor(new Date('2026-03-08T00:00:30Z').getTime() / 1000),
    });

    expect(badges).toContain('grace-wait:90s');
  });

  it('shows blocked-project badge for blocked queue rows', () => {
    const job = makeJob({ status: 'pending', project: 'blocked-proj' });
    const badges = buildQueueBadges(job, {
      blockedProjects: new Set(['blocked-proj']),
      blockedProjectReasons: new Map([['blocked-proj', 'manual block']]),
      queueGraceSeconds: 120,
      nowEpochSeconds: Math.floor(new Date('2026-03-08T00:03:00Z').getTime() / 1000),
    });

    expect(badges).toContain('blocked-project');
  });

  it('renders compact newer-work and no-op style badges', () => {
    const guardedFailed = makeJob({
      status: 'failed',
      error: 'Refusing undo: newer commits exist after this checkpoint',
      gitBaseCommit: '1111111111111111111111111111111111111111',
      gitHeadCommit: '2222222222222222222222222222222222222222',
    });
    const noOpCompleted = makeJob({
      status: 'completed',
      gitBaseCommit: 'abc123',
      gitHeadCommit: 'abc123',
      completedAt: '2026-03-08T00:10:00Z',
    });

    expect(buildQueueBadges(guardedFailed)).toContain('undo:guarded-newer-work');
    expect(buildQueueBadges(noOpCompleted)).toContain('no-op');
  });

  it('keeps badges readable on selected rows', () => {
    const line = buildQueueRowLine(makeJob(), {
      selected: true,
      queueGraceSeconds: 120,
      nowEpochSeconds: Math.floor(new Date('2026-03-08T00:00:30Z').getTime() / 1000),
    });

    expect(line.startsWith('▸')).toBe(true);
    expect(line).toContain('[grace-wait:90s]');
  });
});
