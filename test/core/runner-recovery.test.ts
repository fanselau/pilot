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
  dirty: boolean;
  baseCommit: string | null;
  headCommit: string | null;
}): void {
  let revParseCalls = 0;

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

    if (argv[0] === 'status' && argv[1] === '--porcelain=v1') {
      return execaResult(0, options.dirty ? ' M src/core/runner.ts' : '');
    }

    if (argv[0] === 'rev-parse' && argv.includes('--verify') && argv.includes('--quiet')) {
      revParseCalls += 1;
      const commit = revParseCalls === 1 ? options.baseCommit : options.headCommit;
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

  it('refuses dirty starts by default with actionable force-dirty guidance', async () => {
    mockRecoveryGit({
      worktree: true,
      dirty: true,
      baseCommit: 'base123',
      headCommit: 'head123',
    });

    await launchJob(makeJob({ allowDirtyStart: false }));

    expect(mocks.updateJobRecoveryStart).toHaveBeenCalledWith('ab12', 'base123', true);
    expect(mocks.delegate).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    const message = String(mocks.markFailed.mock.calls[0][1]);
    expect(message).toContain('What: launch was refused');
    expect(message).toContain('Why: worktree is dirty and clean-start safety is enabled');
    expect(message).toContain('Next: commit (`git commit`), stash (`git stash`), or discard');
    expect(message).toContain('--force-dirty');
    expect(message).toContain('faster start matters more than reliable undo/recovery checkpoints');
    expect(mocks.updateJobRecoveryHead).toHaveBeenCalledWith('ab12', 'head123');
    expect(mocks.updateJobRecoveryHead.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markFailed.mock.invocationCallOrder[0],
    );
  });

  it('allows dirty starts when allowDirtyStart=true and warns about weaker recovery', async () => {
    mockRecoveryGit({
      worktree: true,
      dirty: true,
      baseCommit: 'base-force',
      headCommit: 'head-force',
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await launchJob(makeJob({ allowDirtyStart: true }));

    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.updateJobRecoveryStart).toHaveBeenCalledWith('ab12', 'base-force', true);
    expect(mocks.updateJobRecoveryHead).toHaveBeenCalledWith('ab12', 'head-force');

    const stderrOutput = stderrSpy.mock.calls.map(call => String(call[0])).join(' ');
    expect(stderrOutput).toContain('--force-dirty');
    expect(stderrOutput).toContain('Recovery guarantees are weaker');
  });

  it('records base and head checkpoints around a clean successful launch', async () => {
    mockRecoveryGit({
      worktree: true,
      dirty: false,
      baseCommit: 'base-clean',
      headCommit: 'head-clean',
    });

    await launchJob(makeJob({ allowDirtyStart: false }));

    expect(mocks.updateJobRecoveryStart).toHaveBeenCalledWith('ab12', 'base-clean', false);
    expect(mocks.delegate).toHaveBeenCalledTimes(1);
    expect(mocks.updateJobRecoveryHead).toHaveBeenCalledWith('ab12', 'head-clean');
    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);

    expect(mocks.updateJobRecoveryStart.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.delegate.mock.invocationCallOrder[0],
    );
    expect(mocks.updateJobRecoveryHead.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markCompleted.mock.invocationCallOrder[0],
    );
  });

  it('does not crash when repos have no commits (null base/head checkpoints)', async () => {
    mockRecoveryGit({
      worktree: true,
      dirty: false,
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
      dirty: false,
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
      dirty: false,
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
