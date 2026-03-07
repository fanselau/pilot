import { execa } from 'execa';
import { getJob } from '../core/db.js';
import { resolveProjectDir } from '../core/config.js';
import {
  classifyHeadRelation,
  isGitWorktree,
  isWorktreeDirty,
  listChangedFiles,
  resolveCommitOrNull,
} from '../core/git-recovery.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { dim, green, yellow } from '../util/colors.js';

interface UndoOptions {
  dryRun?: boolean;
  force?: boolean;
}

function fail(message: string, code: 1 | 2 = 2): never {
  process.stderr.write(message + '\n');
  process.exit(code);
}

function shortCommit(commit: string | null): string {
  if (!commit) {
    return 'none';
  }
  return commit.slice(0, 12);
}

async function undoCommand(id: string, opts: UndoOptions): Promise<void> {
  const job = getJob(id);
  if (!job) {
    fail(`Job not found: ${id}`, 1);
  }

  if (job.status === 'pending' || job.status === 'running') {
    fail(
      `Cannot undo job ${id} with status '${job.status}'. Wait for a terminal status first.`,
    );
  }

  const dryRun = opts.dryRun ?? false;
  const force = opts.force ?? false;
  const projectDir = resolveProjectDir(job.project);

  if (!(await isGitWorktree(projectDir))) {
    fail(
      `Undo unavailable for job ${id}: project is not a git worktree (${projectDir}).`,
      1,
    );
  }

  const hasCheckpointData = job.gitBaseCommit !== null || job.gitHeadCommit !== null;
  if (!hasCheckpointData) {
    fail(
      `Undo unavailable for job ${id}: missing recovery checkpoints (git base/head were not recorded).`,
    );
  }

  const producedCommitDelta = (job.gitBaseCommit ?? '') !== (job.gitHeadCommit ?? '');
  const currentHead = await resolveCommitOrNull(projectDir, 'HEAD');
  const worktreeDirty = await isWorktreeDirty(projectDir);

  if (!producedCommitDelta) {
    if (isJsonMode()) {
      outputJson({
        id,
        project: projectDir,
        dryRun,
        force,
        outcome: 'nothing-to-undo',
        reason: 'job produced no commit delta',
        baseCommit: job.gitBaseCommit,
        headCommit: job.gitHeadCommit,
        currentHead,
        worktreeDirty,
      });
      return;
    }

    outputHuman(`  ${green('✓')} Nothing to undo for job ${id}`);
    outputHuman(`  ${dim('Reason: job produced no commit delta between recorded base/head checkpoints.')}`);
    return;
  }

  if (!job.gitBaseCommit || !job.gitHeadCommit) {
    fail(
      `Undo unavailable for job ${id}: incomplete recovery checkpoints (base/head commit missing).`,
    );
  }

  const baseCommit = await resolveCommitOrNull(projectDir, job.gitBaseCommit);
  if (!baseCommit) {
    fail(
      `Undo unavailable for job ${id}: cannot resolve stored base checkpoint ${job.gitBaseCommit}.`,
    );
  }

  const checkpointHead = await resolveCommitOrNull(projectDir, job.gitHeadCommit);
  if (!checkpointHead) {
    fail(
      `Undo unavailable for job ${id}: cannot resolve stored head checkpoint ${job.gitHeadCommit}.`,
    );
  }

  if (!currentHead) {
    fail(`Undo unavailable for job ${id}: cannot resolve current repository HEAD.`, 1);
  }

  const relation = await classifyHeadRelation(projectDir, checkpointHead, currentHead);
  const changedFiles = await listChangedFiles(projectDir, baseCommit, checkpointHead);
  const warnings: string[] = [];

  if (!dryRun && worktreeDirty) {
    fail(
      `Refusing undo for job ${id}: worktree is dirty. Commit, stash, or discard local changes first. --force does not bypass this guard.`,
    );
  }

  if (relation === 'newer-work-exists' && !force) {
    fail(
      `Refusing undo for job ${id}: newer commits exist after this checkpoint. Re-run with --force to discard newer work. Tip: undo newer jobs for this project first.`,
    );
  }

  if (relation === 'diverged' && !force) {
    fail(
      `Refusing undo for job ${id}: current HEAD diverged from this checkpoint. Re-run with --force only if you intentionally want to discard current history.`,
    );
  }

  if ((relation === 'newer-work-exists' || relation === 'diverged') && force) {
    warnings.push('Force override enabled: this undo will discard history after the job checkpoint.');
  }

  if (job.startedDirty && !force) {
    fail(
      `Refusing undo for job ${id}: job started from a dirty worktree, so safe rollback cannot be guaranteed. Re-run with --force to override this guard.`,
    );
  }

  if (job.startedDirty && force) {
    warnings.push('Force override enabled: job started dirty, so undo may discard pre-existing local edits from that run.');
  }

  if (dryRun) {
    if (isJsonMode()) {
      outputJson({
        id,
        project: projectDir,
        dryRun: true,
        force,
        outcome: 'preview',
        baseCommit,
        headCommit: checkpointHead,
        currentHead,
        relation,
        startedDirty: job.startedDirty,
        worktreeDirty,
        warnings,
        filesChanged: changedFiles,
        wouldResetTo: baseCommit,
      });
      return;
    }

    outputHuman(`  ${yellow('[dry-run]')} Undo preview for job ${id}`);
    outputHuman(`  project: ${projectDir}`);
    outputHuman(`  base: ${shortCommit(baseCommit)}   head: ${shortCommit(checkpointHead)}   current: ${shortCommit(currentHead)}`);
    outputHuman(`  relation: ${relation}`);
    outputHuman(`  started-dirty: ${job.startedDirty ? 'yes' : 'no'}`);
    outputHuman(`  worktree-dirty-now: ${worktreeDirty ? 'yes' : 'no'}`);
    outputHuman(`  would run: git reset --hard ${baseCommit}`);
    if (changedFiles.length === 0) {
      outputHuman('  files changed by job: (none detected)');
    } else {
      outputHuman('  files changed by job:');
      for (const file of changedFiles) {
        outputHuman(`    - ${file}`);
      }
    }
    for (const warning of warnings) {
      outputHuman(`  ${yellow('!')} ${warning}`);
    }
    return;
  }

  if (currentHead === baseCommit) {
    if (isJsonMode()) {
      outputJson({
        id,
        project: projectDir,
        dryRun: false,
        force,
        outcome: 'already-at-base',
        baseCommit,
        headCommit: checkpointHead,
        currentHead,
        relation,
        warnings,
      });
      return;
    }

    outputHuman(`  ${green('✓')} Repository already at recorded base commit (${shortCommit(baseCommit)}).`);
    return;
  }

  const resetResult = await execa('git', ['reset', '--hard', baseCommit], {
    cwd: projectDir,
    reject: false,
  });

  if (resetResult.exitCode !== 0) {
    const failure = resetResult.stderr.trim() || resetResult.stdout.trim() || 'unknown git reset error';
    fail(`Failed undo for job ${id}: git reset --hard ${baseCommit} failed (${failure}).`, 1);
  }

  if (isJsonMode()) {
    outputJson({
      id,
      project: projectDir,
      dryRun: false,
      force,
      outcome: 'reset-complete',
      resetTo: baseCommit,
      previousHead: currentHead,
      checkpointHead,
      relation,
      filesChanged: changedFiles,
      warnings,
    });
    return;
  }

  outputHuman(`  ${green('✓')} Undid job ${id}`);
  outputHuman(`  reset: ${shortCommit(currentHead)} -> ${shortCommit(baseCommit)}`);
  for (const warning of warnings) {
    outputHuman(`  ${yellow('!')} ${warning}`);
  }
}

export { undoCommand };
