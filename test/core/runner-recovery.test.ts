import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job, ProjectDirtyBaseline } from '../../src/core/types.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  markStale: vi.fn(),
  cancel: vi.fn(),
  updateDelegationPlan: vi.fn(),
  advanceStep: vi.fn(),
  getJob: vi.fn<(id: string) => Job | null>(() => null),
  updateSessionTitles: vi.fn(),
  recordStep: vi.fn(() => 1),
  completeStep: vi.fn(),
  skipRemainingSteps: vi.fn(),
  claimNextLaunchable: vi.fn(() => null),
  getAllRunningJobs: vi.fn(() => []),
  getRunningJobsForProject: vi.fn(() => []),
  resetToPending: vi.fn(),
  updateJudgeVerdict: vi.fn(),
  updateActualModels: vi.fn(),
  getProject: vi.fn(() => ({
    path: '/repo',
    owner: null,
    status: 'active',
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-07T00:00:00Z',
  })),
  updateJobRecoveryStart: vi.fn(),
  updateJobRecoveryHead: vi.fn(),
  getLatestProjectDirtyBaseline: vi.fn<(project: string) => ProjectDirtyBaseline | null>(() => null),
  upsertProjectDirtyBaseline: vi.fn<(baseline: ProjectDirtyBaseline) => void>(),
  delegate: vi.fn(),
  findSessionByTitle: vi.fn<(title: string) => string | null>(() => null),
  getSessionModelsRecursive: vi.fn<(sessionId: string) => string[]>(() => []),
  getSessionModels: vi.fn<(sessionTitle: string) => string[]>(() => []),
  getAssistantMessageCount: vi.fn<(sessionId: string) => number>(() => 0),
}));

vi.mock('../../src/core/db.js', () => ({
  markCompleted: mocks.markCompleted,
  markFailed: mocks.markFailed,
  markStale: mocks.markStale,
  cancel: mocks.cancel,
  updateDelegationPlan: mocks.updateDelegationPlan,
  advanceStep: mocks.advanceStep,
  getJob: mocks.getJob,
  updateSessionTitles: mocks.updateSessionTitles,
  recordStep: mocks.recordStep,
  completeStep: mocks.completeStep,
  skipRemainingSteps: mocks.skipRemainingSteps,
  claimNextLaunchable: mocks.claimNextLaunchable,
  getAllRunningJobs: mocks.getAllRunningJobs,
  getRunningJobsForProject: mocks.getRunningJobsForProject,
  resetToPending: mocks.resetToPending,
  updateJudgeVerdict: mocks.updateJudgeVerdict,
  updateActualModels: mocks.updateActualModels,
  getProject: mocks.getProject,
  updateJobRecoveryStart: mocks.updateJobRecoveryStart,
  updateJobRecoveryHead: mocks.updateJobRecoveryHead,
  getLatestProjectDirtyBaseline: mocks.getLatestProjectDirtyBaseline,
  upsertProjectDirtyBaseline: mocks.upsertProjectDirtyBaseline,
}));

vi.mock('../../src/core/delegate.js', () => ({
  delegate: mocks.delegate,
  resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
}));

vi.mock('../../src/core/skills.js', () => ({
  resolveSkillsForJob: vi.fn(() => []),
  injectSkills: vi.fn(() => []),
  cleanupInjectedSkills: vi.fn(),
}));

vi.mock('../../src/core/callback.js', () => ({
  notifyJobCompletion: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: mocks.findSessionByTitle,
  exportSessionFromDb: vi.fn(() => ({ messages: [] })),
  isSessionDone: vi.fn(() => false),
  getLastMessage: vi.fn(() => null),
  getSessionModelsRecursive: mocks.getSessionModelsRecursive,
  getSessionModels: mocks.getSessionModels,
  getAssistantMessageCount: mocks.getAssistantMessageCount,
}));

vi.mock('../../src/core/models.js', () => ({
  patchAgentFrontmatter: vi.fn(),
  resolveAllAgentModels: vi.fn(() => ({})),
  resolveTopLevelModel: vi.fn(() => ({ model: 'claude-sonnet-4-5' })),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    pilotDir: '/tmp/.pilot',
    pilotDbPath: '/tmp/.pilot/pilot.db',
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/pilot-gsd',
    maxParallel: 1,
    sessionMemoryMaxMb: 8192,
    reservedMemoryMb: 4096,
    memoryKillThresholdMb: 2048,
    logLevel: 'INFO',
    noColor: false,
  })),
  resolveProjectDir: vi.fn((project: string) => project),
  getConfigFileDefaults: vi.fn(() => ({
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    scope: null,
  })),
}));

import { execa } from 'execa';
import { createRunner } from '../../src/core/runner.js';

const mockExeca = vi.mocked(execa);

function execaResult(exitCode: number, stdout: string = ''): Awaited<ReturnType<typeof execa>> {
  return { exitCode, stdout } as unknown as Awaited<ReturnType<typeof execa>>;
}

function mockRecoveryGit(options: {
  worktree: boolean;
  statusPorcelain: string | string[];
  branch: string | null;
  baseCommit: string | null;
  headCommit: string | null;
  conflictRefs?: string[];
  unmerged?: boolean;
}): void {
  let headResolveCalls = 0;
  let statusCalls = 0;
  const conflictRefs = new Set(options.conflictRefs ?? []);

  mockExeca.mockImplementation(((
    command: string,
    args: string[],
  ) => {
    if (command !== 'git') {
      throw new Error(`Unexpected command: ${command}`);
    }

    const argv = args;

    if (argv[0] === 'rev-parse' && argv[1] === '--is-inside-work-tree') {
      return execaResult(options.worktree ? 0 : 1, options.worktree ? 'true' : 'false');
    }

    if (argv[0] === 'branch' && argv[1] === '--show-current') {
      return execaResult(0, options.branch ? `${options.branch}\n` : '');
    }

    if (argv[0] === 'status' && argv[1] === '--porcelain=v1') {
      if (Array.isArray(options.statusPorcelain)) {
        const next = options.statusPorcelain[Math.min(statusCalls, options.statusPorcelain.length - 1)] ?? '';
        statusCalls += 1;
        return execaResult(0, next);
      }
      return execaResult(0, options.statusPorcelain);
    }

    if (argv[0] === 'rev-parse' && argv.includes('--verify') && argv.includes('--quiet')) {
      const target = argv[argv.length - 1];
      if (target === 'HEAD^{commit}') {
        headResolveCalls += 1;
        const commit = headResolveCalls === 1 ? options.baseCommit : options.headCommit;
        if (commit === null) {
          return execaResult(1, '');
        }
        return execaResult(0, `${commit}\n`);
      }

      if (conflictRefs.has(target)) {
        return execaResult(0, 'present');
      }

      return execaResult(1, '');
    }

    if (argv[0] === 'rev-parse' && argv[1] === '--git-path') {
      return execaResult(0, `/repo/.git/${argv[2]}`);
    }

    if (argv[0] === 'ls-files' && argv[1] === '--unmerged') {
      return execaResult(0, options.unmerged ? '100644 abc 1\tfile.ts' : '');
    }

    if (argv[0] === 'config') {
      return execaResult(0, '');
    }

    if (argv[0] === 'diff') {
      return execaResult(0, '');
    }

    if (argv[0] === 'merge-base') {
      return execaResult(1, '');
    }

    if (argv[0] === '-C') {
      return execaResult(0, '');
    }

    if (argv[0] === 'ls-files') {
      return execaResult(0, '');
    }

    if (argv[0] === 'rev-parse' && argv[1] === '--git-path') {
      return execaResult(0, `/repo/.git/${argv[2]}`);
    }

    if (argv[0] === 'rev-parse' && argv[1] === '--verify') {
      const commit = options.headCommit;
      if (commit === null) {
        return execaResult(1, '');
      }
      return execaResult(0, `${commit}\n`);
    }

    throw new Error(`Unexpected git args: ${argv.join(' ')}`);
  }) as unknown as Parameters<typeof mockExeca.mockImplementation>[0]);
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: '/repo',
    scope: 'quick',
    description: 'test job',
    requirementPath: null,
    status: 'running',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-07T00:00:00Z',
    startedAt: '2026-03-07T00:01:00Z',
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
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
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

async function launchJob(job: Job): Promise<void> {
  const runner = createRunner({ once: true, pollInterval: 1 });
  const launch = runner as unknown as { launch: (jobArg: Job) => Promise<void> };
  await launch.launch(job);
}

describe('runner recovery preflight and checkpoint capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.delegate.mockResolvedValue({ steps: [], reasoning: 'no-op plan' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows same-project continuation when dirty state matches prior Pilot baseline', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts',
      branch: 'main',
      baseCommit: 'head-safe',
      headCommit: 'head-safe',
    });
    mocks.getLatestProjectDirtyBaseline.mockReturnValue({
      project: '/repo',
      branch: 'main',
      headCommit: 'head-safe',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'prev1',
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await launchJob(makeJob());

    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.delegate).toHaveBeenCalledTimes(1);
    expect(mocks.updateJobRecoveryStart).toHaveBeenCalledWith('ab12', 'head-safe', true);
    expect(mocks.upsertProjectDirtyBaseline).toHaveBeenCalledWith(expect.objectContaining({
      project: '/repo',
      branch: 'main',
      headCommit: 'head-safe',
      statusPorcelain: ' M src/core/runner.ts',
      jobId: 'ab12',
    }));
    const stderrOutput = stderrSpy.mock.calls.map(call => String(call[0])).join(' ');
    expect(stderrOutput).toContain('allowed: continuation-safe dirty tree matches prior Pilot baseline');
  });

  it('blocks when manual tracked edits appear after the baseline snapshot', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts',
      branch: 'main',
      baseCommit: 'head-manual',
      headCommit: 'head-manual',
    });
    mocks.getLatestProjectDirtyBaseline.mockReturnValue({
      project: '/repo',
      branch: 'main',
      headCommit: 'head-manual',
      statusPorcelain: ' M src/core/db.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'prev2',
    });

    await launchJob(makeJob());

    expect(mocks.delegate).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(String(mocks.markFailed.mock.calls[0][1])).toContain(
      'blocked: manual/untracked changes not attributable to Pilot',
    );
    expect(mocks.upsertProjectDirtyBaseline).not.toHaveBeenCalled();
  });

  it('blocks when new unrelated untracked files appear', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts\n?? scratch.txt',
      branch: 'main',
      baseCommit: 'head-untracked',
      headCommit: 'head-untracked',
    });
    mocks.getLatestProjectDirtyBaseline.mockReturnValue({
      project: '/repo',
      branch: 'main',
      headCommit: 'head-untracked',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'prev3',
    });

    await launchJob(makeJob());

    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(String(mocks.markFailed.mock.calls[0][1])).toContain(
      'blocked: manual/untracked changes not attributable to Pilot',
    );
  });

  it('blocks when branch/head drift from the Pilot baseline', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts',
      branch: 'feature/drift',
      baseCommit: 'head-new',
      headCommit: 'head-new',
    });
    mocks.getLatestProjectDirtyBaseline.mockReturnValue({
      project: '/repo',
      branch: 'main',
      headCommit: 'head-old',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'prev4',
    });

    await launchJob(makeJob());

    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(String(mocks.markFailed.mock.calls[0][1])).toContain('blocked: HEAD moved outside Pilot');
  });

  it('blocks launch on merge/rebase/conflict state', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts',
      branch: 'main',
      baseCommit: 'head-conflict',
      headCommit: 'head-conflict',
      conflictRefs: ['MERGE_HEAD'],
    });

    await launchJob(makeJob());

    expect(mocks.delegate).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(String(mocks.markFailed.mock.calls[0][1])).toContain(
      'blocked: merge/rebase/conflict state detected',
    );
  });

  it('allows retry launch after Pilot records dirty completion baseline', async () => {
    let baselineState: {
      project: string;
      branch: string | null;
      headCommit: string | null;
      statusPorcelain: string;
      recordedAt: string;
      jobId: string;
    } | null = null;

    mocks.getLatestProjectDirtyBaseline.mockImplementation(() => baselineState);
    mocks.upsertProjectDirtyBaseline.mockImplementation((baseline) => {
      baselineState = baseline;
    });

    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ['', ' M src/core/runner.ts'],
      branch: 'main',
      baseCommit: 'head-retry',
      headCommit: 'head-retry',
    });

    await launchJob(makeJob());

    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(baselineState).not.toBeNull();
    expect(baselineState!.statusPorcelain).toBe(' M src/core/runner.ts');

    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts',
      branch: 'main',
      baseCommit: 'head-retry',
      headCommit: 'head-retry',
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await launchJob(makeJob());

    expect(mocks.markCompleted).toHaveBeenCalledTimes(2);
    expect(mocks.markFailed).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map(call => String(call[0])).join(' ');
    expect(stderrOutput).toContain('allowed: continuation-safe dirty tree matches prior Pilot baseline');
  });

  it('does not crash when repos have no commits (null base/head checkpoints)', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: '',
      branch: 'main',
      baseCommit: null,
      headCommit: null,
    });

    await expect(launchJob(makeJob())).resolves.toBeUndefined();

    expect(mocks.updateJobRecoveryStart).toHaveBeenCalledWith('ab12', null, false);
    expect(mocks.updateJobRecoveryHead).toHaveBeenCalledWith('ab12', null);
    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it('persists recursive normalized actual models before marking job completed', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: '',
      branch: 'main',
      baseCommit: 'base-models',
      headCommit: 'head-models',
    });

    mocks.getJob.mockImplementation((id: string) => {
      if (id !== 'ab12') return null;
      return makeJob({
        sessionTitles: JSON.stringify(['root-session', 'child-session']),
      });
    });

    mocks.findSessionByTitle.mockImplementation((title: string) => {
      if (title === 'root-session') return 'sess-root';
      if (title === 'child-session') return 'sess-child';
      return null;
    });

    mocks.getSessionModelsRecursive.mockImplementation((sessionId: string) => {
      if (sessionId === 'sess-root') {
        return ['OpenAI/GPT-5.4', 'anthropic/claude-sonnet-4-6'];
      }
      if (sessionId === 'sess-child') {
        return ['openai/gpt-5.4', ' anthropic/claude-sonnet-4-6 '];
      }
      return [];
    });

    await launchJob(makeJob());

    expect(mocks.updateActualModels).toHaveBeenCalledWith('ab12', [
      'anthropic/claude-sonnet-4-6',
      'openai/gpt-5.4',
    ]);
    expect(mocks.updateActualModels.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markCompleted.mock.invocationCallOrder[0],
    );
  });

  it('keeps completion best-effort when recursive actual-model lookup fails', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: '',
      branch: 'main',
      baseCommit: 'base-fail-safe',
      headCommit: 'head-fail-safe',
    });

    mocks.getJob.mockImplementation((id: string) => {
      if (id !== 'ab12') return null;
      return makeJob({ sessionTitles: JSON.stringify(['root-session']) });
    });

    mocks.findSessionByTitle.mockReturnValue('sess-root');
    mocks.getSessionModelsRecursive.mockImplementation(() => {
      throw new Error('opencode db read failed');
    });

    await expect(launchJob(makeJob())).resolves.toBeUndefined();

    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });
});
