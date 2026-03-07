import { execa } from 'execa';

type HeadRelation =
  | 'exact'
  | 'newer-work-exists'
  | 'already-behind-checkpoint'
  | 'diverged';

async function isGitWorktree(cwd: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    reject: false,
  });
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

async function isWorktreeDirty(cwd: string): Promise<boolean> {
  const result = await execa(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) {
    return false;
  }
  return result.stdout.trim().length > 0;
}

async function resolveCommitOrNull(cwd: string, rev: string = 'HEAD'): Promise<string | null> {
  const result = await execa(
    'git',
    ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) {
    return null;
  }

  const commit = result.stdout.trim();
  return commit.length > 0 ? commit : null;
}

async function isAncestor(cwd: string, older: string, newer: string): Promise<boolean> {
  const result = await execa('git', ['merge-base', '--is-ancestor', older, newer], {
    cwd,
    reject: false,
  });
  return result.exitCode === 0;
}

async function classifyHeadRelation(
  cwd: string,
  checkpointHead: string,
  currentHead: string,
): Promise<HeadRelation> {
  if (checkpointHead === currentHead) {
    return 'exact';
  }

  if (await isAncestor(cwd, checkpointHead, currentHead)) {
    return 'newer-work-exists';
  }

  if (await isAncestor(cwd, currentHead, checkpointHead)) {
    return 'already-behind-checkpoint';
  }

  return 'diverged';
}

async function listChangedFiles(cwd: string, base: string, head: string): Promise<string[]> {
  const result = await execa('git', ['diff', '--name-status', `${base}..${head}`], {
    cwd,
    reject: false,
  });
  if (result.exitCode !== 0) {
    return [];
  }

  const files = result.stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split('\t');
      if (parts.length < 2) {
        return null;
      }
      return parts[parts.length - 1];
    })
    .filter((file): file is string => file !== null && file.length > 0);

  return [...new Set(files)];
}

export type { HeadRelation };

export {
  isGitWorktree,
  isWorktreeDirty,
  resolveCommitOrNull,
  classifyHeadRelation,
  listChangedFiles,
};
