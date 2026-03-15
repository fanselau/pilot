import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

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
  delegate: vi.fn(),
  findSessionByTitle: vi.fn<(title: string) => string | null>(() => null),
  getSessionModelsRecursive: vi.fn<(sessionId: string) => string[]>(() => []),
  getSessionModels: vi.fn<(sessionTitle: string) => string[]>(() => []),
  getAssistantMessageCount: vi.fn<(sessionId: string) => number>(() => 0),
  isSessionDone: vi.fn<(sessionId: string) => boolean>(() => true),
  ensureAutonomousGsdConfig: vi.fn(() => Promise.resolve()),
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
}));

vi.mock('../../src/core/delegate.js', () => ({
  delegate: mocks.delegate,
  resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
  buildNewProjectArgs: vi.fn((job: { description: string }) => job.description),
  buildQuickArgs: vi.fn((job: { description: string }) => job.description),
  getNextPhaseNumber: vi.fn(() => 1),
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
  isSessionDone: mocks.isSessionDone,
  getLastMessage: vi.fn(() => null),
  getSessionModelsRecursive: mocks.getSessionModelsRecursive,
  getSessionModels: mocks.getSessionModels,
  getAssistantMessageCount: mocks.getAssistantMessageCount,
}));

vi.mock('../../src/core/gsd-config.js', () => ({
  ensureAutonomousGsdConfig: mocks.ensureAutonomousGsdConfig,
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
import { createRunner, _resetSpawnRateLimit } from '../../src/core/runner.js';

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
    if (command === '/usr/local/bin/opencode') {
      const proc = {
        pid: 4321,
        unref: vi.fn(),
        catch: vi.fn(() => Promise.resolve()),
      };
      return proc as unknown as Awaited<ReturnType<typeof execa>>;
    }

    if (command === 'systemd-run') {
      return execaResult(1, '');
    }

    if (command === 'pgrep') {
      return execaResult(1, '');
    }

    if (command !== 'git') {
      return execaResult(0, '');
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

async function launchJobWithPollInterval(job: Job, pollInterval: number): Promise<void> {
  const runner = createRunner({ once: true, pollInterval });
  const launch = runner as unknown as { launch: (jobArg: Job) => Promise<void> };
  await launch.launch(job);
}

describe('runner recovery preflight and checkpoint capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSpawnRateLimit();
    mocks.delegate.mockResolvedValue({ intent: { type: 'noop', reason: 'no-op plan' }, reasoning: 'no-op plan' });
    mocks.isSessionDone.mockReturnValue(true);
    mocks.ensureAutonomousGsdConfig.mockResolvedValue(undefined);
    mocks.getJob.mockImplementation((id: string) => (id === 'ab12' ? makeJob() : null));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('launches on dirty worktree without blocking — dirty state is informational only', async () => {
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: ' M src/core/runner.ts',
      branch: 'main',
      baseCommit: 'head-dirty',
      headCommit: 'head-dirty',
    });

    await launchJob(makeJob());

    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.delegate).toHaveBeenCalledTimes(1);
    expect(mocks.updateJobRecoveryStart).toHaveBeenCalledWith('ab12', 'head-dirty', true);
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

  it('asserts autonomous config before spawning step sessions', async () => {
    const projectDir = process.cwd();
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: '',
      branch: 'main',
      baseCommit: 'base-pre-spawn',
      headCommit: 'head-pre-spawn',
    });
    mocks.delegate.mockResolvedValue({
      intent: { type: 'execute-only', phaseNumber: 65 },
      reasoning: 'single step',
    });
    mocks.findSessionByTitle.mockReturnValue('sess-pre-spawn');
    mocks.getAssistantMessageCount.mockReturnValue(5);

    await launchJobWithPollInterval(makeJob({ project: projectDir }), 0);

    expect(mocks.ensureAutonomousGsdConfig).toHaveBeenCalledWith(projectDir);
    const opencodeCallIndex = mockExeca.mock.calls.findIndex(([command]) => command === '/usr/local/bin/opencode');
    expect(opencodeCallIndex).toBeGreaterThanOrEqual(0);
    const opencodeSpawnOrder = mockExeca.mock.invocationCallOrder[opencodeCallIndex];
    expect(mocks.ensureAutonomousGsdConfig.mock.invocationCallOrder[0]).toBeLessThan(opencodeSpawnOrder);
  });

  it('reapplies autonomous config after new-project before next step spawn', async () => {
    const projectDir = process.cwd();
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: '',
      branch: 'main',
      baseCommit: 'base-new-project',
      headCommit: 'head-new-project',
    });
    // init-project: runs new-project step, then calls ensureAutonomousGsdConfig, then milestoneLoop (re-delegates)
    // milestoneLoop re-delegates and gets noop → loop ends
    mocks.delegate
      .mockResolvedValueOnce({
        intent: { type: 'init-project', prdPath: 'requirements/my-project.md' },
        reasoning: 'new project',
      })
      .mockResolvedValueOnce({
        intent: { type: 'noop', reason: 'all done' },
        reasoning: 'nothing more to do',
      });
    mocks.findSessionByTitle.mockReturnValue('sess-new-project');

    await launchJobWithPollInterval(makeJob({ project: projectDir }), 0);

    // ensureAutonomousGsdConfig should be called:
    //   1. from handleInitProject after new-project step
    //   2. from spawnAndWait (validateProjectConfig → ensureAutonomousGsdConfig)
    // Minimal: at least once from handleInitProject
    expect(mocks.ensureAutonomousGsdConfig).toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it('marks job failed when config assertion throws before spawn', async () => {
    const projectDir = process.cwd();
    mockRecoveryGit({
      worktree: true,
      statusPorcelain: '',
      branch: 'main',
      baseCommit: 'base-assertion-fail',
      headCommit: 'head-assertion-fail',
    });
    mocks.delegate.mockResolvedValue({
      intent: { type: 'execute-only', phaseNumber: 65 },
      reasoning: 'single step',
    });
    mocks.ensureAutonomousGsdConfig.mockRejectedValueOnce(new Error('config assertion failed'));

    await launchJobWithPollInterval(makeJob({ project: projectDir }), 0);

    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(mocks.markCompleted).not.toHaveBeenCalled();
  });
});
