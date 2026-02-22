/**
 * `pilot bump <id>` — Move a pending job to the front of the queue.
 *
 * Sets the job's priority to max(priority) + 1 so it runs next.
 * Only pending jobs can be bumped.
 */

import { bump, getJob } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green } from '../util/colors.js';

async function bumpCommand(id: string): Promise<void> {
  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }
  if (job.status !== 'pending') {
    process.stderr.write(
      `Cannot bump job with status '${job.status}' — only pending jobs can be bumped\n`,
    );
    process.exit(1);
  }
  bump(id);

  if (isJsonMode()) {
    outputJson({ bumped: id });
    return;
  }
  outputHuman(`  ${green('✓')} Bumped: ${id} — moved to front`);
}

export { bumpCommand };
