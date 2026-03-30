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

  it('success prompt leads with outcome, what/why/next, evidence, and drilldown commands', () => {
    const prompt = buildDeliveryPrompt(makeJob({ status: 'completed' }));

    expect(prompt).toContain('Success — Implemented shared summary builder');
    expect(prompt).toContain('What: Implemented shared summary builder');
    expect(prompt).toContain('Why: Phase 102 needs a reusable executive summary model');
    expect(prompt).toContain('Next: Run pilot summary ab12');
    expect(prompt).toContain('Key result: Summary builder is complete.');
    expect(prompt).toContain('artifacts/report.md');
    expect(prompt).toContain('pilot summary ab12');
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('pilot status --why');
  });

  it('failed prompt leads with failure reason and unblock guidance before identifiers', () => {
    mockBuildJobExecutiveSummary.mockReturnValue(makeSummary({
      outcome: 'failure',
      statusBadge: 'failed',
      failureReason: 'Build failed: TypeScript compilation errors',
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12', unblockCommand: 'pilot unblock "test-project"' },
    }));

    const prompt = buildDeliveryPrompt(makeJob({ status: 'failed', error: 'Build failed: TypeScript compilation errors' }));

    expect(prompt).toContain('Failure — Build failed: TypeScript compilation errors');
    expect(prompt).toContain('Failure: Build failed: TypeScript compilation errors');
    expect(prompt).toContain('pilot log ab12');
    expect(prompt).toContain('pilot unblock "test-project"');
  });

  it('review pending prompt includes exact approve and reject commands and says it is not a failure', () => {
    mockBuildJobExecutiveSummary.mockReturnValue({
      what: 'Awaiting human review', why: 'Judge requested human verification', next: 'Approve or reject review', statusBadge: 'review-pending', outcome: 'review_pending',
      currentOrFinalStep: null, failureReason: null, judge: null, verification: { status: 'human_needed', actionableGapCount: 0, humanVerificationCount: 1, routingDecision: 'human-review', routingReason: 'Need human eyes', artifactPath: null },
      commitDelta: { state: 'changed', baseCommit: 'a', headCommit: 'b' }, observability: { jobId: 'ab12', jobStatus: 'completed_pending_review', terminal: true, requested: { modelProfile: 'balanced', providerMode: 'claude-only', scope: 'phase', intendedExecutorModel: 'model', notes: [] }, observed: { status: 'available', models: [], notes: [] }, tokens: { status: 'available', totals: null, byModel: {}, notes: [] }, cost: { status: 'estimated', currency: 'USD', estimatedUsd: null, byModel: [], notes: [] } },
      keyArtifacts: [], lastAssistantMessages: [], steps: [],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12', reviewCommand: 'pilot review ab12 --approve' },
    });
    const prompt = buildDeliveryPrompt(makeJob({ status: 'completed_pending_review' }));

    expect(prompt).toContain('Review pending');
    expect(prompt).toContain('This is not a failure.');
    expect(prompt).toContain('pilot review ab12 --approve');
    expect(prompt).toContain('pilot review ab12 --reject "reason"');
  });

  it('review hold prompt includes exact resume command before transcript guidance', () => {
    mockBuildJobExecutiveSummary.mockReturnValue({
      what: 'Execution paused for review', why: 'Human checkpoint reached', next: 'Approve to resume execution', statusBadge: 'review-hold', outcome: 'review_hold',
      currentOrFinalStep: null, failureReason: null, judge: null, verification: null,
      commitDelta: { state: 'changed', baseCommit: 'a', headCommit: 'b' }, observability: { jobId: 'ab12', jobStatus: 'review_hold', terminal: false, requested: { modelProfile: 'balanced', providerMode: 'claude-only', scope: 'phase', intendedExecutorModel: 'model', notes: [] }, observed: { status: 'available', models: [], notes: [] }, tokens: { status: 'available', totals: null, byModel: {}, notes: [] }, cost: { status: 'estimated', currency: 'USD', estimatedUsd: null, byModel: [], notes: [] } },
      keyArtifacts: [], lastAssistantMessages: [], steps: [],
      drilldown: { summaryCommand: 'pilot summary ab12', logCommand: 'pilot log ab12', reviewCommand: 'pilot review ab12 --approve' },
    });
    const prompt = buildDeliveryPrompt(makeJob({ status: 'review_hold' }));

    expect(prompt).toContain('Review hold');
    expect(prompt).toContain('pilot review ab12 --approve');
    expect(prompt).toContain('Execution resumes on approval.');
  });

  it('includes stable identifiers and single real-event warning without generic acknowledgement wording', () => {
    const prompt = buildDeliveryPrompt(makeJob({ status: 'completed' }));

    expect(prompt).toContain('job_id: ab12');
    expect(prompt).toContain('project: test-project');
    expect(prompt).toContain('scope: phase');
    expect(prompt).toContain('status: completed');
    expect(prompt).toContain('This is a real event. Do not ignore it.');
    expect(prompt).not.toContain('Acknowledge success');
  });
});
