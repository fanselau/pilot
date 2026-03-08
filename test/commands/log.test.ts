import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStep } from '../../src/core/types.js';

const mockGetJob = vi.fn();
const mockGetQueue = vi.fn();
const mockGetJobSteps = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(...args),
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

import { logCommand } from '../../src/commands/log.js';

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
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
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

describe('logCommand --summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetQueue.mockReturnValue([]);
    mockGetJob.mockReturnValue(makeJob());
    mockGetJobSteps.mockReturnValue([]);
    mockFindSessionByTitle.mockReturnValue(null);
    mockGetSessionParts.mockReturnValue([]);
    mockGetChildSessions.mockReturnValue([]);
    mockGetSessionTokens.mockReturnValue({ input: 0, output: 0 });
    mockGetSessionTokensRecursive.mockReturnValue({ input: 0, output: 0, reasoning: 0 });
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
    expect(output).toContain('what: Last run failed but appears retryable.');
    expect(output).toContain('next: Run pilot retry ab12.');
  });

  it('surfaces guarded undo/no-step fallback state without transcript reads', async () => {
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
    expect(output).toContain('badge: undo:guarded-dirty-start');
    expect(output).toContain('step: no step metadata recorded');
    expect(output).toContain('commit delta: changed');
    expect(mockGetSessionParts).not.toHaveBeenCalled();
  });
});
