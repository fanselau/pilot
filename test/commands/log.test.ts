import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStep, JobObservabilitySnapshot } from '../../src/core/types.js';

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

vi.mock('../../src/core/job-observability.js', () => ({
  buildJobObservability: (...args: unknown[]) => mockBuildJobObservability(...args),
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
    sessionTitle: null,
    sessionId: null,
    status: 'completed',
    verdictSource: null,
    verdictReason: null,
    startedAt: '2026-03-07T00:01:00Z',
    completedAt: '2026-03-07T00:02:00Z',
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
  });

  it('renders deterministic human summary for completed no-op jobs', async () => {
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
    expect(output).toContain('Summary');
    expect(output).toContain('final step: 2/2 execute-phase [completed]');
    expect(output).toContain('signals: build=pass  test=pass');
    expect(output).toContain('observed models (available): anthropic/claude-sonnet-4-6');
    expect(output).toContain('tokens (available): 16.0k total (12.0k in / 3.0k out / 1.0k thinking)');
    expect(output).toContain('estimated cost: ~$0.0810 (partial)');
    expect(output).toContain('cost note: Reasoning tokens are present but excluded from estimate.');
    expect(output).toContain('commit delta: no-op');
    expect(output).toContain('Job produced no commit delta');
    expect(mockGetSessionParts).not.toHaveBeenCalled();
  });

  it('returns compact JSON summary for failed jobs with outcome signals', async () => {
    mockJsonMode = true;
    mockGetJob.mockReturnValue(
      makeJob({
        status: 'failed',
        error: 'runner timeout',
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
      }),
    );
    mockGetJobSteps.mockReturnValue([
      makeStep({
        stepIndex: 0,
        status: 'failed',
        verdictSource: 'semantic-check',
        verdictReason: 'build failed and tests failed',
      }),
    ]);

    await logCommand('ab12', { summary: true, json: true });

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const payload = mockOutputJson.mock.calls[0][0];
    expect(payload).toHaveProperty('job');
    expect(payload).toHaveProperty('summary');
    expect(payload.summary.step).toMatchObject({
      kind: 'final',
      index: 1,
      total: 1,
      command: 'execute-phase',
      status: 'failed',
      verdictSource: 'semantic-check',
    });
    expect(payload.summary.signals).toMatchObject({ build: 'fail', test: 'fail' });
    expect(payload.summary.commitDelta).toMatchObject({ state: 'changed' });
    expect(payload.summary.failureReason).toContain('build failed and tests failed');
    expect(payload.summary.observability).toMatchObject({
      observed: { status: 'available' },
      tokens: { status: 'available' },
      cost: { status: 'partial' },
    });
    expect(payload.summary.failureContext).toMatchObject({
      failed: true,
      failedStep: {
        index: 1,
        total: 1,
        command: 'execute-phase',
      },
      completedBeforeFailure: {
        completed: 0,
        total: 1,
      },
      retry: {
        code: 'failed',
      },
    });
    expect(mockGetSessionParts).not.toHaveBeenCalled();
  });

  it('shows actionable retry guidance for failed jobs in human summary', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        status: 'failed',
        error: 'network timeout',
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
      }),
    );

    await logCommand('ab12', { summary: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('what: Last run failed.');
    expect(output).toContain('next: Run pilot unblock');
    expect(output).toContain('retry guidance: failed (failed)');
  });

  it('surfaces safe undo/no-step fallback state without transcript reads', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        status: 'completed',
        startedDirty: true,
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
      }),
    );
    mockGetJobSteps.mockReturnValue([]);

    await logCommand('ab12', { summary: true });

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('badge: undo:safe');
    expect(output).toContain('step: no step metadata recorded');
    expect(output).toContain('commit delta: changed');
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
