/**
 * `pilot milestone <action> <id>` — Milestone management commands.
 *
 * Actions:
 *   status <id>  — Show milestone + child phase progress
 *   resume <id>  — Retry the failed child phase (reset to pending), unpause milestone
 *   skip <id>    — Cancel the failed child, unblock next, unpause milestone
 */

import { getJob, getChildJobs, getMilestoneStatus, requeueFailedJob, cancel, unpauseMilestone, clearDependsOn } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, yellow, dim } from '../util/colors.js';
import type { Job } from '../core/types.js';

async function milestoneCommand(action: string, id: string): Promise<void> {
  switch (action) {
    case 'status':
      return milestoneStatus(id);
    case 'resume':
      return milestoneResume(id);
    case 'skip':
      return milestoneSkip(id);
    default:
      process.stderr.write(`Unknown action '${action}'. Use: status, resume, skip\n`);
      process.exit(1);
  }
}

// ── Helper: status icon for a job ────────────────────────────────────────

function statusIcon(status: Job['status']): string {
  switch (status) {
    case 'completed':  return green('✓');
    case 'failed':     return red('✗');
    case 'running':    return yellow('▶');
    case 'pending':    return dim('·');
    case 'cancelled':  return dim('—');
    case 'paused':     return yellow('⏸');
    default:           return '?';
  }
}

// ── status action ────────────────────────────────────────────────────────

async function milestoneStatus(id: string): Promise<void> {
  const milestone = getJob(id);
  if (!milestone) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }
  if (milestone.scope !== 'milestone') {
    process.stderr.write(`Job ${id} is not a milestone (scope: ${milestone.scope})\n`);
    process.exit(1);
  }

  const children = getChildJobs(id);
  const counts = getMilestoneStatus(id);

  if (isJsonMode()) {
    outputJson({
      milestone,
      children,
      status: counts,
    });
    return;
  }

  // Human output
  outputHuman(`\n  ${dim('Milestone')} ${id} — ${milestone.project}`);
  outputHuman(`  ${dim('Description:')} ${milestone.description}`);
  outputHuman(`  ${dim('Status:')}      ${milestone.status}`);
  outputHuman(`  ${dim('Progress:')}    ${counts.completed}/${counts.total} completed` +
    (counts.failed > 0 ? `, ${counts.failed} failed` : '') +
    (counts.running > 0 ? `, ${counts.running} running` : '') +
    (counts.pending > 0 ? `, ${counts.pending} pending` : ''));

  if (children.length === 0) {
    outputHuman(`\n  ${dim('No child phases found.')}`);
  } else {
    outputHuman(`\n  ${dim('Child Phases:')}`);
    outputHuman(`  ${dim('─'.repeat(60))}`);
    for (const child of children) {
      const icon = statusIcon(child.status);
      const errorSuffix = child.status === 'failed' && child.error
        ? `\n    ${red('Error:')} ${dim(child.error.slice(0, 120))}`
        : '';
      outputHuman(`  ${icon} ${child.id}  ${child.description.padEnd(20)}  ${dim(child.status)}${errorSuffix}`);
    }
    outputHuman(`  ${dim('─'.repeat(60))}`);
  }

  if (milestone.status === 'paused') {
    const failed = children.find(c => c.status === 'failed');
    if (failed) {
      outputHuman(`\n  ${yellow('Milestone is paused.')} Failed phase: ${failed.id} (${failed.description})`);
      outputHuman(`  To retry:  ${dim(`pilot milestone resume ${id}`)}`);
      outputHuman(`  To skip:   ${dim(`pilot milestone skip ${id}`)}`);
    }
  }
  outputHuman('');
}

// ── resume action ────────────────────────────────────────────────────────

async function milestoneResume(id: string): Promise<void> {
  const milestone = getJob(id);
  if (!milestone) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }
  if (milestone.scope !== 'milestone') {
    process.stderr.write(`Job ${id} is not a milestone (scope: ${milestone.scope})\n`);
    process.exit(1);
  }
  if (milestone.status !== 'paused') {
    process.stderr.write(`Milestone ${id} is not paused (status: ${milestone.status}). Only paused milestones can be resumed.\n`);
    process.exit(1);
  }

  const children = getChildJobs(id);
  const failedChild = children.find(c => c.status === 'failed');
  if (!failedChild) {
    process.stderr.write(`No failed child phase found for milestone ${id}. Cannot resume.\n`);
    process.exit(1);
  }

  // Re-queue the failed child job as pending
  requeueFailedJob(failedChild.id);

  // Unpause the milestone (set back to completed so it stays as coordinator)
  unpauseMilestone(id);

  if (isJsonMode()) {
    outputJson({
      resumed: id,
      retriedChild: failedChild.id,
      childDescription: failedChild.description,
    });
    return;
  }

  outputHuman(`  ${green('✓')} Retrying phase ${failedChild.description} (${failedChild.id}). Milestone resumed.`);
}

// ── skip action ──────────────────────────────────────────────────────────

async function milestoneSkip(id: string): Promise<void> {
  const milestone = getJob(id);
  if (!milestone) {
    process.stderr.write(`Job not found: ${id}\n`);
    process.exit(1);
  }
  if (milestone.scope !== 'milestone') {
    process.stderr.write(`Job ${id} is not a milestone (scope: ${milestone.scope})\n`);
    process.exit(1);
  }
  if (milestone.status !== 'paused') {
    process.stderr.write(`Milestone ${id} is not paused (status: ${milestone.status}). Only paused milestones can be skipped.\n`);
    process.exit(1);
  }

  const children = getChildJobs(id);
  const failedChild = children.find(c => c.status === 'failed');
  if (!failedChild) {
    process.stderr.write(`No failed child phase found for milestone ${id}. Cannot skip.\n`);
    process.exit(1);
  }

  // Cancel the failed child job
  cancel(failedChild.id);

  // Find the next pending child whose depends_on points to the failed child
  const nextChild = children.find(c => c.status === 'pending' && c.dependsOn === failedChild.id);
  if (nextChild) {
    // Clear its depends_on so it can be claimed by the runner
    clearDependsOn(nextChild.id);
  }

  // Unpause the milestone
  unpauseMilestone(id);

  if (isJsonMode()) {
    outputJson({
      skipped: id,
      cancelledChild: failedChild.id,
      childDescription: failedChild.description,
      unblocked: nextChild ? nextChild.id : null,
      unblockedDescription: nextChild ? nextChild.description : null,
    });
    return;
  }

  const unblockMsg = nextChild
    ? ` Next phase unblocked (${nextChild.description}).`
    : ' No further phases pending.';
  outputHuman(`  ${green('✓')} Skipped phase ${failedChild.description} (${failedChild.id}).${unblockMsg} Milestone resumed.`);
}

export { milestoneCommand };
