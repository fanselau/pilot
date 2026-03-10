import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

import { execa } from 'execa';
import { existsSync } from 'node:fs';
import {
  isGitWorktree,
  isWorktreeDirty,
  getBranchOrNull,
  getPorcelainStatus,
  detectGitConflictState,
  classifyDirtyStart,
  resolveCommitOrNull,
  classifyHeadRelation,
  listChangedFiles,
} from '../../src/core/git-recovery.js';

const mockExeca = vi.mocked(execa);
const mockExistsSync = vi.mocked(existsSync);

function gitResult(exitCode: number, stdout: string = ''): Awaited<ReturnType<typeof execa>> {
  return { exitCode, stdout } as unknown as Awaited<ReturnType<typeof execa>>;
}

function setGitMock(
  impl: (command: string, args: string[]) => Awaited<ReturnType<typeof execa>>,
): void {
  mockExeca.mockImplementation(((
    command: string,
    args: string[],
  ) => Promise.resolve(impl(command, args))) as unknown as Parameters<typeof mockExeca.mockImplementation>[0]);
}

describe('git-recovery helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
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

  it('returns branch name or null for detached HEAD', async () => {
    mockExeca.mockResolvedValueOnce(gitResult(0, 'main\n'));
    await expect(getBranchOrNull('/repo')).resolves.toBe('main');

    mockExeca.mockResolvedValueOnce(gitResult(0, ''));
    await expect(getBranchOrNull('/repo')).resolves.toBeNull();
  });

  it('captures raw porcelain payload for provenance baselines', async () => {
    const payload = ' M src/core/runner.ts\n?? junk.txt';
    mockExeca.mockResolvedValueOnce(gitResult(0, payload));
    await expect(getPorcelainStatus('/repo')).resolves.toBe(payload);
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

  it('detects merge/rebase/cherry-pick and unmerged index conflict signals', async () => {
    mockExistsSync.mockImplementation((pathLike: Parameters<typeof existsSync>[0]) => String(pathLike) === '/repo/.git/rebase-merge');
    setGitMock((command, args) => {
      if (command !== 'git') return gitResult(1, '');

      const [subcommand] = args;
      if (subcommand === 'rev-parse' && args.includes('--verify')) {
        const ref = args[args.length - 1];
        if (ref === 'MERGE_HEAD' || ref === 'CHERRY_PICK_HEAD') {
          return gitResult(0, 'present');
        }
        return gitResult(1, '');
      }

      if (subcommand === 'rev-parse' && args[1] === '--git-path') {
        const target = args[2];
        if (target === 'rebase-merge') {
          return gitResult(0, '/repo/.git/rebase-merge');
        }
        if (target === 'rebase-apply') {
          return gitResult(0, '/repo/.git/rebase-apply');
        }
      }

      if (subcommand === 'ls-files' && args[1] === '--unmerged') {
        return gitResult(0, '100644 abc 1\tfile.ts');
      }

      return gitResult(1, '');
    });

    const conflict = await detectGitConflictState('/repo');
    expect(conflict.hasConflictState).toBe(true);
    expect(conflict.signals).toEqual(expect.arrayContaining([
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'rebase-merge',
      'unmerged-index',
    ]));
  });

  it('classifies continuation-safe dirty starts when branch/head/porcelain match baseline', async () => {
    setGitMock((command, args) => {
      if (command !== 'git') return gitResult(1, '');

      if (args[0] === 'branch') return gitResult(0, 'main\n');
      if (args[0] === 'status') return gitResult(0, ' M src/core/runner.ts');

      if (args[0] === 'rev-parse' && args.includes('--verify') && args.includes('--quiet')) {
        const ref = args[args.length - 1];
        if (ref === 'HEAD^{commit}') {
          return gitResult(0, 'abc123\n');
        }
        return gitResult(1, '');
      }

      if (args[0] === 'rev-parse' && args[1] === '--git-path') {
        return gitResult(0, `/repo/.git/${args[2]}`);
      }

      if (args[0] === 'ls-files' && args[1] === '--unmerged') {
        return gitResult(0, '');
      }

      return gitResult(1, '');
    });

    const result = await classifyDirtyStart('/repo', {
      project: '/repo',
      branch: 'main',
      headCommit: 'abc123',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'ab12',
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed: continuation-safe dirty tree matches prior Pilot baseline');
  });

  it('blocks dirty starts when provenance is missing or porcelain differs', async () => {
    setGitMock((command, args) => {
      if (command !== 'git') return gitResult(1, '');

      if (args[0] === 'branch') return gitResult(0, 'main\n');
      if (args[0] === 'status') return gitResult(0, ' M src/core/runner.ts\n?? temp.log');

      if (args[0] === 'rev-parse' && args.includes('--verify') && args.includes('--quiet')) {
        const ref = args[args.length - 1];
        if (ref === 'HEAD^{commit}') {
          return gitResult(0, 'abc123\n');
        }
        return gitResult(1, '');
      }

      if (args[0] === 'rev-parse' && args[1] === '--git-path') {
        return gitResult(0, `/repo/.git/${args[2]}`);
      }

      if (args[0] === 'ls-files' && args[1] === '--unmerged') {
        return gitResult(0, '');
      }

      return gitResult(1, '');
    });

    const missing = await classifyDirtyStart('/repo', null);
    expect(missing.allowed).toBe(false);
    expect(missing.reason).toBe('blocked: manual/untracked changes not attributable to Pilot');

    const mismatch = await classifyDirtyStart('/repo', {
      project: '/repo',
      branch: 'main',
      headCommit: 'abc123',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'ab12',
    });
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.reason).toBe('blocked: manual/untracked changes not attributable to Pilot');
  });

  it('blocks dirty starts on HEAD drift or conflict states', async () => {
    mockExistsSync.mockReturnValue(true);
    setGitMock((command, args) => {
      if (command !== 'git') return gitResult(1, '');

      if (args[0] === 'branch') return gitResult(0, 'feature\n');
      if (args[0] === 'status') return gitResult(0, ' M src/core/runner.ts');

      if (args[0] === 'rev-parse' && args.includes('--verify') && args.includes('--quiet')) {
        const ref = args[args.length - 1];
        if (ref === 'HEAD^{commit}') {
          return gitResult(0, 'newhead\n');
        }
        if (ref === 'MERGE_HEAD') {
          return gitResult(0, 'mergehead');
        }
        return gitResult(1, '');
      }

      if (args[0] === 'rev-parse' && args[1] === '--git-path') {
        return gitResult(0, `/repo/.git/${args[2]}`);
      }

      if (args[0] === 'ls-files' && args[1] === '--unmerged') {
        return gitResult(0, '');
      }

      return gitResult(1, '');
    });

    const conflict = await classifyDirtyStart('/repo', {
      project: '/repo',
      branch: 'feature',
      headCommit: 'newhead',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'ab12',
    });
    expect(conflict.allowed).toBe(false);
    expect(conflict.reason).toBe('blocked: merge/rebase/conflict state detected');

    mockExistsSync.mockReturnValue(false);
    setGitMock((command, args) => {
      if (command !== 'git') return gitResult(1, '');

      if (args[0] === 'branch') return gitResult(0, 'feature\n');
      if (args[0] === 'status') return gitResult(0, ' M src/core/runner.ts');

      if (args[0] === 'rev-parse' && args.includes('--verify') && args.includes('--quiet')) {
        const ref = args[args.length - 1];
        if (ref === 'HEAD^{commit}') {
          return gitResult(0, 'newhead\n');
        }
        return gitResult(1, '');
      }

      if (args[0] === 'rev-parse' && args[1] === '--git-path') {
        return gitResult(0, `/repo/.git/${args[2]}`);
      }

      if (args[0] === 'ls-files' && args[1] === '--unmerged') {
        return gitResult(0, '');
      }

      return gitResult(1, '');
    });

    const drift = await classifyDirtyStart('/repo', {
      project: '/repo',
      branch: 'main',
      headCommit: 'oldhead',
      statusPorcelain: ' M src/core/runner.ts',
      recordedAt: '2026-03-10T00:00:00.000Z',
      jobId: 'ab12',
    });
    expect(drift.allowed).toBe(false);
    expect(drift.reason).toBe('blocked: HEAD moved outside Pilot');
  });
});
