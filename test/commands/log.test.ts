import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStep, JobObservabilitySnapshot } from '../../src/core/types.js';
import type { JobExecutiveSummary } from '../../src/core/job-summary.js';

const mockGetJob = vi.fn();
const mockGetQueue = vi.fn();
const mockGetJobSteps = vi.fn();
const mockGetRetryAttempts = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(...args),
  getRetryAttempts: (...args: unknown[]) => mockGetRetryAttempts(...args),
}));

const mockFindSessionByTitle = vi.fn();
const mockGetSessionParts = vi.fn();
const mockGetChildSessions = vi.fn();
const mockGetSessionTokens = vi.fn();
const mockGetSessionTokensRecursive = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  getSessionParts: (...args: unknown[]) => mockGetSessionParts(...args),
  getChildSessions: (...args: unknown[]) => mockGetChildSessions(...args),
  getSessionTokens: (...args: unknown[]) => mockGetSessionTokens(...args),
  getSessionTokensRecursive: (...args: unknown[]) => mockGetSessionTokensRecursive(...args),
}));

const mockBuildJobObservability = vi.fn();
const mockBuildJobExecutiveSummary = vi.fn();

vi.mock('../../src/core/job-observability.js', () => ({
  buildJobObservability: (...args: unknown[]) => mockBuildJobObservability(...args),
}));

vi.mock('../../src/core/job-summary.js', () => ({
  buildJobExecutiveSummary: (...args: unknown[]) => mockBuildJobExecutiveSummary(...args),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  isJsonMode: () => mockJsonMode,
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
}));

vi.mock('../../src/util/colors.js', () => ({
  bold: (s: string) => s,
  dim: (s: string) => s,
  cyan: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
}));

import { logCommand, extractAgentIdentity } from '../../src/commands/log.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'my-project',
    scope: 'phase',
    description: 'test job',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-07T00:00:00Z',
    startedAt: '2026-03-07T00:01:00Z',
    completedAt: '2026-03-07T00:10:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 1,
    sessionTitles: '[]',
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    runtimeSkillSnapshot: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '1111111111111111111111111111111111111111',
    notifyRoute: null,
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
    args: '44 --auto',
    source: 'delegation',
    sessionTitle: null,
    sessionId: null,
    status: 'completed',
    reason: null,
    verdictSource: null,
    verdictReason: null,
    startedAt: '2026-03-07T00:01:00Z',
    completedAt: '2026-03-07T00:02:00Z',
    error: null,
    durationMs: 60_000,
    ...overrides,
  };
}

function makeTextPart(text: string, createdAt: number) {
  return {
    type: 'text' as const,
    role: 'assistant' as const,
    text,
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
      totals: {
        input: 12_000,
        output: 3_000,
        reasoning: 1_000,
        cacheRead: 0,
        cacheWrite: 0,
        total: 16_000,
      },
      byModel: {
        'anthropic/claude-sonnet-4-6': {
          input: 12_000,
          output: 3_000,
          reasoning: 1_000,
          cacheRead: 0,
          cacheWrite: 0,
          total: 16_000,
        },
      },
      notes: [],
    },
    cost: {
      status: 'partial',
      currency: 'USD',
      estimatedUsd: 0.081,
      byModel: [],
      notes: ['Reasoning tokens are present but excluded from estimate.'],
    },
    ...overrides,
  };
}

function makeExecutiveSummary(overrides: Partial<JobExecutiveSummary> = {}): JobExecutiveSummary {
  return {
    what: 'Implemented shared summary builder',
    why: 'Need a single executive summary surface',
    next: 'Run pilot summary ab12',
    statusBadge: 'completed',
    outcome: 'success',
    currentOrFinalStep: {
      index: 2,
      total: 2,
      command: 'execute-phase',
      status: 'completed',
    },
    failureReason: null,
    judge: null,
    verification: null,
    commitDelta: {
      state: 'no-op',
      baseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    observability: makeObservability(),
    keyArtifacts: ['src/core/job-summary.ts'],
    lastAssistantMessages: [{ stepIndex: 2, sessionTitle: 'session-2', text: 'Summary builder complete.' }],
    steps: [],
    drilldown: {
      summaryCommand: 'pilot summary ab12',
      logCommand: 'pilot log ab12',
    },
    ...overrides,
  };
}

describe('logCommand --summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetQueue.mockReturnValue([]);
    mockGetJob.mockReturnValue(makeJob());
    mockGetJobSteps.mockReturnValue([]);
    mockGetRetryAttempts.mockReturnValue([]);
    mockFindSessionByTitle.mockReturnValue(null);
    mockGetSessionParts.mockReturnValue([]);
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionTokens.mockReturnValue({ input: 0, output: 0 });
    mockGetSessionTokensRecursive.mockReturnValue({ input: 0, output: 0, reasoning: 0 });
    mockBuildJobObservability.mockReturnValue(makeObservability());
    mockBuildJobExecutiveSummary.mockReturnValue(makeExecutiveSummary());
  });

  it('renders shared executive summary fields for human summary mode', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        status: 'completed',
        gitBaseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        gitHeadCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );
    mockGetJobSteps.mockReturnValue([
      makeStep({
        stepIndex: 0,
        command: 'plan-phase',
        verdictReason: 'build passed',
      }),
      makeStep({
        id: 2,
        stepIndex: 1,
        command: 'execute-phase',
        verdictSource: 'semantic-check',
        verdictReason: 'all tests passed and build succeeded',
      }),
    ]);

    await logCommand('ab12', { summary: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('my-project · phase · ab12 · success · completed');
    expect(output).toContain('what: Implemented shared summary builder');
    expect(output).toContain('why: Need a single executive summary surface');
    expect(output).toContain('next: Run pilot summary ab12');
    expect(output).toContain('step: 2/2 execute-phase [completed]');
    expect(output).toContain('key artifacts: src/core/job-summary.ts');
    expect(output).toContain('assistant messages:');
    expect(output).toContain('2. Summary builder complete.');
    expect(mockGetSessionParts).not.toHaveBeenCalled();
  });

  it('returns shared { job, summary } JSON output in summary mode', async () => {
    mockJsonMode = true;
    const summary = makeExecutiveSummary({
      outcome: 'failure',
      failureReason: 'build failed and tests failed',
    });
    mockBuildJobExecutiveSummary.mockReturnValue(summary);

    await logCommand('ab12', { summary: true, json: true });

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    expect(mockOutputJson).toHaveBeenCalledWith({
      job: {
        id: 'ab12',
        project: 'my-project',
        scope: 'phase',
        description: 'test job',
        status: 'completed',
        attempts: 1,
        currentStep: 1,
      },
      summary,
    });
    expect(mockGetSessionParts).not.toHaveBeenCalled();
  });

  it('shows actionable shared-builder guidance for failed jobs in human summary', async () => {
    mockBuildJobExecutiveSummary.mockReturnValue(makeExecutiveSummary({
      outcome: 'failure',
      statusBadge: 'failed',
      failureReason: 'network timeout',
      next: 'Run pilot unblock "my-project"',
      drilldown: {
        summaryCommand: 'pilot summary ab12',
        logCommand: 'pilot log ab12',
        unblockCommand: 'pilot unblock "my-project"',
      },
    }));

    await logCommand('ab12', { summary: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('next: Run pilot unblock "my-project"');
    expect(output).toContain('network timeout');
    expect(output).toContain('pilot unblock "my-project"');
  });

  it('shows review guidance from the shared builder in summary output', async () => {
    mockBuildJobExecutiveSummary.mockReturnValue(makeExecutiveSummary({
      outcome: 'review_pending',
      statusBadge: 'review-pending',
      verification: {
        status: 'human_needed',
        actionableGapCount: 0,
        humanVerificationCount: 2,
        routingDecision: 'human-review',
        routingReason: 'Structured verification reports 2 human verification item(s) and no actionable gaps',
        artifactPath: '/resolved/my-project/.planning/phases/87-routing/87-VERIFICATION.md',
      },
      drilldown: {
        summaryCommand: 'pilot summary ab12',
        logCommand: 'pilot log ab12',
        reviewCommand: 'pilot review ab12 --approve',
      },
    }));

    await logCommand('ab12', { summary: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('verification: human_needed');
    expect(output).toContain('actionable=0');
    expect(output).toContain('human=2');
    expect(output).toContain('routing=human-review');
    expect(output).toContain('pilot review ab12 --approve');
  });

  it('uses shared-builder fallback state without transcript reads', async () => {
    mockGetJobSteps.mockReturnValue([]);
    mockBuildJobExecutiveSummary.mockReturnValue(makeExecutiveSummary({
      statusBadge: 'undo:safe',
      currentOrFinalStep: null,
    }));

    await logCommand('ab12', { summary: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('undo:safe');
    expect(output).toContain('step: no step metadata recorded');
    expect(mockGetSessionParts).not.toHaveBeenCalled();
  });
});

describe('logCommand retry chain rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetQueue.mockReturnValue([]);
    mockGetJob.mockReturnValue(
      makeJob({
        attempts: 2,
        retryHint: 'retry-full: Full rerun after stale verification evidence',
        sessionTitles: JSON.stringify(['attempt-2-execute']),
      }),
    );
    mockGetJobSteps.mockReturnValue([]);
    mockGetRetryAttempts.mockReturnValue([
      {
        id: 1,
        jobId: 'ab12',
        attemptNumber: 1,
        sessionTitles: ['attempt-1-execute'],
        retryStrategy: 'retry-resume',
        retryHint: 'Resume from missing summary checks',
        failureFingerprint: ['missing-summary'],
        archivedAt: '2026-03-07T00:03:00Z',
      },
    ]);

    const sessionIds: Record<string, string> = {
      'attempt-1-execute': 'sess-attempt-1',
      'attempt-2-execute': 'sess-attempt-2',
    };
    mockFindSessionByTitle.mockImplementation((title: string) => sessionIds[title] ?? null);
    mockGetSessionParts.mockImplementation((sessionId: string) => {
      if (sessionId === 'sess-attempt-1') {
        return [makeTextPart('archived attempt output', 1_000)];
      }
      if (sessionId === 'sess-attempt-2') {
        return [makeTextPart('current attempt output', 2_000)];
      }
      return [];
    });
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionTokens.mockReturnValue({ input: 0, output: 0 });
    mockGetSessionTokensRecursive.mockReturnValue({ input: 0, output: 0, reasoning: 0 });
    mockBuildJobObservability.mockReturnValue(makeObservability());
  });

  it('renders archived and current attempt sections when --chain is enabled', async () => {
    await logCommand('ab12', { chain: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('── Attempt 1 (retry-resume) ──');
    expect(output).toContain('hint: Resume from missing summary checks');
    expect(output).toContain('── Attempt 2 (current) ──');
    expect(output).toContain('archived attempt output');
    expect(output).toContain('current attempt output');
  });

  it('keeps default output focused on current attempt without --chain', async () => {
    await logCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(mockGetRetryAttempts).not.toHaveBeenCalled();
    expect(output).not.toContain('── Attempt 1');
    expect(output).not.toContain('archived attempt output');
    expect(output).toContain('current attempt output');
  });

  it('adds attempt-group metadata in JSON mode when chain is enabled', async () => {
    mockJsonMode = true;

    await logCommand('ab12', { chain: true, json: true });

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const payload = mockOutputJson.mock.calls[0][0];
    expect(payload.chain).toMatchObject({
      enabled: true,
    });
    expect(payload.chain.attempts).toHaveLength(2);
    expect(payload.chain.attempts[0]).toMatchObject({
      attempt: 1,
      source: 'archived',
      retryStrategy: 'retry-resume',
      retryHint: 'Resume from missing summary checks',
    });
    expect(payload.chain.attempts[1]).toMatchObject({
      attempt: 2,
      source: 'current',
      retryHint: 'retry-full: Full rerun after stale verification evidence',
    });
  });
});

describe('extractAgentIdentity', () => {
  it('extracts execute-phase from runner command-step title', () => {
    expect(extractAgentIdentity('myproject-execute-phase-ab12-xyz1')).toBe('execute-phase');
  });

  it('extracts pilot-delegate from delegation title', () => {
    expect(extractAgentIdentity('pilot-delegate-ab12-1-xyz1')).toBe('pilot-delegate');
  });

  it('extracts pilot-redelegate from redelegation title', () => {
    expect(extractAgentIdentity('pilot-redelegate-ab12-2-xyz1')).toBe('pilot-redelegate');
  });

  it('extracts plan-phase from runner command-step title', () => {
    expect(extractAgentIdentity('myproject-plan-phase-ab12-xyz1')).toBe('plan-phase');
  });

  it('extracts judge from runner command-step title', () => {
    expect(extractAgentIdentity('myproject-judge-ab12-xyz1')).toBe('judge');
  });

  it('extracts ui-review from runner command-step title', () => {
    expect(extractAgentIdentity('myproject-ui-review-ab12-xyz1')).toBe('ui-review');
  });

  it('extracts gsd-* agent names', () => {
    // gsd-* regex captures the full gsd match including trailing segments
    expect(extractAgentIdentity('something-gsd-ui-researcher')).toBe('gsd-ui-researcher');
    // With trailing session suffix, the full gsd-* portion is returned
    expect(extractAgentIdentity('something-gsd-executor-ab12')).toMatch(/^gsd-executor/);
  });

  it('preserves non-empty unknown title as-is', () => {
    expect(extractAgentIdentity('some-unknown-title')).toBe('some-unknown-title');
  });

  it('returns subagent for empty title', () => {
    expect(extractAgentIdentity('')).toBe('subagent');
  });
});

describe('renderChildSessions agent identity', () => {
  function makeTaskToolPart(createdAt: number) {
    return {
      id: 'part-task',
      messageId: 'msg-1',
      type: 'tool' as const,
      role: 'assistant' as const,
      tool: 'task',
      toolInput: '▶ task: subagent — "do work"',
      toolStatus: 'completed',
      createdAt,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetQueue.mockReturnValue([]);
    mockGetJob.mockReturnValue(makeJob({
      sessionTitles: JSON.stringify(['main-session']),
    }));
    mockGetJobSteps.mockReturnValue([]);
    mockGetRetryAttempts.mockReturnValue([]);
    mockFindSessionByTitle.mockReturnValue('sess-main');
    // Return a task tool part so renderChildSessions is invoked
    mockGetSessionParts.mockImplementation((sessionId: string) => {
      if (sessionId === 'sess-main') return [makeTaskToolPart(1_000)];
      return [];
    });
    mockGetSessionTokens.mockReturnValue({ input: 0, output: 0 });
    mockGetSessionTokensRecursive.mockReturnValue({ input: 0, output: 0, reasoning: 0 });
    mockBuildJobObservability.mockReturnValue(makeObservability());
  });

  it('shows pilot-redelegate in child session header, not subagent', async () => {
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-main') {
        return [{ id: 'child-1', title: 'pilot-redelegate-ab12-1-xyz1' }];
      }
      return [];
    });

    await logCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('pilot-redelegate');
    expect(output).not.toMatch(/Subagent: subagent/);
  });

  it('shows execute-phase in child session header', async () => {
    mockGetChildSessions.mockImplementation((parentId: string) => {
      if (parentId === 'sess-main') {
        return [{ id: 'child-1', title: 'myproject-execute-phase-ab12-xyz1' }];
      }
      return [];
    });

    await logCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('execute-phase');
    expect(output).not.toMatch(/Subagent: subagent/);
  });
});
