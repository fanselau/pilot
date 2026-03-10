import { execa } from 'execa';
import { existsSync } from 'node:fs';
import type { ProjectDirtyBaseline } from './types.js';

type HeadRelation =
  | 'exact'
  | 'newer-work-exists'
  | 'already-behind-checkpoint'
  | 'diverged';

interface GitConflictState {
  hasConflictState: boolean;
  signals: string[];
}

interface DirtyStartClassification {
  allowed: boolean;
  reason: string;
  branch: string | null;
  headCommit: string | null;
  statusPorcelain: string;
  conflictState: GitConflictState;
}

async function isGitWorktree(cwd: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    reject: false,
  });
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

async function isWorktreeDirty(cwd: string): Promise<boolean> {
  const porcelain = await getPorcelainStatus(cwd);
  return porcelain.trim().length > 0;
}

async function getBranchOrNull(cwd: string): Promise<string | null> {
  const result = await execa('git', ['branch', '--show-current'], {
    cwd,
    reject: false,
  });
  if (result.exitCode !== 0) {
    return null;
  }

  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}

async function getPorcelainStatus(cwd: string): Promise<string> {
  const result = await execa(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) {
    return '';
  }

  return result.stdout;
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

async function doesGitRefExist(cwd: string, refName: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--verify', '--quiet', refName], {
    cwd,
    reject: false,
  });
  return result.exitCode === 0;
}

async function doesGitPathExist(cwd: string, gitPath: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--git-path', gitPath], {
    cwd,
    reject: false,
  });
  if (result.exitCode !== 0) {
    return false;
  }

  const resolved = result.stdout.trim();
  if (!resolved) {
    return false;
  }

  return existsSync(resolved);
}

async function hasUnmergedIndexEntries(cwd: string): Promise<boolean> {
  const result = await execa('git', ['ls-files', '--unmerged'], {
    cwd,
    reject: false,
  });

  if (result.exitCode !== 0) {
    return false;
  }

  return result.stdout.trim().length > 0;
}

async function detectGitConflictState(cwd: string): Promise<GitConflictState> {
  const signals: string[] = [];

  if (await doesGitRefExist(cwd, 'MERGE_HEAD')) {
    signals.push('MERGE_HEAD');
  }

  if (await doesGitRefExist(cwd, 'REBASE_HEAD')) {
    signals.push('REBASE_HEAD');
  }

  if (await doesGitRefExist(cwd, 'CHERRY_PICK_HEAD')) {
    signals.push('CHERRY_PICK_HEAD');
  }

  if (await doesGitPathExist(cwd, 'rebase-merge')) {
    signals.push('rebase-merge');
  }

  if (await doesGitPathExist(cwd, 'rebase-apply')) {
    signals.push('rebase-apply');
  }

  if (await hasUnmergedIndexEntries(cwd)) {
    signals.push('unmerged-index');
  }

  return {
    hasConflictState: signals.length > 0,
    signals,
  };
}

async function classifyDirtyStart(
  cwd: string,
  baseline: ProjectDirtyBaseline | null,
): Promise<DirtyStartClassification> {
  const [branch, headCommit, statusPorcelain, conflictState] = await Promise.all([
    getBranchOrNull(cwd),
    resolveCommitOrNull(cwd, 'HEAD'),
    getPorcelainStatus(cwd),
    detectGitConflictState(cwd),
  ]);

  if (conflictState.hasConflictState) {
    return {
      allowed: false,
      reason: 'blocked: merge/rebase/conflict state detected',
      branch,
      headCommit,
      statusPorcelain,
      conflictState,
    };
  }

  if (!baseline) {
    return {
      allowed: false,
      reason: 'blocked: manual/untracked changes not attributable to Pilot',
      branch,
      headCommit,
      statusPorcelain,
      conflictState,
    };
  }

  if (baseline.branch !== branch || baseline.headCommit !== headCommit) {
    return {
      allowed: false,
      reason: 'blocked: HEAD moved outside Pilot',
      branch,
      headCommit,
      statusPorcelain,
      conflictState,
    };
  }

  if (baseline.statusPorcelain !== statusPorcelain) {
    return {
      allowed: false,
      reason: 'blocked: manual/untracked changes not attributable to Pilot',
      branch,
      headCommit,
      statusPorcelain,
      conflictState,
    };
  }

  return {
    allowed: true,
    reason: 'allowed: continuation-safe dirty tree matches prior Pilot baseline',
    branch,
    headCommit,
    statusPorcelain,
    conflictState,
  };
}

export type { HeadRelation };

export {
  isGitWorktree,
  isWorktreeDirty,
  getBranchOrNull,
  getPorcelainStatus,
  detectGitConflictState,
  classifyDirtyStart,
  resolveCommitOrNull,
  classifyHeadRelation,
  listChangedFiles,
};
