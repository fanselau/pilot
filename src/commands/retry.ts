/**
 * `pilot retry <id>` — Retry a failed or cancelled job.
 *
 * Validates the job exists and has 'failed' or 'cancelled' status.
 * Resets the job to pending with cleared error/timestamps.
 */

import { retry, getJob } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green } from '../util/colors.js';

async function retryCommand(id: string): Promise<void> {
  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    process.stderr.write(
      `Cannot retry job with status '${job.status}' — only failed/cancelled jobs can be retried\n`,
    );
    process.exit(1);
  }
  retry(id);

  if (isJsonMode()) {
    outputJson({ retried: id });
    return;
  }
  outputHuman(`  ${green('✓')} Retried: ${id} — now pending`);
}

export { retryCommand };
