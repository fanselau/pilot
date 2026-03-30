import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, Project } from '../../src/core/types.js';
import type { NotifyRoute, NotifyResult } from '../../src/core/notify-backends/types.js';

vi.mock('../../src/core/db.js', () => ({
  getProject: vi.fn(() => null),
  getJobSteps: vi.fn(() => []),
}));

const mockBuildJobExecutiveSummary = vi.fn();

vi.mock('../../src/core/job-summary.js', () => ({
  buildJobExecutiveSummary: (...args: unknown[]) => mockBuildJobExecutiveSummary(...args),
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
    mockBuildJobExecutiveSummary.mockReturnValue({
      what: 'Implemented shared summary builder',
      why: 'Phase 102 needs a reusable executive summary model',
      next: 'Run pilot summary ab12',
      statusBadge: 'completed',
      outcome: 'success',
      currentOrFinalStep: null,
      failureReason: null,
      judge: null,
      verification: null,
      commitDelta: { state: 'changed', baseCommit: 'a', headCommit: 'b' },
      observability: { jobId: 'ab12', jobStatus: 'completed', terminal: true, requested: { modelProfile: 'balanced', providerMode: 'claude-only', scope: 'phase', intendedExecutorModel: 'model', notes: [] }, observed: { status: 'available', models: [], notes: [] }, tokens: { status: 'available', totals: null, byModel: {}, notes: [] }, cost: { status: 'estimated', currency: 'USD', estimatedUsd: null, byModel: [], notes: [] } },
      keyArtifacts: [],
      lastAssistantMessages: [],
      steps: [],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12' },
    });
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
  function makeSummary(overrides: Record<string, unknown> = {}) {
    return {
      what: 'Implemented shared summary builder',
      why: 'Phase 102 needs a reusable executive summary model',
      next: 'Run pilot summary ab12',
      statusBadge: 'completed',
      outcome: 'success',
      currentOrFinalStep: { index: 2, total: 2, command: 'execute-phase', status: 'completed' },
      failureReason: null,
      judge: { verdict: 'passed', confidence: 95, reason: 'All tests passed', badge: 'judge:pass 95%' },
      verification: { status: 'passed', actionableGapCount: 0, humanVerificationCount: 0, routingDecision: 'complete', routingReason: 'No remaining gaps', artifactPath: 'artifacts/report.md' },
      commitDelta: { state: 'changed', baseCommit: 'a', headCommit: 'b' },
      observability: { jobId: 'ab12', jobStatus: 'completed', terminal: true, requested: { modelProfile: 'balanced', providerMode: 'claude-only', scope: 'phase', intendedExecutorModel: 'model', notes: [] }, observed: { status: 'available', models: ['model'], notes: [] }, tokens: { status: 'available', totals: { input: 1, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 2 }, byModel: {}, notes: [] }, cost: { status: 'estimated', currency: 'USD', estimatedUsd: 0.01, byModel: [], notes: [] } },
      keyArtifacts: ['artifacts/report.md'],
      lastAssistantMessages: [{ stepIndex: 2, sessionTitle: 'session-2', text: 'Summary builder is complete.' }],
      steps: [],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12' },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockBuildJobExecutiveSummary.mockReturnValue(makeSummary());
  });

  it('success prompt has markdown header, summary, agent message, artifacts, next action, and commands', () => {
    const prompt = buildDeliveryPrompt(makeJob({ status: 'completed' }));

    // Header with emoji, job ID, outcome label, scope, duration
    expect(prompt).toMatch(/✅.*Pilot.*ab12.*Completed/);
    expect(prompt).toContain('phase');
    // Project short name in blockquote
    expect(prompt).toContain('test-project');
    // Summary content
    expect(prompt).toContain('**Summary:** Implemented shared summary builder');
    expect(prompt).toContain('**Agent said:** Summary builder is complete.');
    // Artifacts in backticks
    expect(prompt).toContain('`artifacts/report.md`');
    // Judge verdict
    expect(prompt).toContain('**Judge:** passed (95%)');
    // Next action is concrete
    expect(prompt).toContain('**Next:**');
    expect(prompt).not.toContain('Retry');
    // Commands in code block
    expect(prompt).toContain('pilot summary ab12');
    expect(prompt).toContain('pilot log ab12');
    // No generic acknowledgement wording
    expect(prompt).not.toContain('Acknowledge success');
    expect(prompt).not.toContain('This is a real event');
  });

  it('failed prompt leads with failure reason, includes agent context and unblock command', () => {
    mockBuildJobExecutiveSummary.mockReturnValue(makeSummary({
      outcome: 'failure',
      statusBadge: 'failed',
      failureReason: 'Build failed: TypeScript compilation errors',
      lastAssistantMessages: [{ stepIndex: 1, sessionTitle: 's1', text: 'tsc found 3 errors in src/core/types.ts' }],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12', unblockCommand: 'pilot unblock "test-project"' },
    }));

    const prompt = buildDeliveryPrompt(makeJob({ status: 'failed', error: 'Build failed: TypeScript compilation errors' }));

    expect(prompt).toMatch(/❌.*Pilot.*ab12.*Failed/);
    expect(prompt).toContain('**Failure:** Build failed: TypeScript compilation errors');
    expect(prompt).toContain('**Agent said:** tsc found 3 errors in src/core/types.ts');
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('pilot unblock "test-project"');
  });

  it('review pending prompt includes approve/reject commands and action-required notice', () => {
    mockBuildJobExecutiveSummary.mockReturnValue({
      what: 'Awaiting human review', why: 'Judge requested human verification', next: 'Human review required. Run `pilot review ab12 --approve` to approve or reject.', statusBadge: 'review-pending', outcome: 'review_pending',
      currentOrFinalStep: null, failureReason: null, judge: null, verification: { status: 'human_needed', actionableGapCount: 0, humanVerificationCount: 1, routingDecision: 'human-review', routingReason: 'Need human eyes', artifactPath: null },
      commitDelta: { state: 'changed', baseCommit: 'aaaaaaaa', headCommit: 'bbbbbbbb' }, observability: { jobId: 'ab12', jobStatus: 'completed_pending_review', terminal: true, requested: { modelProfile: 'balanced', providerMode: 'claude-only', scope: 'phase', intendedExecutorModel: 'model', notes: [] }, observed: { status: 'available', models: [], notes: [] }, tokens: { status: 'available', totals: null, byModel: {}, notes: [] }, cost: { status: 'estimated', currency: 'USD', estimatedUsd: null, byModel: [], notes: [] } },
      keyArtifacts: [], lastAssistantMessages: [], steps: [],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12', reviewCommand: 'pilot review ab12 --approve' },
    });
    const prompt = buildDeliveryPrompt(makeJob({ status: 'completed_pending_review' }));

    expect(prompt).toMatch(/👀.*Needs Review/);
    expect(prompt).toContain('**Action required:** Human review');
    expect(prompt).toContain('pilot review ab12 --approve');
    expect(prompt).toContain('pilot review ab12 --reject "reason"');
  });

  it('review hold prompt includes resume command and paused notice', () => {
    mockBuildJobExecutiveSummary.mockReturnValue({
      what: 'Execution paused for review', why: 'Human checkpoint reached', next: 'Execution paused. Run `pilot review ab12 --approve` to resume.', statusBadge: 'review-hold', outcome: 'review_hold',
      currentOrFinalStep: null, failureReason: null, judge: null, verification: null,
      commitDelta: { state: 'changed', baseCommit: 'aaaaaaaa', headCommit: 'bbbbbbbb' }, observability: { jobId: 'ab12', jobStatus: 'review_hold', terminal: false, requested: { modelProfile: 'balanced', providerMode: 'claude-only', scope: 'phase', intendedExecutorModel: 'model', notes: [] }, observed: { status: 'available', models: [], notes: [] }, tokens: { status: 'available', totals: null, byModel: {}, notes: [] }, cost: { status: 'estimated', currency: 'USD', estimatedUsd: null, byModel: [], notes: [] } },
      keyArtifacts: [], lastAssistantMessages: [], steps: [],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12', reviewCommand: 'pilot review ab12 --approve' },
    });
    const prompt = buildDeliveryPrompt(makeJob({ status: 'review_hold' }));

    expect(prompt).toMatch(/⏸️.*Paused/);
    expect(prompt).toContain('**Paused:** Execution will resume after approval.');
    expect(prompt).toContain('pilot review ab12 --approve');
  });

  it('does not duplicate summary and agent-said when they are the same text', () => {
    mockBuildJobExecutiveSummary.mockReturnValue(makeSummary({
      what: 'All tests passing now.',
      lastAssistantMessages: [{ stepIndex: 1, sessionTitle: 's1', text: 'All tests passing now.' }],
    }));
    const prompt = buildDeliveryPrompt(makeJob({ status: 'completed' }));

    // Should have summary but NOT a separate agent-said since they match
    expect(prompt).toContain('**Summary:** All tests passing now.');
    expect(prompt).not.toContain('**Agent said:**');
  });
});
