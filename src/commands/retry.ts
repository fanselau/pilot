/**
 * `pilot retry <id>` — Retry a failed or cancelled job.
 *
 * Validates the job exists and has 'failed' or 'cancelled' status.
 * Resets the job to pending with cleared error/timestamps.
 */

import { retry, getJob, unblockProject } from '../core/db.js';
import { buildRetryWhy } from '../core/job-introspection.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim } from '../util/colors.js';

interface RetryOptions {
  why?: boolean;
}

function formatWhyLine(what: string, why: string, next: string): string {
  return `what: ${what} | why: ${why} | next: ${next}`;
}

async function retryCommand(id: string, opts: RetryOptions = {}): Promise<void> {
  const job = getJob(id);
  if (!job) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }

  if (opts.why) {
    const retryWhy = buildRetryWhy(job);
    if (isJsonMode()) {
      outputJson({
        id: job.id,
        status: job.status,
        retryable: retryWhy.code === 'retryable-failure',
        reason: retryWhy,
        lastFailure: job.error,
        resumeHint: job.resumeHint,
      });
      return;
    }

    outputHuman(`  Retry check: ${job.id}`);
    outputHuman(`  ${dim(formatWhyLine(retryWhy.what, retryWhy.why, retryWhy.next))}`);
    if (job.error) {
      outputHuman(`  ${dim(`last-failure: ${job.error}`)}`);
    }
    if (job.resumeHint) {
      outputHuman(`  ${dim(`resume-hint: ${job.resumeHint}`)}`);
    }
    return;
  }

  if (job.status !== 'failed' && job.status !== 'cancelled') {
    process.stderr.write(
      `Cannot retry job with status '${job.status}' — only failed/cancelled jobs can be retried\n`,
    );
    process.exit(1);
  }
  retry(id);
  // Unblock the project so queued jobs can run again
  unblockProject(job.project);

  if (isJsonMode()) {
    outputJson({ retried: id, unblocked: job.project });
    return;
  }
  outputHuman(`  ${green('✓')} Retried: ${id} — now pending`);
  outputHuman(`  ${dim('⊙')} Unblocked project: ${job.project}`);
}

export { retryCommand };
