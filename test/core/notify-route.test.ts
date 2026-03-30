import { describe, expect, it } from 'vitest';
import type { Job, Project } from '../../src/core/types.js';
import type { NotifyRoute } from '../../src/core/notify-backends/types.js';
import { deriveRouteFromLegacyValue, resolveNotifyRoutes } from '../../src/core/notify-route.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'abcd',
    project: '/tmp/project',
    scope: 'phase',
    description: 'test job',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-10T00:00:00Z',
    startedAt: '2026-03-10T00:00:10Z',
    completedAt: '2026-03-10T00:01:00Z',
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
    notifyRoute: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    runtimeSkillSnapshot: null,
    retryBudget: 2,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    path: '/tmp/project',
    owner: null,
    notifyRoutes: null,
    status: 'active',
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-10T00:00:00Z',
    defaultCategories: null,
    approvedGsdVersion: null,
    installedGsdVersion: null,
    gsdDriftStatus: null,
    gsdVersionCheckedAt: null,
    gsdVersionError: null,
    ...overrides,
  };
}

describe('resolveNotifyRoutes', () => {
  it('returns job routes as-is when job has an array of routes', () => {
    const routes: NotifyRoute[] = [
      { kind: 'kimaki', sessionId: 'ses_abc' },
      { kind: 'webhook', url: 'https://example.com/hook' },
    ];

    const result = resolveNotifyRoutes(makeJob({ notifyRoute: routes }), makeProject());
    expect(result).toEqual(routes);
  });

  it('falls back to project routes when job has no routes', () => {
    const projectRoutes: NotifyRoute[] = [
      { kind: 'telegram', chatId: '-518192' },
    ];

    const result = resolveNotifyRoutes(
      makeJob({ notifyRoute: null }),
      makeProject({ notifyRoutes: projectRoutes }),
    );
    expect(result).toEqual(projectRoutes);
  });

  it('derives openclaw route from legacy callbackSessionKey when no job or project routes', () => {
    const result = resolveNotifyRoutes(
      makeJob({ callbackSessionKey: 'agent:benefitu:telegram:group:-5181925291' }),
      makeProject(),
    );

    expect(result).toEqual([{
      kind: 'openclaw-agent-deliver',
      agentId: 'benefitu',
      channel: 'telegram',
      to: 'telegram:-5181925291',
    }]);
  });

  it('returns empty array when no routes anywhere', () => {
    const result = resolveNotifyRoutes(makeJob(), makeProject());
    expect(result).toEqual([]);
  });

  it('job routes take precedence over project routes', () => {
    const jobRoutes: NotifyRoute[] = [{ kind: 'kimaki', sessionId: 'ses_abc' }];
    const projectRoutes: NotifyRoute[] = [
      { kind: 'openclaw-agent-deliver', agentId: 'main', channel: 'telegram', to: 'telegram:123' },
    ];

    const result = resolveNotifyRoutes(
      makeJob({ notifyRoute: jobRoutes }),
      makeProject({ notifyRoutes: projectRoutes }),
    );
    expect(result).toEqual(jobRoutes);
  });

  it('returns empty array when callbackSessionKey is ambiguous/unparseable', () => {
    const result = resolveNotifyRoutes(
      makeJob({ callbackSessionKey: 'main' }),
      makeProject(),
    );
    expect(result).toEqual([]);
  });

  it('uses project routes when job routes is empty array', () => {
    const projectRoutes: NotifyRoute[] = [
      { kind: 'webhook', url: 'https://example.com' },
    ];

    const result = resolveNotifyRoutes(
      makeJob({ notifyRoute: [] }),
      makeProject({ notifyRoutes: projectRoutes }),
    );
    expect(result).toEqual(projectRoutes);
  });

  it('handles null project gracefully', () => {
    const result = resolveNotifyRoutes(makeJob(), null);
    expect(result).toEqual([]);
  });
});

describe('deriveRouteFromLegacyValue', () => {
  it('derives a route from legacy group key', () => {
    const result = deriveRouteFromLegacyValue('agent:benefitu:telegram:group:-5181925291');
    expect(result).toEqual({
      kind: 'openclaw-agent-deliver',
      agentId: 'benefitu',
      channel: 'telegram',
      to: 'telegram:-5181925291',
    });
  });

  it('derives a route from legacy DM/channel key with accountId', () => {
    const result = deriveRouteFromLegacyValue('agent:main:telegram:channel:6102973659');
    expect(result).toEqual({
      kind: 'openclaw-agent-deliver',
      agentId: 'main',
      channel: 'telegram',
      to: 'telegram:6102973659',
      accountId: 'main',
    });
  });

  it('returns null on unknown/plain legacy values', () => {
    const result = deriveRouteFromLegacyValue('main');
    expect(result).toBeNull();
  });
});
