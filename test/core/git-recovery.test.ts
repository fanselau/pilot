import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import {
  isGitWorktree,
  isWorktreeDirty,
  resolveCommitOrNull,
  classifyHeadRelation,
  listChangedFiles,
} from '../../src/core/git-recovery.js';

const mockExeca = vi.mocked(execa);

function gitResult(exitCode: number, stdout: string = ''): Awaited<ReturnType<typeof execa>> {
  return { exitCode, stdout } as unknown as Awaited<ReturnType<typeof execa>>;
}

describe('git-recovery helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects git worktrees via rev-parse exit code', async () => {
    mockExeca.mockResolvedValueOnce(gitResult(0, 'true'));
    await expect(isGitWorktree('/repo')).resolves.toBe(true);

    mockExeca.mockResolvedValueOnce(gitResult(1, ''));
    await expect(isGitWorktree('/repo')).resolves.toBe(false);
  });

  it('marks worktree dirty when porcelain output has entries', async () => {
    mockExeca.mockResolvedValueOnce(gitResult(0, ' M src/core/runner.ts'));
    await expect(isWorktreeDirty('/repo')).resolves.toBe(true);

    mockExeca.mockResolvedValueOnce(gitResult(0, '?? new-file.ts'));
    await expect(isWorktreeDirty('/repo')).resolves.toBe(true);

    mockExeca.mockResolvedValueOnce(gitResult(0, ''));
    await expect(isWorktreeDirty('/repo')).resolves.toBe(false);
  });

  it('returns null for unresolvable commits, including no-commit repos', async () => {
    mockExeca.mockResolvedValueOnce(gitResult(0, 'abc123\n'));
    await expect(resolveCommitOrNull('/repo')).resolves.toBe('abc123');

    mockExeca.mockResolvedValueOnce(gitResult(1, ''));
    await expect(resolveCommitOrNull('/repo')).resolves.toBeNull();

    expect(mockExeca).toHaveBeenNthCalledWith(
      1,
      'git',
      ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'],
      { cwd: '/repo', reject: false },
    );
  });

  it('classifies head relation from merge-base exit codes', async () => {
    await expect(classifyHeadRelation('/repo', 'abc', 'abc')).resolves.toBe('exact');

    mockExeca.mockResolvedValueOnce(gitResult(0, ''));
    await expect(classifyHeadRelation('/repo', 'base', 'head')).resolves.toBe('newer-work-exists');

    mockExeca.mockResolvedValueOnce(gitResult(1, ''));
    mockExeca.mockResolvedValueOnce(gitResult(0, ''));
    await expect(classifyHeadRelation('/repo', 'checkpoint', 'current')).resolves.toBe('already-behind-checkpoint');

    mockExeca.mockResolvedValueOnce(gitResult(1, ''));
    mockExeca.mockResolvedValueOnce(gitResult(1, ''));
    await expect(classifyHeadRelation('/repo', 'left', 'right')).resolves.toBe('diverged');
  });

  it('parses changed file paths from git diff --name-status output', async () => {
    mockExeca.mockResolvedValueOnce(gitResult(0, [
      'M\tREADME.md',
      'A\tsrc/core/git-recovery.ts',
      'R100\told.ts\tnew.ts',
      'D\ttest/obsolete.test.ts',
    ].join('\n')));

    await expect(listChangedFiles('/repo', 'base', 'head')).resolves.toEqual([
      'README.md',
      'src/core/git-recovery.ts',
      'new.ts',
      'test/obsolete.test.ts',
    ]);

    mockExeca.mockResolvedValueOnce(gitResult(1, 'fatal: bad revision'));
    await expect(listChangedFiles('/repo', 'bad', 'head')).resolves.toEqual([]);
  });
});
