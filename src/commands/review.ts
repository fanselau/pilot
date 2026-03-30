/**
 * `pilot review <id>` — Handle human review for jobs in review states.
 *
 * Supports two flows:
 * - completed_pending_review: --approve transitions to completed, --reject accepts as-is with note
 * - review_hold: --approve finalizes as completed (work accepted as-is), --reject cancels
 */

import { getJob, approveReview, approveReviewHold, cancel } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim, yellow, red } from '../util/colors.js';

interface ReviewOptions {
  approve?: boolean;
  reject?: string;
}

async function reviewCommand(jobId: string, opts: ReviewOptions): Promise<void> {
  const job = getJob(jobId);

  if (!job) {
    process.stderr.write(`Job not found: ${jobId}\n`);
    process.exit(1);
  }

  if (job.status !== 'completed_pending_review' && job.status !== 'review_hold') {
    if (isJsonMode()) {
      outputJson({ reviewed: false, reason: `Job ${jobId} is not in a review state (status: ${job.status})` });
      return;
    }
    process.stderr.write(`Job ${jobId} is not in a review state (status: ${job.status}).\n`);
    process.stderr.write(`Only jobs with status 'completed_pending_review' or 'review_hold' can be reviewed.\n`);
    process.exit(1);
  }

  // Show review info if no action flag
  if (!opts.approve && !opts.reject) {
    if (isJsonMode()) {
      outputJson({
        id: job.id,
        status: job.status,
        project: job.project,
        description: job.description,
        reviewItems: job.resumeHint,
      });
      return;
    }
    outputHuman(`  ${yellow('◆')} Job ${job.id}: ${job.status}`);
    outputHuman(`  ${dim('Project:')} ${job.project}`);
    outputHuman(`  ${dim('Description:')} ${job.description}`);
    if (job.resumeHint) {
      outputHuman(`  ${dim('Review items:')}`);
      outputHuman(`  ${job.resumeHint}`);
    }
    outputHuman('');
    outputHuman(`  ${dim('Actions:')}`);
    outputHuman(`    pilot review ${job.id} --approve     ${dim('— approve and continue')}`);
    outputHuman(`    pilot review ${job.id} --reject "reason"  ${dim('— accept as-is with note')}`);
    return;
  }

  if (opts.approve) {
    if (job.status === 'completed_pending_review') {
      approveReview(job.id);
      if (isJsonMode()) {
        outputJson({ reviewed: true, action: 'approved', previousStatus: 'completed_pending_review', newStatus: 'completed' });
        return;
      }
      outputHuman(`  ${green('✓')} Approved: Job ${job.id} → completed`);
    } else if (job.status === 'review_hold') {
      approveReviewHold(job.id);
      if (isJsonMode()) {
        outputJson({ reviewed: true, action: 'approved', previousStatus: 'review_hold', newStatus: 'completed' });
        return;
      }
      outputHuman(`  ${green('✓')} Approved: Job ${job.id} → completed`);
      outputHuman(`  ${dim('Work accepted as-is. Queue a new job if follow-up work is needed.')}`);
    }
    return;
  }

  if (opts.reject) {
    if (job.status === 'completed_pending_review') {
      // Accept as-is with a note — transition to completed, not failed
      // (Per requirement: never auto-queue new jobs for review handling)
      approveReview(job.id); // Still transitions to completed
      if (isJsonMode()) {
        outputJson({ reviewed: true, action: 'rejected-accepted', reason: opts.reject, newStatus: 'completed' });
        return;
      }
      outputHuman(`  ${yellow('⚠')} Accepted with note: Job ${job.id} → completed`);
      outputHuman(`  ${dim(`Note: ${opts.reject}`)}`);
      outputHuman(`  ${dim('Queue a new job if follow-up work is needed: pilot add ...')}`);
    } else if (job.status === 'review_hold') {
      cancel(job.id);
      if (isJsonMode()) {
        outputJson({ reviewed: true, action: 'cancelled', reason: opts.reject, newStatus: 'cancelled' });
        return;
      }
      outputHuman(`  ${red('✗')} Cancelled: Job ${job.id}`);
      outputHuman(`  ${dim(`Reason: ${opts.reject}`)}`);
    }
    return;
  }
}

export { reviewCommand };
