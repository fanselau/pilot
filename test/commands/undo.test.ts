import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../../src/core/types.js';

const mockGetJob = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveProjectDir: (project: string) => project,
}));

const mockIsGitWorktree = vi.fn();
const mockIsWorktreeDirty = vi.fn();
const mockResolveCommitOrNull = vi.fn();
const mockClassifyHeadRelation = vi.fn();
const mockListChangedFiles = vi.fn();

vi.mock('../../src/core/git-recovery.js', () => ({
  isGitWorktree: (...args: unknown[]) => mockIsGitWorktree(...args),
  isWorktreeDirty: (...args: unknown[]) => mockIsWorktreeDirty(...args),
  resolveCommitOrNull: (...args: unknown[]) => mockResolveCommitOrNull(...args),
  classifyHeadRelation: (...args: unknown[]) => mockClassifyHeadRelation(...args),
  listChangedFiles: (...args: unknown[]) => mockListChangedFiles(...args),
}));

const mockExeca = vi.fn();

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
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
  dim: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
}));

import { undoCommand } from '../../src/commands/undo.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: '/repo',
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
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: 'base123',
    gitHeadCommit: 'head123',
    allowDirtyStart: false,
    startedDirty: false,
    ...overrides,
  };
}

describe('undoCommand', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;
    mockIsGitWorktree.mockResolvedValue(true);
    mockIsWorktreeDirty.mockResolvedValue(false);

    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit:${code}`);
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function mockResolvedCommits(options?: {
    current?: string;
    base?: string;
    head?: string;
  }): void {
    mockResolveCommitOrNull
      .mockResolvedValueOnce(options?.current ?? 'current123')
      .mockResolvedValueOnce(options?.base ?? 'base123')
      .mockResolvedValueOnce(options?.head ?? 'head123');
  }

  async function expectRefusal(
    run: Promise<void>,
    contains: string,
    code: 1 | 2 = 2,
  ): Promise<void> {
    await expect(run).rejects.toThrow(`exit:${code}`);
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
    expect(stderr).toContain(contains);
  }

  it('returns nothing-to-undo when job has no commit delta', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'same123', gitHeadCommit: 'same123' }));
    mockResolveCommitOrNull.mockResolvedValue('same123');

    await undoCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Nothing to undo');
    expect(mockExeca).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('returns JSON for nothing-to-undo branch', async () => {
    mockJsonMode = true;
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'same123', gitHeadCommit: 'same123' }));
    mockResolveCommitOrNull.mockResolvedValue('same123');

    await undoCommand('ab12', {});

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    expect(mockOutputJson).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ab12',
      outcome: 'nothing-to-undo',
      dryRun: false,
    }));
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('resets to recorded base commit on safe path', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await undoCommand('ab12', {});

    expect(mockExeca).toHaveBeenCalledWith(
      'git',
      ['reset', '--hard', 'base123'],
      { cwd: '/repo', reject: false },
    );
    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Undid job ab12');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('returns JSON for successful reset path', async () => {
    mockJsonMode = true;
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await undoCommand('ab12', {});

    expect(mockOutputJson).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ab12',
      outcome: 'reset-complete',
      resetTo: 'base123',
      previousHead: 'current123',
    }));
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('refuses newer-work history rewinds without --force', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current999', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('newer-work-exists');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);

    await expectRefusal(undoCommand('ab12', {}), 'newer commits exist');
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
    expect(stderr).toContain('What: undo was blocked');
    expect(stderr).toContain('Why: newer commits exist after this job checkpoint');
    expect(stderr).toContain('Next: undo newer jobs for this project first');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('refuses diverged history rewinds without --force and provides guidance', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current999', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('diverged');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);

    await expectRefusal(undoCommand('ab12', {}), 'current HEAD diverged from this job checkpoint');
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
    expect(stderr).toContain('What: undo was blocked');
    expect(stderr).toContain('Why: current HEAD diverged from this job checkpoint');
    expect(stderr).toContain('Next: inspect history (`git log --oneline --graph --decorate -20`)');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('supports force override for newer-work history guard', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current999', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('newer-work-exists');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await undoCommand('ab12', { force: true });

    expect(mockExeca).toHaveBeenCalledWith(
      'git',
      ['reset', '--hard', 'base123'],
      { cwd: '/repo', reject: false },
    );
    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('Force override enabled');
  });

  it('shows dry-run preview and never mutates git state', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/core/runner.ts']);

    await undoCommand('ab12', { dryRun: true });

    expect(mockExeca).not.toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('[dry-run]');
    expect(output).toContain('would run: git reset --hard base123');
    expect(output).toContain('src/core/runner.ts');
  });

  it('returns JSON dry-run preview with relation context', async () => {
    mockJsonMode = true;
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'base123', gitHeadCommit: 'head123' }));
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/core/runner.ts']);

    await undoCommand('ab12', { dryRun: true });

    expect(mockOutputJson).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ab12',
      outcome: 'preview',
      relation: 'exact',
      wouldResetTo: 'base123',
      filesChanged: ['src/core/runner.ts'],
    }));
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('refuses dirty-start jobs by default', async () => {
    mockGetJob.mockReturnValue(makeJob({ startedDirty: true }));
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);

    await expectRefusal(undoCommand('ab12', {}), 'job started from a dirty worktree');
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
    expect(stderr).toContain('What: undo was blocked');
    expect(stderr).toContain('Why: this job started from a dirty worktree');
    expect(stderr).toContain('Next: review local edits from that run');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('allows dirty-start jobs with --force override', async () => {
    mockGetJob.mockReturnValue(makeJob({ startedDirty: true }));
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    await undoCommand('ab12', { force: true });

    expect(mockExeca).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('started dirty');
  });

  it('fails clearly when checkpoint commits cannot be resolved', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: 'missing-base', gitHeadCommit: 'head123' }));
    mockResolveCommitOrNull
      .mockResolvedValueOnce('current123')
      .mockResolvedValueOnce(null);

    await expectRefusal(undoCommand('ab12', {}), 'cannot resolve stored base checkpoint');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('refuses jobs missing checkpoint metadata', async () => {
    mockGetJob.mockReturnValue(makeJob({ gitBaseCommit: null, gitHeadCommit: null }));

    await expectRefusal(undoCommand('ab12', {}), 'missing recovery checkpoints');
    expect(mockResolveCommitOrNull).not.toHaveBeenCalled();
  });

  it('refuses destructive undo on dirty worktree even with --force', async () => {
    mockGetJob.mockReturnValue(makeJob());
    mockResolvedCommits({ current: 'current123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('exact');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);
    mockIsWorktreeDirty.mockResolvedValue(true);

    await expectRefusal(undoCommand('ab12', { force: true }), 'worktree is currently dirty');
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
    expect(stderr).toContain('What: undo was refused');
    expect(stderr).toContain('Why: worktree is currently dirty');
    expect(stderr).toContain('Next: commit (`git commit`), stash (`git stash`), or discard local changes');
    expect(stderr).toContain('--force does not bypass this guard');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('returns already-at-base idempotent outcome without reset', async () => {
    mockJsonMode = true;
    mockGetJob.mockReturnValue(makeJob());
    mockResolvedCommits({ current: 'base123', base: 'base123', head: 'head123' });
    mockClassifyHeadRelation.mockResolvedValue('already-behind-checkpoint');
    mockListChangedFiles.mockResolvedValue(['src/index.ts']);

    await undoCommand('ab12', {});

    expect(mockExeca).not.toHaveBeenCalled();
    expect(mockOutputJson).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ab12',
      outcome: 'already-at-base',
      baseCommit: 'base123',
    }));
  });

  it('exits 1 when job is not found', async () => {
    mockGetJob.mockReturnValue(null);

    await expectRefusal(undoCommand('ab12', {}), 'Job not found', 1);
  });
});
