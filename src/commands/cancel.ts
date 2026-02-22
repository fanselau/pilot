/**
 * `pilot cancel <id>` — Cancel a pending job.
 *
 * Validates the job exists and has 'pending' status before cancelling.
 * Only pending jobs can be cancelled (running jobs must be stopped differently).
 */

import { cancel, getJob } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green } from '../util/colors.js';

async function cancelCommand(id: string): Promise<void> {
  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }
  if (job.status !== 'pending') {
    process.stderr.write(
      `Cannot cancel job with status '${job.status}' — only pending jobs can be cancelled\n`,
    );
    process.exit(1);
  }
  cancel(id);

  if (isJsonMode()) {
    outputJson({ cancelled: id });
    return;
  }
  outputHuman(`  ${green('✓')} Cancelled: ${id}`);
}

export { cancelCommand };
