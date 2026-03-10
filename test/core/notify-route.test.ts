import { describe, expect, it } from 'vitest';
import type { Job, OpenClawDeliverRoute, Project } from '../../src/core/types.js';
import { deriveRouteFromLegacyValue, resolveNotifyRoute, validateOpenClawDeliverRoute } from '../../src/core/notify-route.js';

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
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    path: '/tmp/project',
    owner: null,
    notifyOpenClawRoute: null,
    status: 'active',
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

describe('notify-route', () => {
  it('resolves a valid structured job route', () => {
    const route: OpenClawDeliverRoute = {
      kind: 'openclaw-agent-deliver',
      agentId: 'benefitu',
      channel: 'telegram',
      to: 'telegram:-5181925291',
      accountId: 'benefitu',
    };

    const result = resolveNotifyRoute(makeJob({ notifyRoute: route }), makeProject());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('job-route');
      expect(result.route).toEqual(route);
    }
  });

  it('fails structured validation when a required field is missing', () => {
    const result = validateOpenClawDeliverRoute(
      {
        kind: 'openclaw-agent-deliver',
        agentId: 'main',
        channel: 'telegram',
      },
      'job notifyRoute',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('notify-route-invalid');
      expect(result.error.message).toContain('missing required fields');
    }
  });

  it('derives a route from legacy group key', () => {
    const result = deriveRouteFromLegacyValue('agent:benefitu:telegram:group:-5181925291', 'legacy-callback');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('legacy-callback');
      expect(result.route).toEqual({
        kind: 'openclaw-agent-deliver',
        agentId: 'benefitu',
        channel: 'telegram',
        to: 'telegram:-5181925291',
      });
    }
  });

  it('derives a route from legacy DM/channel key', () => {
    const result = deriveRouteFromLegacyValue('agent:main:telegram:channel:6102973659', 'legacy-owner');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route).toEqual({
        kind: 'openclaw-agent-deliver',
        agentId: 'main',
        channel: 'telegram',
        to: 'telegram:6102973659',
        accountId: 'main',
      });
    }
  });

  it('fails on unknown/plain legacy values', () => {
    const result = resolveNotifyRoute(
      makeJob({ callbackSessionKey: 'main' }),
      makeProject(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('notify-route-legacy-ambiguous');
      expect(result.error.message).toContain('cannot be safely mapped');
    }
  });

  it('prefers structured route over parseable legacy value', () => {
    const structured: OpenClawDeliverRoute = {
      kind: 'openclaw-agent-deliver',
      agentId: 'benefitu',
      channel: 'telegram',
      to: 'telegram:-5181925291',
    };

    const result = resolveNotifyRoute(
      makeJob({
        notifyRoute: structured,
        callbackSessionKey: 'agent:main:telegram:channel:6102973659',
      }),
      makeProject(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('job-route');
      expect(result.route).toEqual(structured);
    }
  });
});
