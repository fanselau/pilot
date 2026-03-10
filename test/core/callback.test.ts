import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, OpenClawDeliverRoute, Project } from '../../src/core/types.js';

vi.mock('../../src/core/db.js', () => ({
  getProject: vi.fn(() => null),
}));

vi.mock('../../src/core/openclaw-deliver.js', () => ({
  executeOpenClawDeliver: vi.fn(async () => ({ ok: true })),
}));

import { getProject } from '../../src/core/db.js';
import { executeOpenClawDeliver } from '../../src/core/openclaw-deliver.js';
import { buildDeliveryPrompt, notifyJobCompletion } from '../../src/core/callback.js';

const mockGetProject = vi.mocked(getProject);
const mockExecuteOpenClawDeliver = vi.mocked(executeOpenClawDeliver);

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'test-project',
    scope: 'phase',
    description: 'Implement feature X',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-10T10:00:00Z',
    startedAt: '2026-03-10T10:10:00Z',
    completedAt: '2026-03-10T10:55:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 1,
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

function makeRoute(overrides: Partial<OpenClawDeliverRoute> = {}): OpenClawDeliverRoute {
  return {
    kind: 'openclaw-agent-deliver',
    agentId: 'benefitu',
    channel: 'telegram',
    to: 'telegram:-5181925291',
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    path: '/tmp/test-project',
    owner: null,
    notifyOpenClawRoute: null,
    status: 'active',
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

describe('notifyJobCompletion', () => {
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProject.mockReturnValue(null);
    mockExecuteOpenClawDeliver.mockResolvedValue({ ok: true });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('skips milestone coordinator jobs', async () => {
    const result = await notifyJobCompletion(makeJob({ scope: 'milestone' }));
    expect(result).toBe(false);
    expect(mockExecuteOpenClawDeliver).not.toHaveBeenCalled();
  });

  it('delivers to group-target route via openclaw deliver executor', async () => {
    const route = makeRoute({
      agentId: 'benefitu',
      channel: 'telegram',
      to: 'telegram:-5181925291',
      accountId: 'benefitu',
    });
    const result = await notifyJobCompletion(makeJob({ notifyRoute: route }));

    expect(result).toBe(true);
    expect(mockExecuteOpenClawDeliver).toHaveBeenCalledWith(
      route,
      expect.stringContaining('job_id: ab12'),
    );
  });

  it('delivers to DM-target route via openclaw deliver executor', async () => {
    const route = makeRoute({
      agentId: 'main',
      channel: 'telegram',
      to: 'telegram:6102973659',
      accountId: 'gorb',
    });
    const result = await notifyJobCompletion(makeJob({ notifyRoute: route }));

    expect(result).toBe(true);
    expect(mockExecuteOpenClawDeliver).toHaveBeenCalledWith(
      route,
      expect.stringContaining('status: completed'),
    );
  });

  it('returns false with actionable error when route config is invalid', async () => {
    const invalidRoute = {
      kind: 'openclaw-agent-deliver',
      agentId: 'main',
      channel: 'telegram',
    } as unknown as OpenClawDeliverRoute;

    const result = await notifyJobCompletion(makeJob({ notifyRoute: invalidRoute }));

    expect(result).toBe(false);
    expect(mockExecuteOpenClawDeliver).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('OpenClaw notify route error'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('notify-route-invalid'));
  });

  it('does not fall back to /hooks/wake when route resolution fails', async () => {
    const result = await notifyJobCompletion(makeJob({ callbackSessionKey: 'main' }));

    expect(result).toBe(false);
    expect(mockExecuteOpenClawDeliver).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('notify-route-legacy-ambiguous'));
  });

  it('builds prompt with required context and natural-response instruction', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'TypeError: boom',
      judgeVerdict: JSON.stringify({
        verdict: 'failed',
        confidence: 88,
        reason: 'Tests did not pass',
      }),
    }));

    expect(prompt).toContain('job_id: ab12');
    expect(prompt).toContain('project: test-project');
    expect(prompt).toContain('description: Implement feature X');
    expect(prompt).toContain('status: failed');
    expect(prompt).toContain('verdict: failed');
    expect(prompt).toContain('confidence: 88%');
    expect(prompt).toContain('next_step:');
    expect(prompt).toContain('Reply naturally in your target chat');
  });

  it('returns false and logs when delivery reports runtime failure', async () => {
    mockExecuteOpenClawDeliver.mockResolvedValueOnce({
      ok: false,
      error: 'openclaw unavailable',
    });

    const result = await notifyJobCompletion(makeJob({ notifyRoute: makeRoute() }));

    expect(result).toBe(false);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('OpenClaw delivery failed'));
  });

  it('returns false and does not throw when delivery throws unexpectedly', async () => {
    mockExecuteOpenClawDeliver.mockRejectedValueOnce(new Error('spawn ENOENT'));
    mockGetProject.mockReturnValue(makeProject({ notifyOpenClawRoute: makeRoute() }));

    await expect(notifyJobCompletion(makeJob())).resolves.toBe(false);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('notifyJobCompletion failed'));
  });
});
