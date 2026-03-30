import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, Project } from '../../src/core/types.js';
import type { NotifyRoute, NotifyResult } from '../../src/core/notify-backends/types.js';

vi.mock('../../src/core/db.js', () => ({
  getProject: vi.fn(() => null),
  getJobSteps: vi.fn(() => []),
}));

vi.mock('../../src/core/notify-route.js', () => ({
  resolveNotifyRoutes: vi.fn(() => []),
}));

vi.mock('../../src/core/notify-backends/registry.js', () => ({
  getBackend: vi.fn(() => null),
}));

import { getProject } from '../../src/core/db.js';
import { resolveNotifyRoutes } from '../../src/core/notify-route.js';
import { getBackend } from '../../src/core/notify-backends/registry.js';
import { buildDeliveryPrompt, notifyJobCompletion } from '../../src/core/callback.js';

const mockGetProject = vi.mocked(getProject);
const mockResolveNotifyRoutes = vi.mocked(resolveNotifyRoutes);
const mockGetBackend = vi.mocked(getBackend);

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
    runtimeSkillSnapshot: null,
    ...overrides,
  };
}

function makeBackend(overrides: { deliver?: () => Promise<NotifyResult> } = {}) {
  return {
    kind: 'kimaki' as const,
    displayName: 'Kimaki',
    deliver: overrides.deliver ?? (async () => ({ ok: true })),
    detect: async () => 'detected' as const,
    validateConfig: () => null,
  };
}

describe('notifyJobCompletion — fan-out delivery', () => {
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProject.mockReturnValue(null);
    mockResolveNotifyRoutes.mockReturnValue([]);
    mockGetBackend.mockReturnValue(null);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('skips milestone coordinator jobs', async () => {
    const result = await notifyJobCompletion(makeJob({ scope: 'milestone' }));
    expect(result).toBe(false);
    expect(mockResolveNotifyRoutes).not.toHaveBeenCalled();
  });

  it('returns false with "no notify routes" log when routes empty', async () => {
    mockResolveNotifyRoutes.mockReturnValue([]);

    const result = await notifyJobCompletion(makeJob());
    expect(result).toBe(false);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('no notify routes for job ab12'),
    );
  });

  it('two backends both succeed → returns true, both logged', async () => {
    const routes: NotifyRoute[] = [
      { kind: 'kimaki', sessionId: 'ses_abc' },
      { kind: 'webhook', url: 'https://example.com/hook' },
    ];
    mockResolveNotifyRoutes.mockReturnValue(routes);

    const kimakiBackend = makeBackend({ deliver: async () => ({ ok: true }) });
    const webhookBackend = makeBackend({ deliver: async () => ({ ok: true }) });
    mockGetBackend.mockImplementation((kind) => {
      if (kind === 'kimaki') return kimakiBackend;
      if (kind === 'webhook') return webhookBackend;
      return null;
    });

    const result = await notifyJobCompletion(makeJob());
    expect(result).toBe(true);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'kimaki' delivered"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'webhook' delivered"));
  });

  it('two backends, one fails → returns true, failure logged', async () => {
    const routes: NotifyRoute[] = [
      { kind: 'kimaki', sessionId: 'ses_abc' },
      { kind: 'webhook', url: 'https://example.com/hook' },
    ];
    mockResolveNotifyRoutes.mockReturnValue(routes);

    const kimakiBackend = makeBackend({ deliver: async () => ({ ok: true }) });
    const webhookBackend = makeBackend({ deliver: async () => ({ ok: false, error: 'timeout' }) });
    mockGetBackend.mockImplementation((kind) => {
      if (kind === 'kimaki') return kimakiBackend;
      if (kind === 'webhook') return webhookBackend;
      return null;
    });

    const result = await notifyJobCompletion(makeJob());
    expect(result).toBe(true);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'kimaki' delivered"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'webhook' failed"));
  });

  it('two backends, both fail → returns false, both failures logged', async () => {
    const routes: NotifyRoute[] = [
      { kind: 'kimaki', sessionId: 'ses_abc' },
      { kind: 'webhook', url: 'https://example.com/hook' },
    ];
    mockResolveNotifyRoutes.mockReturnValue(routes);

    const kimakiBackend = makeBackend({ deliver: async () => ({ ok: false, error: 'not found' }) });
    const webhookBackend = makeBackend({ deliver: async () => ({ ok: false, error: 'timeout' }) });
    mockGetBackend.mockImplementation((kind) => {
      if (kind === 'kimaki') return kimakiBackend;
      if (kind === 'webhook') return webhookBackend;
      return null;
    });

    const result = await notifyJobCompletion(makeJob());
    expect(result).toBe(false);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'kimaki' failed"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'webhook' failed"));
  });

  it('backend throws synchronously → caught by Promise.allSettled, other backends still fire', async () => {
    const routes: NotifyRoute[] = [
      { kind: 'kimaki', sessionId: 'ses_abc' },
      { kind: 'webhook', url: 'https://example.com/hook' },
    ];
    mockResolveNotifyRoutes.mockReturnValue(routes);

    const kimakiBackend = makeBackend({
      deliver: async () => { throw new Error('spawn ENOENT'); },
    });
    const webhookBackend = makeBackend({ deliver: async () => ({ ok: true }) });
    mockGetBackend.mockImplementation((kind) => {
      if (kind === 'kimaki') return kimakiBackend;
      if (kind === 'webhook') return webhookBackend;
      return null;
    });

    const result = await notifyJobCompletion(makeJob());
    // webhook succeeded so overall should be true
    expect(result).toBe(true);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'webhook' delivered"));
  });

  it('unknown backend kind → logged as error, other backends still fire', async () => {
    const routes: NotifyRoute[] = [
      { kind: 'kimaki', sessionId: 'ses_abc' },
      { kind: 'webhook', url: 'https://example.com/hook' },
    ];
    mockResolveNotifyRoutes.mockReturnValue(routes);

    // kimaki returns null (unknown backend), webhook works
    const webhookBackend = makeBackend({ deliver: async () => ({ ok: true }) });
    mockGetBackend.mockImplementation((kind) => {
      if (kind === 'webhook') return webhookBackend;
      return null; // kimaki not found
    });

    const result = await notifyJobCompletion(makeJob());
    expect(result).toBe(true);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown backend 'kimaki'"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("backend 'webhook' delivered"));
  });
});

describe('buildDeliveryPrompt', () => {
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
    expect(prompt).toContain('pilot unblock');

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

    expect(prompt).toContain('just completed');
    expect(prompt).toContain('Acknowledge success');
    expect(prompt).not.toContain('Flag the failure');

    expect(prompt).toContain('job_id: ab12');
    expect(prompt).toContain('status: completed');
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

    expect(prompt).toContain('just failed');
    expect(prompt).toContain('Flag the failure');
    expect(prompt).not.toContain('Acknowledge success');
    expect(prompt).toContain('error: Build failed: TypeScript compilation errors');
    expect(prompt).toContain('The project is now blocked');
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('pilot unblock');
    expect(prompt).toContain('Do NOT choose NO_REPLY');
  });

  it('prompt without verdict still works', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'completed',
      judgeVerdict: null,
    }));

    expect(prompt).toContain('Reply in your target chat');
    expect(prompt).toContain('Do NOT choose NO_REPLY');
    expect(prompt).not.toContain('verdict:');
    expect(prompt).not.toContain('confidence:');
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

    expect(prompt).toContain('description: ' + 'A'.repeat(180) + '...');
    expect(prompt).not.toContain('A'.repeat(181));
    expect(prompt).toContain('error: ' + 'E'.repeat(300) + '...');
    expect(prompt).not.toContain('E'.repeat(301));
  });

  it('failure prompt explicitly states project is blocked', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Build failed',
    }));
    expect(prompt).toContain('project is now blocked');
    expect(prompt).toContain('no further jobs will run');
  });

  it('hung failure prompt includes session title from sessionTitles', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Retry budget exhausted after interactive-prompt hang (tool: question, session: my-phase-session)',
      hungCount: 3,
      lastHungReason: 'interactive-prompt',
      sessionTitles: JSON.stringify(['first-session', 'my-phase-session']),
    }));

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

  // ── Review state notifications ─────────────────────────────────────────

  it('completed_pending_review prompt says "pending human review" not "failed"', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'completed_pending_review',
    }));

    expect(prompt).toContain('pending human review');
    expect(prompt).not.toContain('just failed');
    expect(prompt).not.toContain('Flag the failure');
    expect(prompt).not.toContain('project is now blocked');
  });

  it('completed_pending_review prompt instructs pilot review --approve', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'completed_pending_review',
      id: 'ab12',
    }));

    expect(prompt).toContain('pilot review ab12 --approve');
    expect(prompt).toContain('NOT a failure');
    expect(prompt).toContain('NOT blocked');
  });

  it('review_hold prompt says "paused for human review" not "failed"', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'review_hold',
    }));

    expect(prompt).toContain('paused for human review');
    expect(prompt).not.toContain('just failed');
    expect(prompt).not.toContain('Flag the failure');
    expect(prompt).not.toContain('project is now blocked');
  });

  it('review_hold prompt instructs pilot review --approve to resume', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'review_hold',
      id: 'ab12',
    }));

    expect(prompt).toContain('pilot review ab12 --approve');
    expect(prompt).toContain('NOT a failure');
    expect(prompt).toContain('NOT blocked');
  });

  it('failed job prompt still uses "failed" language (no regression)', () => {
    const prompt = buildDeliveryPrompt(makeJob({
      status: 'failed',
      error: 'Build error',
    }));

    expect(prompt).toContain('just failed');
    expect(prompt).toContain('Flag the failure');
    expect(prompt).toContain('project is now blocked');
  });
});
