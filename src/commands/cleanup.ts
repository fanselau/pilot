/**
 * pilot cleanup — Clean stale PIDs, old logs, orphaned processes.
 *
 * Renders cleanup results in human-friendly or JSON format.
 * Supports --dry-run for safe previewing, --all for aggressive cleanup.
 */

import { runCleanup } from '../core/cleanup.js';
import type { CleanupAction } from '../core/cleanup.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { green, yellow, bold, dim } from '../util/colors.js';

interface CleanupOpts {
  json?: boolean;
  dryRun?: boolean;
  all?: boolean;
  keepDays?: string;
}

/** Human-readable labels for action types. */
const ACTION_LABELS: Record<string, string> = {
  remove_pid: 'Removed stale PID',
  remove_log: 'Removed',
  kill_orphan: 'Orphaned process',
  remove_history: 'Truncated history',
  clean_queue: 'Queue history',
};

/** Dry-run labels for action types. */
const DRY_LABELS: Record<string, string> = {
  remove_pid: 'Would remove stale PID',
  remove_log: 'Would remove',
  kill_orphan: 'Would kill orphan',
  remove_history: 'Would truncate history',
  clean_queue: 'Queue history',
};

function formatAction(action: CleanupAction, dryRun: boolean): string {
  const labels = dryRun ? DRY_LABELS : ACTION_LABELS;
  const label = labels[action.type] ?? action.type;

  // For kill_orphan, target is a PID number
  if (action.type === 'kill_orphan') {
    return `PID ${action.target} (${action.reason})`;
  }

  // For clean_queue, it's informational
  if (action.type === 'clean_queue') {
    return `${action.reason}`;
  }

  // For logs, add the reason as detail
  const basename = action.target.split('/').pop() ?? action.target;
  if (action.reason.includes('bytes') || action.reason.includes('days')) {
    return `${basename} (${action.reason})`;
  }

  return `${basename}`;
}

async function cleanupCommand(opts: CleanupOpts): Promise<void> {
  const keepDays = parseInt(opts.keepDays ?? '7', 10);
  const dryRun = opts.dryRun === true;
  const all = opts.all === true;

  const result = await runCleanup({ dryRun, all, keepDays });

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    const removed = result.actions.filter(
      (a) => a.type !== 'clean_queue',
    ).length;
    const skipped = result.actions.filter(
      (a) => a.type === 'clean_queue',
    ).length;

    outputJson({
      dryRun: result.dryRun,
      actions: result.actions,
      summary: { removed, skipped },
    });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);
  const title = dryRun ? 'Pilot Cleanup (dry run)' : 'Pilot Cleanup';
  outputHuman(`${bold(title)}`);
  outputHuman(sep);

  if (result.actions.length === 0) {
    outputHuman(`  ${dim('Nothing to clean')}`);
    outputHuman('');
    outputHuman('0 items cleaned');
    return;
  }

  const labels = dryRun ? DRY_LABELS : ACTION_LABELS;

  for (const action of result.actions) {
    const label = labels[action.type] ?? action.type;
    const detail = formatAction(action, dryRun);

    if (action.type === 'kill_orphan') {
      outputHuman(`  ${yellow('\u26A0')} ${label}: ${detail}`);
    } else if (action.type === 'clean_queue') {
      outputHuman(`  ${dim('\u25CB')} ${label}: ${detail}`);
    } else {
      const icon = dryRun ? dim('\u25CB') : green('\u2713');
      outputHuman(`  ${icon} ${label}: ${detail}`);
    }
  }

  outputHuman('');

  // Summary line
  const actionCount = result.actions.filter(
    (a) => a.type !== 'clean_queue',
  ).length;
  const orphanCount = result.actions.filter(
    (a) => a.type === 'kill_orphan',
  ).length;

  const parts: string[] = [];
  if (dryRun) {
    parts.push(`${actionCount} item${actionCount === 1 ? '' : 's'} would be cleaned`);
  } else {
    parts.push(`${actionCount} item${actionCount === 1 ? '' : 's'} cleaned`);
  }
  if (orphanCount > 0) {
    parts.push(`${orphanCount} orphan${orphanCount === 1 ? '' : 's'} found`);
  }
  outputHuman(parts.join(', '));
}

export { cleanupCommand };
