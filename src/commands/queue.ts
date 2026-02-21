/**
 * pilot queue — Display queue items from queue.json.
 *
 * Reads queue-store for active items (running/queued).
 * With --history flag, shows completed/failed from history.
 * Subcommand: pilot queue remove <id>
 */

import { getItems, getHistory, removeItem } from '../core/queue-store.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { bold, dim, green, red, yellow } from '../util/colors.js';
import { formatDuration } from '../util/format.js';
import type { QueueJsonItem, QueueHistoryItem, QueueItem } from '../core/types.js';

interface QueueOpts {
  json?: boolean;
  history?: boolean;
}

async function queueCommand(opts: QueueOpts): Promise<void> {
  void opts; // used via isJsonMode()

  // ── History mode ──────────────────────────────────────────────────────
  if (opts.history) {
    const history = await getHistory(50);

    if (isJsonMode()) {
      outputJson({
        history: history.map((h) => ({
          id: h.id,
          project: h.project,
          mode: h.mode,
          description: h.description,
          status: h.status,
          addedAt: h.addedAt,
          completedAt: h.completedAt,
          duration: h.duration,
          error: h.error,
        })),
        count: history.length,
      });
      return;
    }

    const sep = '─'.repeat(56);
    outputHuman(`${bold('Queue History')} (most recent)`);
    outputHuman(sep);

    const completed = history.filter((h) => h.status === 'completed');
    const failed = history.filter((h) => h.status === 'failed');

    if (completed.length > 0) {
      outputHuman('');
      outputHuman(bold('Completed'));
      for (const entry of completed) {
        const dur = entry.duration > 0 ? ` (${formatDuration(entry.duration)})` : '';
        outputHuman(`  ${green('✓')} ${entry.project}: ${entry.mode}${dur}`);
      }
    }

    if (failed.length > 0) {
      outputHuman('');
      outputHuman(bold('Failed'));
      for (const entry of failed) {
        const errMsg = entry.error ? ` — ${entry.error}` : '';
        outputHuman(`  ${red('✗')} ${entry.project}: ${entry.mode}${errMsg}`);
      }
    }

    if (history.length === 0) {
      outputHuman('');
      outputHuman(dim('No history entries'));
    }

    outputHuman('');
    outputHuman(`${history.length} history item(s)`);
    return;
  }

  // ── Active items mode ─────────────────────────────────────────────────
  const items = await getItems();

  // Group by status
  const running = items.filter((e) => e.status === 'running');
  const queued = items.filter((e) => e.status === 'queued');
  const activeCount = running.length + queued.length;

  // ── JSON mode — backward compat ─────────────────────────────────────
  if (isJsonMode()) {
    const queueItems: QueueItem[] = items.map((item) => ({
      // Backward compat fields
      status: item.status === 'queued' ? 'pending' as const : item.status as QueueItem['status'],
      project: item.project,
      mode: item.mode,
      args: item.description,     // old 'args' maps to 'description'
      description: item.description,
      line_num: 0,                // deprecated — always 0
      // New fields
      id: item.id as unknown as never, // included via spread below
    }));

    // Build output with both old shape and new fields
    const output = items.map((item) => ({
      id: item.id,
      status: item.status === 'queued' ? 'pending' : item.status,
      project: item.project,
      mode: item.mode,
      args: item.description,
      description: item.description,
      line_num: 0,
      addedAt: item.addedAt,
    }));

    outputJson({
      queue: output,
      active_count: activeCount,
    });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`${bold('Queue')}`);
  outputHuman(sep);

  function formatEntry(entry: QueueJsonItem): string {
    return `${entry.project}: ${entry.mode}${entry.description ? ` | ${entry.description}` : ''}`;
  }

  if (running.length > 0) {
    outputHuman('');
    outputHuman(bold('In Progress'));
    for (const entry of running) {
      outputHuman(`  ${yellow('⟳')} ${formatEntry(entry)}`);
    }
  }

  if (queued.length > 0) {
    outputHuman('');
    outputHuman(bold('Queued'));
    for (const entry of queued) {
      outputHuman(`  ${dim('○')} ${formatEntry(entry)}`);
    }
  }

  if (items.length === 0) {
    outputHuman('');
    outputHuman(dim('Queue empty'));
  }

  outputHuman('');
  outputHuman(`${activeCount} active item(s)`);
}

/**
 * pilot queue remove <id> — Remove a queued item.
 */
async function queueRemoveCommand(id: string, opts: Record<string, unknown>): Promise<void> {
  void opts;
  try {
    await removeItem(id);
    if (isJsonMode()) {
      outputJson({ action: 'removed', id });
    } else {
      outputHuman(`✓ Removed from queue: ${id}`);
    }
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

export { queueCommand, queueRemoveCommand };
