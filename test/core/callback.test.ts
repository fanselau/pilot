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
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 2,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
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

  it('builds prompt with required context and explicit reply instruction', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'TypeError: boom',
      judgeVerdict: JSON.stringify({
        verdict: 'failed',
        confidence: 88,
        reason: 'Tests did not pass',
      }),
    }));

    // Explicit reply instruction (not passive "context" framing)
    expect(prompt).toContain('Reply in your target chat');
    expect(prompt).not.toContain('treat as context');

    // All required metadata fields present
    expect(prompt).toContain('job_id: ab12');
    expect(prompt).toContain('project: test-project');
    expect(prompt).toContain('description: Implement feature X');
    expect(prompt).toContain('status: failed');
    expect(prompt).toContain('verdict: failed');
    expect(prompt).toContain('confidence: 88%');
    expect(prompt).toContain('verdict_reason: Tests did not pass');
    expect(prompt).toContain('error: TypeError: boom');
    expect(prompt).toContain('next_step:');

    // Blocked-awareness and recovery guidance in failure prompt
    expect(prompt).toContain('blocked');
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('pilot retry ab12');

    // Anti-silence instruction
    expect(prompt).toContain('Do NOT choose NO_REPLY');
  });

  it('completed job prompt has success-oriented guidance', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'completed',
      judgeVerdict: JSON.stringify({
        verdict: 'succeeded',
        confidence: 95,
        reason: 'All tests pass',
      }),
    }));

    // Success-oriented opening and guidance
    expect(prompt).toContain('just completed');
    expect(prompt).toContain('Acknowledge success');
    expect(prompt).not.toContain('Flag the failure');

    // All standard metadata fields
    expect(prompt).toContain('job_id: ab12');
    expect(prompt).toContain('project: test-project');
    expect(prompt).toContain('description: Implement feature X');
    expect(prompt).toContain('status: completed');
    expect(prompt).toContain('duration:');
    expect(prompt).toContain('verdict: succeeded');
    expect(prompt).toContain('confidence: 95%');
    expect(prompt).toContain('next_step:');
    expect(prompt).toContain('Do NOT choose NO_REPLY');
  });

  it('failed job prompt has failure-oriented guidance with follow-up', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Build failed: TypeScript compilation errors',
      judgeVerdict: JSON.stringify({
        verdict: 'failed',
        confidence: 92,
        reason: 'Build did not succeed',
      }),
    }));

    // Failure-oriented opening and guidance
    expect(prompt).toContain('just failed');
    expect(prompt).toContain('Flag the failure');
    expect(prompt).not.toContain('Acknowledge success');

    // Error and verdict fields present
    expect(prompt).toContain('error: Build failed: TypeScript compilation errors');
    expect(prompt).toContain('verdict: failed');

    // Blocked-project awareness
    expect(prompt).toContain('The project is now blocked');
    expect(prompt).toContain('blocked');

    // Log and retry guidance
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('pilot retry ab12');

    expect(prompt).toContain('Do NOT choose NO_REPLY');
  });

  it('prompt without verdict still works', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'completed',
      judgeVerdict: null,
    }));

    // Reply instruction still present
    expect(prompt).toContain('Reply in your target chat');
    expect(prompt).toContain('Do NOT choose NO_REPLY');

    // No verdict/confidence lines
    expect(prompt).not.toContain('verdict:');
    expect(prompt).not.toContain('confidence:');

    // Still has next_step
    expect(prompt).toContain('next_step:');
  });

  it('prompt truncates long description and error', () => {
    const longDesc = 'A'.repeat(300);
    const longError = 'E'.repeat(500);

    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      description: longDesc,
      error: longError,
    }));

    // Description truncated at 180 chars
    expect(prompt).toContain('description: ' + 'A'.repeat(180) + '...');
    expect(prompt).not.toContain('A'.repeat(181));

    // Error truncated at 300 chars
    expect(prompt).toContain('error: ' + 'E'.repeat(300) + '...');
    expect(prompt).not.toContain('E'.repeat(301));
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

  it('failure prompt explicitly states project is blocked', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Build failed',
    }));
    expect(prompt).toContain('project is now blocked');
    expect(prompt).toContain('no further jobs will run');
  });

  it('failure prompt includes pilot log guidance', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Tests failed',
    }));
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('inspect the transcript');
  });

  it('failure prompt guides toward retry/unblock recovery', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Compilation error',
    }));
    expect(prompt).toContain('pilot retry ab12');
    // Verify retry guidance is in next_step line
    expect(prompt).toContain('next_step:');
    const nextStepLine = prompt.split('\n').find(l => l.startsWith('next_step:'));
    expect(nextStepLine).toContain('pilot log ab12');
    expect(nextStepLine).toContain('pilot retry ab12');
  });

  it('hung failure prompt includes session title from sessionTitles', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Retry budget exhausted after interactive-prompt hang (tool: question, session: my-phase-session)',
      hungCount: 3,
      lastHungReason: 'interactive-prompt',
      sessionTitles: JSON.stringify(['first-session', 'my-phase-session']),
    }));

    // Hung enrichment section present
    expect(prompt).toContain('hung_reason: interactive-prompt');
    expect(prompt).toContain('hung_count: 3');
    expect(prompt).toContain('session_title: my-phase-session');
    expect(prompt).toContain('interactive input');
  });

  it('hung failure prompt handles null sessionTitles gracefully', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Retry budget exhausted after stuck-tool hang (tool: bash, session: build-session)',
      hungCount: 2,
      lastHungReason: 'stuck-tool',
      sessionTitles: null,
    }));

    expect(prompt).toContain('hung_reason: stuck-tool');
    expect(prompt).toContain('hung_count: 2');
    expect(prompt).not.toContain('session_title:');
  });
});
