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

const mockExtractPhaseNumberFromStepArgs = vi.fn((args: string) => {
  const match = args.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
});
const mockFindExistingUiReview = vi.fn();

vi.mock('../../src/core/ui-review.js', () => ({
  extractPhaseNumberFromStepArgs: (args: string) => mockExtractPhaseNumberFromStepArgs(args),
  findExistingUiReview: (projectDir: string, phaseNumber: number) => mockFindExistingUiReview(projectDir, phaseNumber),
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
    runtimeSkillSnapshot: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '2222222222222222222222222222222222222222',
    notifyRoute: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 3,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
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
    mockFindExistingUiReview.mockReturnValue(null);

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
    expect(output).toContain('Attempt: Attempt 1');
    expect(output).toContain('Failure: n/a — Wait for terminal failure/cancel state or queue a new job.');
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
    expect(payload).toHaveProperty('retryLineage');
    expect(payload.triage).toMatchObject({
      providerProfile: 'balanced/hybrid',
      attempts: 1,
      checkpoints: {
        delta: 'changed',
      },
      retry: {
        code: 'not-applicable',
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
    expect(payload.retryLineage).toMatchObject({
      attempt: 1,
      display: 'Attempt 1',
      retryHint: null,
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
        code: 'not-applicable',
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

  it('renders runtime skills block in human output when a runtime patch was applied', async () => {
    mockGetJob.mockReturnValue(makeJob({
      runtimeSkillSnapshot: {
        categories: ['frontend'],
        selectedSkills: ['typescript', 'frontend-design'],
        invalidSkills: [],
        agentSkills: {
          'gsd-planner': ['/repo/.opencode/skill/typescript'],
          'gsd-executor': ['/repo/.opencode/skill/frontend-design'],
        },
        mergePolicy: 'append-user-then-pilot',
        applied: true,
        restoreStatus: 'restored',
        restoreError: null,
      },
    }));

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Runtime skills');
    expect(output).toContain('Categories: frontend');
    expect(output).toContain('Selected: typescript, frontend-design');
    expect(output).toContain('Agents: 2 mapped');
    expect(output).toContain('Restore: restored');
  });

  it('shows invalid runtime skills without dumping config blobs', async () => {
    mockGetJob.mockReturnValue(makeJob({
      runtimeSkillSnapshot: {
        categories: ['frontend'],
        selectedSkills: ['typescript'],
        invalidSkills: ['missing-skill'],
        agentSkills: {
          'gsd-planner': ['/repo/.opencode/skill/typescript'],
        },
        mergePolicy: 'append-user-then-pilot',
        applied: true,
        restoreStatus: 'pending',
        restoreError: null,
      },
    }));

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Skipped invalid: missing-skill');
    expect(output).not.toContain('/repo/.opencode/skill/typescript');
  });

  it('emits runtimeSkills in JSON mode', async () => {
    mockJsonMode = true;
    const runtimeSnapshot = {
      categories: ['frontend'],
      selectedSkills: ['typescript'],
      invalidSkills: [],
      agentSkills: {
        'gsd-planner': ['/repo/.opencode/skill/typescript'],
      },
      mergePolicy: 'append-user-then-pilot' as const,
      applied: true,
      restoreStatus: 'restored' as const,
      restoreError: null,
    };
    mockGetJob.mockReturnValue(makeJob({ runtimeSkillSnapshot: runtimeSnapshot }));

    await infoCommand('ab12', { json: true });

    const payload = mockOutputJson.mock.calls[0][0];
    expect(payload.runtimeSkills).toEqual(runtimeSnapshot);
  });

  it('keeps runtime skills output concise when no runtime patch was active', async () => {
    mockGetJob.mockReturnValue(makeJob({
      runtimeSkillSnapshot: {
        categories: [],
        selectedSkills: [],
        invalidSkills: [],
        agentSkills: {},
        mergePolicy: 'append-user-then-pilot',
        applied: false,
        restoreStatus: 'skipped',
        restoreError: null,
      },
    }));

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Runtime skills: none (no runtime agent_skills patch)');
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
    expect(output).toContain('What happened: Last run failed. Last failure: network timeout');
    expect(output).toContain('What next: Run pilot unblock');
    expect(output).toContain('Failure: failed');
    expect(output).toContain('Failure step: 2/2 execute-phase');
    expect(output).toContain('Failure reason: semantic-check: tests failed');
    expect(output).toContain('Completed before failure: 1/2');
    expect(output).toContain('Retry guidance: failed (failed)');
  });

  it('shows retry hint and attempt count for jobs', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        attempts: 2,
        retryHint: 'retry-resume: Resume from plan 03',
      }),
    );

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Attempt: Attempt 2');
    expect(output).toContain('Retry hint: retry-resume: Resume from plan 03');
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
    expect(output).toContain('Undo safety: undo:safe (undo-safe)');
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

  it('renders judge:gaps badge for partial verdict (mapped to gaps)', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        scope: 'phase',
        status: 'failed',
        judgeVerdict: JSON.stringify({
          verdict: 'partial',
          confidence: 55,
          reason: 'Plans 01-02 done, plan 03 incomplete',
          retryRecommendation: 'retry-resume',
          retryHint: 'Resume from plan 03',
        }),
      }),
    );

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('judge:gaps 55%');
  });

  it('shows structured verification routing details for phase review states', async () => {
    mockGetJob.mockReturnValue(
      makeJob({
        scope: 'phase',
        status: 'review_hold',
        resumeHint: 'Structured verification fallback: verification artifact unreadable',
        judgeVerdict: JSON.stringify({
          verdict: 'gaps_found',
          confidence: 48,
          reason: 'judge found open issues',
          verificationStatus: 'unavailable',
          actionableGapCount: 0,
          humanVerificationCount: 0,
          routingDecision: 'review-hold',
          routingReason: 'Structured verification unavailable: verification-artifact-unreadable',
          artifactPath: '/resolved/my-project/.planning/phases/87-routing/87-VERIFICATION.md',
        }),
      }),
    );

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Structured verification status: unavailable');
    expect(output).toContain('Actionable gaps remaining: 0');
    expect(output).toContain('Human verification checks remaining: 0');
    expect(output).toContain('Routing decision: review-hold');
    expect(output).toContain('Routing reason: Structured verification unavailable: verification-artifact-unreadable');
  });

  it('shows UI Review completed path when the advisory artifact exists', async () => {
    mockGetJob.mockReturnValue(makeJob({ scope: 'phase' }));
    mockFindExistingUiReview.mockReturnValue('/resolved/my-project/.planning/phases/98-ui-review-lifecycle/98-UI-REVIEW.md');
    mockGetJobSteps.mockReturnValue([
      {
        id: 1,
        jobId: 'ab12',
        stepIndex: 0,
        command: 'execute-phase',
        args: '98 --auto',
        sessionTitle: null,
        sessionId: null,
        status: 'completed',
        verdictSource: null,
        verdictReason: null,
        startedAt: '2026-03-07T00:01:00Z',
        completedAt: '2026-03-07T00:02:00Z',
        durationMs: 60_000,
      },
      {
        id: 2,
        jobId: 'ab12',
        stepIndex: 1,
        command: 'ui-review',
        args: '98',
        sessionTitle: null,
        sessionId: null,
        status: 'completed',
        verdictSource: null,
        verdictReason: null,
        startedAt: '2026-03-07T00:02:00Z',
        completedAt: '2026-03-07T00:03:00Z',
        durationMs: 60_000,
      },
    ]);

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('UI Review:');
    expect(output).toContain('completed - /resolved/my-project/.planning/phases/98-ui-review-lifecycle/98-UI-REVIEW.md');
  });

  it('shows skipped UI Review without turning the job into a failure', async () => {
    mockGetJob.mockReturnValue(makeJob({ scope: 'phase', status: 'completed' }));
    mockGetJobSteps.mockReturnValue([
      {
        id: 1,
        jobId: 'ab12',
        stepIndex: 0,
        command: 'execute-phase',
        args: '98 --auto',
        sessionTitle: null,
        sessionId: null,
        status: 'completed',
        verdictSource: null,
        verdictReason: null,
        startedAt: '2026-03-07T00:01:00Z',
        completedAt: '2026-03-07T00:02:00Z',
        durationMs: 60_000,
      },
      {
        id: 2,
        jobId: 'ab12',
        stepIndex: 1,
        command: 'ui-review',
        args: '98',
        sessionTitle: null,
        sessionId: null,
        status: 'skipped',
        verdictSource: null,
        verdictReason: null,
        startedAt: '2026-03-07T00:02:00Z',
        completedAt: '2026-03-07T00:03:00Z',
        durationMs: 60_000,
      },
    ]);

    await infoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('UI Review:');
    expect(output).toContain('skipped - advisory audit did not produce UI-REVIEW.md');
    expect(output).toContain('Outcome: job is not failed/cancelled');
  });
});
