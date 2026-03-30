import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobObservabilitySnapshot, JobStep, SessionMessage } from '../../src/core/types.js';

const mockBuildJobWhy = vi.fn();
const mockBuildRetryWhy = vi.fn();
const mockBuildJobObservability = vi.fn();
const mockBuildJudgeSignal = vi.fn();
const mockFindSessionByTitle = vi.fn();
const mockGetLatestUsefulAssistantTextMessage = vi.fn();

vi.mock('../../src/core/job-introspection.js', () => ({
  buildJobWhy: (...args: unknown[]) => mockBuildJobWhy(...args),
  buildRetryWhy: (...args: unknown[]) => mockBuildRetryWhy(...args),
}));

vi.mock('../../src/core/job-observability.js', () => ({
  buildJobObservability: (...args: unknown[]) => mockBuildJobObservability(...args),
}));

vi.mock('../../src/core/judge-signal.js', () => ({
  buildJudgeSignal: (...args: unknown[]) => mockBuildJudgeSignal(...args),
}));

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  getLatestUsefulAssistantTextMessage: (...args: unknown[]) => mockGetLatestUsefulAssistantTextMessage(...args),
}));

import { buildJobExecutiveSummary } from '../../src/core/job-summary.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: '/repo/project',
    scope: 'phase',
    description: 'Implement summary system',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-30T10:00:00Z',
    startedAt: '2026-03-30T10:01:00Z',
    completedAt: '2026-03-30T10:05:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
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
    notifyRoute: null,
    categories: null,
    runtimeSkillSnapshot: null,
    gitBaseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    gitHeadCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
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

function makeStep(overrides: Partial<JobStep> = {}): JobStep {
  return {
    id: 1,
    jobId: 'ab12',
    stepIndex: 0,
    command: 'execute-phase',
    args: '102 --auto',
    source: 'delegation',
    status: 'completed',
    sessionId: null,
    sessionTitle: 'session-1',
    reason: null,
    startedAt: '2026-03-30T10:01:00Z',
    completedAt: '2026-03-30T10:02:00Z',
    error: null,
    durationMs: 60_000,
    verdictSource: null,
    verdictReason: null,
    ...overrides,
  };
}

function makeMessage(text: string, createdAt = 1000): SessionMessage {
  return {
    id: `msg-${createdAt}`,
    role: 'assistant',
    content: text,
    createdAt,
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
      totals: { input: 1, output: 2, reasoning: 3, cacheRead: 0, cacheWrite: 0, total: 6 },
      byModel: {},
      notes: [],
    },
    cost: {
      status: 'estimated',
      currency: 'USD',
      estimatedUsd: 0.01,
      byModel: [],
      notes: [],
    },
    ...overrides,
  };
}

describe('buildJobExecutiveSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildJobWhy.mockReturnValue({
      code: 'launchable',
      badge: 'pending-ready',
      what: 'Fallback what',
      why: 'Fallback why',
      next: 'Fallback next',
    });
    mockBuildRetryWhy.mockReturnValue({
      code: 'failed',
      badge: 'failed',
      what: 'Retry what',
      why: 'Retry why',
      next: 'Run unblock',
    });
    mockBuildJobObservability.mockReturnValue(makeObservability());
    mockBuildJudgeSignal.mockReturnValue({
      outcome: 'none',
      badge: '',
      confidence: null,
      reason: null,
      verdict: null,
      gaps: null,
      verification: null,
      retryRecommendation: null,
      retryHint: null,
      failureFingerprint: null,
    });
    mockFindSessionByTitle.mockImplementation((title: string) => `${title}-resolved`);
    mockGetLatestUsefulAssistantTextMessage.mockReturnValue(null);
  });

  it('builds deterministic summary for completed jobs with step summaries and commit delta', () => {
    const steps = [
      makeStep({ stepIndex: 0, command: 'plan-phase', sessionId: 'sess-1', sessionTitle: 'session-1' }),
      makeStep({ id: 2, stepIndex: 1, command: 'execute-phase', sessionId: 'sess-2', sessionTitle: 'session-2' }),
    ];
    mockGetLatestUsefulAssistantTextMessage
      .mockReturnValueOnce(makeMessage('Planned implementation', 1000))
      .mockReturnValueOnce(makeMessage('Implemented src/core/job-summary.ts and src/commands/summary.ts', 2000));

    const summary = buildJobExecutiveSummary(makeJob(), steps);

    expect(summary.what).toBe('Implemented src/core/job-summary.ts and src/commands/summary.ts');
    expect(summary.why).toBe('Fallback why');
    expect(summary.next).toBe('Fallback next');
    expect(summary.statusBadge).toBe('pending-ready');
    expect(summary.outcome).toBe('success');
    expect(summary.currentOrFinalStep).toEqual({
      index: 2,
      total: 2,
      command: 'execute-phase',
      status: 'completed',
    });
    expect(summary.commitDelta).toEqual({
      state: 'changed',
      baseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(summary.steps[1]?.shortSummary).toContain('Implemented src/core/job-summary.ts');
  });

  it('prefers assistant or failed-step reason for failures and includes retry drilldown guidance', () => {
    const job = makeJob({ status: 'failed', error: 'runner timeout' });
    const steps = [
      makeStep({
        stepIndex: 0,
        status: 'failed',
        sessionId: 'sess-1',
        sessionTitle: 'session-1',
        verdictReason: 'Vitest failed in test/core/job-summary.test.ts',
        error: 'runner timeout',
      }),
    ];
    mockGetLatestUsefulAssistantTextMessage.mockReturnValue(makeMessage('Tests failed in test/core/job-summary.test.ts; inspect the assertion mismatch.', 1000));

    const summary = buildJobExecutiveSummary(job, steps);

    expect(summary.what).toContain('Tests failed in test/core/job-summary.test.ts');
    expect(summary.failureReason).toBe('Vitest failed in test/core/job-summary.test.ts');
    expect(summary.steps[0]?.shortSummary).toContain('Tests failed in test/core/job-summary.test.ts');
    expect(summary.drilldown.unblockCommand).toBe('pilot unblock "/repo/project"');
  });

  it('surfaces judge verification data and key artifacts for phase jobs', () => {
    mockBuildJudgeSignal.mockReturnValue({
      outcome: 'gaps',
      badge: 'judge:gaps 82%',
      confidence: 82,
      reason: '2 verification gaps remain',
      verdict: 'gaps_found',
      gaps: ['missing screenshot'],
      verification: {
        status: 'gaps_found',
        actionableGapCount: 2,
        humanVerificationCount: 1,
        routingDecision: 'continue-gaps',
        routingReason: 'Need follow-up changes',
        artifactPath: 'artifacts/verify/ab12/report.md',
      },
      retryRecommendation: null,
      retryHint: null,
      failureFingerprint: null,
    });
    mockGetLatestUsefulAssistantTextMessage.mockReturnValue(
      makeMessage('Generated report at src/core/job-summary.ts and docs/summary.md', 1000),
    );

    const summary = buildJobExecutiveSummary(makeJob(), [makeStep({ sessionId: 'sess-1' })]);

    expect(summary.judge).toEqual({
      verdict: 'gaps_found',
      confidence: 82,
      reason: '2 verification gaps remain',
      badge: 'judge:gaps 82%',
    });
    expect(summary.verification).toEqual({
      status: 'gaps_found',
      actionableGapCount: 2,
      humanVerificationCount: 1,
      routingDecision: 'continue-gaps',
      routingReason: 'Need follow-up changes',
      artifactPath: 'artifacts/verify/ab12/report.md',
    });
    expect(summary.keyArtifacts).toEqual([
      'artifacts/verify/ab12/report.md',
      'src/core/job-summary.ts',
      'docs/summary.md',
    ]);
  });

  it('adds exact review commands for pending-review and review-hold jobs', () => {
    const pending = buildJobExecutiveSummary(makeJob({ status: 'completed_pending_review' }), []);
    const hold = buildJobExecutiveSummary(makeJob({ status: 'review_hold' }), []);

    expect(pending.drilldown.reviewCommand).toBe('pilot review ab12 --approve');
    expect(hold.drilldown.reviewCommand).toBe('pilot review ab12 --approve');
  });

  it('uses strict shortSummary fallback order of assistant text then verdict then error then null', () => {
    const steps = [
      makeStep({ stepIndex: 0, sessionId: 'a', sessionTitle: 'a', verdictReason: 'verdict one', error: 'error one' }),
      makeStep({ id: 2, stepIndex: 1, sessionId: 'b', sessionTitle: 'b', verdictReason: 'verdict two', error: 'error two' }),
      makeStep({ id: 3, stepIndex: 2, sessionId: 'c', sessionTitle: 'c', error: 'error three' }),
      makeStep({ id: 4, stepIndex: 3, sessionId: 'd', sessionTitle: 'd' }),
    ];
    mockGetLatestUsefulAssistantTextMessage
      .mockReturnValueOnce(makeMessage('assistant wins', 1000))
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);

    const summary = buildJobExecutiveSummary(makeJob(), steps);

    expect(summary.steps.map((step) => step.shortSummary)).toEqual([
      'assistant wins',
      'verdict two',
      'error three',
      null,
    ]);
  });

  it('caps last assistant messages at three newest unique entries skipping duplicates and empty noise', () => {
    const steps = [
      makeStep({ stepIndex: 0, sessionId: 's1', sessionTitle: 'one' }),
      makeStep({ id: 2, stepIndex: 1, sessionId: 's2', sessionTitle: 'two' }),
      makeStep({ id: 3, stepIndex: 2, sessionId: 's3', sessionTitle: 'three' }),
      makeStep({ id: 4, stepIndex: 3, sessionId: 's4', sessionTitle: 'four' }),
      makeStep({ id: 5, stepIndex: 4, sessionId: 's5', sessionTitle: 'five' }),
    ];
    mockGetLatestUsefulAssistantTextMessage
      .mockReturnValueOnce(makeMessage('same summary', 1000))
      .mockReturnValueOnce(makeMessage('same summary', 2000))
      .mockReturnValueOnce(makeMessage('', 3000))
      .mockReturnValueOnce(makeMessage('third newest', 4000))
      .mockReturnValueOnce(makeMessage('newest summary', 5000));

    const summary = buildJobExecutiveSummary(makeJob(), steps);

    expect(summary.lastAssistantMessages).toEqual([
      { stepIndex: 5, sessionTitle: 'five', text: 'newest summary' },
      { stepIndex: 4, sessionTitle: 'four', text: 'third newest' },
      { stepIndex: 1, sessionTitle: 'one', text: 'same summary' },
    ]);
  });

  it('degrades cleanly when session ids and titles are missing', () => {
    mockFindSessionByTitle.mockReturnValue(null);
    const summary = buildJobExecutiveSummary(makeJob({ sessionTitles: '["bad json"' }), [
      makeStep({ sessionId: null, sessionTitle: null }),
    ]);

    expect(summary.what).toBe('Fallback what');
    expect(summary.steps[0]?.shortSummary).toBeNull();
    expect(summary.lastAssistantMessages).toEqual([]);
    expect(summary.keyArtifacts).toEqual([]);
  });
});
