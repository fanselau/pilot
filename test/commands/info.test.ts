import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStep, ModelEntry, JobObservabilitySnapshot } from '../../src/core/types.js';

const mockGetJob = vi.fn();
const mockGetJobSteps = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(...args),
}));

const mockResolveProjectDir = vi.fn((project: string) => `/resolved/${project}`);

vi.mock('../../src/core/config.js', () => ({
  resolveProjectDir: (project: string) => mockResolveProjectDir(project),
}));

const mockIsGitWorktree = vi.fn();
const mockIsWorktreeDirty = vi.fn();
const mockResolveCommitOrNull = vi.fn();
const mockClassifyHeadRelation = vi.fn();

vi.mock('../../src/core/git-recovery.js', () => ({
  isGitWorktree: (...args: unknown[]) => mockIsGitWorktree(...args),
  isWorktreeDirty: (...args: unknown[]) => mockIsWorktreeDirty(...args),
  resolveCommitOrNull: (...args: unknown[]) => mockResolveCommitOrNull(...args),
  classifyHeadRelation: (...args: unknown[]) => mockClassifyHeadRelation(...args),
}));

const mockFindSessionByTitle = vi.fn();
const mockGetSessionTokens = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  getSessionTokens: (...args: unknown[]) => mockGetSessionTokens(...args),
}));

const mockResolveAllAgentModels = vi.fn();

vi.mock('../../src/core/models.js', () => ({
  resolveAllAgentModels: (...args: unknown[]) => mockResolveAllAgentModels(...args),
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
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
}));

import { infoCommand } from '../../src/commands/info.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'my-project',
    scope: 'quick',
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
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '2222222222222222222222222222222222222222',
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

const emptySteps: JobStep[] = [];
const resolvedModels: Record<string, ModelEntry> = {
  'gsd-executor': { model: 'anthropic/claude-sonnet-4-20250514' },
  'gsd-orchestrator': { model: 'anthropic/claude-opus-4-6' },
};

function makeObservability(overrides: Partial<JobObservabilitySnapshot> = {}): JobObservabilitySnapshot {
  return {
    jobId: 'ab12',
    jobStatus: 'completed',
    terminal: true,
    requested: {
      modelProfile: 'balanced',
      providerMode: 'hybrid',
      scope: 'quick',
      intendedExecutorModel: 'anthropic/claude-sonnet-4-20250514',
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
        input: 10_000,
        output: 2_500,
        reasoning: 1_000,
        cacheRead: 500,
        cacheWrite: 200,
        total: 14_200,
      },
      byModel: {
        'anthropic/claude-sonnet-4-6': {
          input: 10_000,
          output: 2_500,
          reasoning: 1_000,
          cacheRead: 500,
          cacheWrite: 200,
          total: 14_200,
        },
      },
      notes: [],
    },
    cost: {
      status: 'partial',
      currency: 'USD',
      estimatedUsd: 0.0725,
      byModel: [],
      notes: ['Reasoning tokens are present but excluded from estimate.'],
    },
    ...overrides,
  };
}

describe('infoCommand recovery visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetJob.mockReturnValue(makeJob());
    mockGetJobSteps.mockReturnValue(emptySteps);

    mockFindSessionByTitle.mockReturnValue(null);
    mockGetSessionTokens.mockReturnValue({ input: 0, output: 0 });

    mockResolveAllAgentModels.mockReturnValue(resolvedModels);
    mockBuildJobObservability.mockReturnValue(makeObservability());
    mockIsGitWorktree.mockResolvedValue(true);
    mockIsWorktreeDirty.mockResolvedValue(false);
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockResolveCommitOrNull.mockImplementation((_cwd: string, rev: string) => {
      if (rev === 'HEAD') return Promise.resolve('3333333333333333333333333333333333333333');
      if (rev === '1111111111111111111111111111111111111111') {
        return Promise.resolve('1111111111111111111111111111111111111111');
      }
      if (rev === '2222222222222222222222222222222222222222') {
        return Promise.resolve('2222222222222222222222222222222222222222');
      }
      return Promise.resolve(null);
    });
  });

  it('renders compact triage block before deep recovery details', async () => {
    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Triage');
    expect(output).toContain('What this is: quick job in my-project: test job');
    expect(output).toContain('What happened: Undo checkpoints look compatible.');
    expect(output).toContain('What next: Run pilot undo ab12 --dry-run to preview rollback.');
    expect(output).toContain('Run profile: balanced/hybrid · attempts 1');
    expect(output).toContain('Retryability: retry-unavailable (retry-unavailable)');
    expect(output).toContain('Undo safety: undo:safe (undo-safe)');
    expect(output).toContain('Recovery');
    expect(output).toContain('undo:safe');
    expect(output).toContain('Base:');
    expect(output).toContain('111111111111');
    expect(output).toContain('Head:');
    expect(output).toContain('222222222222');
    expect(output).toContain('Guidance:');
    expect(output).toContain('pilot undo <id> --dry-run');
    expect(output).toContain('Observability');
    expect(output).toContain('Requested lane/profile: balanced/hybrid (quick)');
    expect(output).toContain('Observed models (available): anthropic/claude-sonnet-4-6');
    expect(output).toContain('Tokens (available): input 10.0k · output 2.5k · reasoning 1.0k');
    expect(output).toContain('Estimated cost (USD): ~$0.0725 (partial)');
    expect(output).toContain('Cost note: Reasoning tokens are present but excluded from estimate.');
    expect(output).toContain('Failure Insight');
    expect(output).toContain('Outcome: job is not failed/cancelled');
  });

  it('returns triage+recovery objects in JSON output with newer-work guard state', async () => {
    mockJsonMode = true;
    mockClassifyHeadRelation.mockResolvedValue('newer-work-exists');

    await infoCommand('ab12', { json: true });

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const payload = mockOutputJson.mock.calls[0][0];
    expect(payload).toHaveProperty('job');
    expect(payload).toHaveProperty('steps');
    expect(payload).toHaveProperty('sessions');
    expect(payload).toHaveProperty('tokenUsage');
    expect(payload).toHaveProperty('observability');
    expect(payload).toHaveProperty('failureContext');
    expect(payload).toHaveProperty('triage');
    expect(payload).toHaveProperty('recovery');
    expect(payload.triage).toMatchObject({
      providerProfile: 'balanced/hybrid',
      attempts: 1,
      checkpoints: {
        delta: 'changed',
      },
      retry: {
        code: 'retry-unavailable',
      },
      undo: {
        code: 'undo-safe',
      },
    });
    expect(payload.recovery).toMatchObject({
      state: 'guarded',
      tag: 'undo:guarded-newer-work',
      relation: 'newer-work-exists',
      blockedByNewerWork: true,
    });
    expect(payload.recovery.guidance).toContain('Undo blocked by newer work');
    expect(payload.observability).toMatchObject({
      observed: {
        status: 'available',
      },
      tokens: {
        status: 'available',
      },
      cost: {
        status: 'partial',
      },
    });
    expect(payload.failureContext).toMatchObject({
      failed: false,
      commitDelta: 'changed',
      retry: {
        code: 'retry-unavailable',
      },
    });
    expect(payload.tokenUsage).toMatchObject({
      totalInput: 10_000,
      totalOutput: 2_500,
      total: 14_200,
      estimatedCostUsd: 0.0725,
    });
  });

  it('marks recovery unavailable when checkpoint metadata is missing', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: null, gitHeadCommit: null }));

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('undo:unavailable');
    expect(output).toContain('no recorded base/head checkpoints');
  });

  it('shows actionable retry guidance for failed jobs in triage block', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        status: 'failed',
        error: 'network timeout',
      }),
    );
    mockGetJobSteps.mockReturnValue([
      {
        id: 1,
        jobId: 'ab12',
        stepIndex: 0,
        command: 'plan-phase',
        args: '45',
        sessionTitle: null,
        sessionId: null,
        status: 'completed',
        verdictSource: 'semantic-check',
        verdictReason: 'build passed',
        startedAt: '2026-03-07T00:01:00Z',
        completedAt: '2026-03-07T00:02:00Z',
        durationMs: 60_000,
      },
      {
        id: 2,
        jobId: 'ab12',
        stepIndex: 1,
        command: 'execute-phase',
        args: '45',
        sessionTitle: null,
        sessionId: null,
        status: 'failed',
        verdictSource: 'semantic-check',
        verdictReason: 'tests failed',
        startedAt: '2026-03-07T00:02:00Z',
        completedAt: '2026-03-07T00:03:00Z',
        durationMs: 60_000,
      },
    ]);

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('What happened: Last run failed but appears retryable. Last failure: network timeout');
    expect(output).toContain('What next: Run pilot retry ab12.');
    expect(output).toContain('Retryability: retryable (retryable-failure)');
    expect(output).toContain('Failure step: 2/2 execute-phase');
    expect(output).toContain('Failure reason: semantic-check: tests failed');
    expect(output).toContain('Completed before failure: 1/2');
    expect(output).toContain('Retry guidance: retryable (retryable-failure) — Run pilot retry ab12.');
  });

  it('shows no-op and guarded undo states in triage summary context', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        status: 'completed',
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '1111111111111111111111111111111111111111',
        startedDirty: true,
      }),
    );

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('What happened: Job produced no commit delta.');
    expect(output).toContain('Checkpoints: 111111111111');
    expect(output).toContain('(no-op)');
    expect(output).toContain('Undo safety: undo:guarded-dirty-start (undo-guarded-dirty-start)');
    expect(output).toContain('Current/final step: no recorded step metadata');
  });

  it('renders Verdict line with shared judge badge semantics and reason text', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        scope: 'phase',
        status: 'completed',
        judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 92, reason: 'all checks passed' }),
      }),
    );

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Verdict:');
    expect(output).toContain('judge:pass 92% — all checks passed');
  });

  it('falls back to summary and marks confidence-0 verdicts inconclusive', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        scope: 'phase',
        status: 'completed',
        judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 88, summary: 'legacy summary' }),
      }),
    );

    await infoCommand('ab12', {});

    const summaryOutput = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(summaryOutput).toContain('judge:pass 88% — legacy summary');

    mockOutputHuman.mockClear();
    mockGetJob.mockReturnValue(
      makeJob({
        scope: 'phase',
        status: 'completed',
        judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 0 }),
      }),
    );

    await infoCommand('ab12', {});

    const inconclusiveOutput = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(inconclusiveOutput).toContain('judge:inconclusive — benefit of doubt');
  });
});
