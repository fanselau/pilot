/**
 * `pilot kill <id>` — Force-quit a running job.
 *
 * Kills the opencode process via OS signals and marks the job + all running
 * steps as failed in the DB. The --force flag is accepted for backward
 * compatibility but is no longer required.
 *
 * Only running jobs can be killed (pending jobs use `pilot cancel`).
 */

import { getJob, forceQuitJob } from '../core/db.js';
import { killJobSession } from '../core/runner.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red } from '../util/colors.js';

async function killCommand(id: string, opts: { force?: boolean }): Promise<void> {
  // 1. Look up job
  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }

  // 2. --force is accepted but no longer mandatory (backward compat)

  // 3. Reject non-running jobs
  if (job.status !== 'running') {
    process.stderr.write(
      `Job ${id} is not running (status: ${job.status}). Use 'pilot cancel ${id}' for pending jobs.\n`,
    );
    process.exit(1);
  }

  // 4a. Kill OS process first (continue even if it fails — process may already be gone)
  const killResult = await killJobSession(job);
  if (!killResult.killed) {
    process.stderr.write(`Warning: process kill did not succeed — ${killResult.reason}\n`);
  }

  // 4b. Update DB state regardless of kill result
  const dbResult = forceQuitJob(id, 'cli');
  if (!dbResult.ok) {
    process.stderr.write(`Failed to mark job as failed in DB: ${dbResult.reason ?? 'unknown error'}\n`);
    process.exit(1);
  }

  // 5. Output
  if (isJsonMode()) {
    outputJson({
      killed: id,
      project: job.project,
      killResult: { killed: killResult.killed, reason: killResult.reason },
      dbResult: { ok: dbResult.ok },
    });
    return;
  }

  outputHuman(`  ${green('✓')} Killed job ${id} (${job.project}): ${killResult.reason}`);
}

export { killCommand };
