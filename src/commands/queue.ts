/**
 * pilot queue — Pretty-print QUEUE.md entries grouped by status.
 *
 * Reads and parses the QUEUE.md file, groups entries by status
 * (running → pending → done → failed), and displays them.
 */

import { getConfig } from '../core/config.js';
import { parseQueueFile } from '../core/queue-parser.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { bold, dim, green, red, yellow } from '../util/colors.js';
import type { QueueEntry, QueueItem } from '../core/types.js';

interface QueueOpts {
  json?: boolean;
}

async function queueCommand(opts: QueueOpts): Promise<void> {
  void opts; // used via isJsonMode()
  const config = getConfig();

  let entries: QueueEntry[];
  try {
    entries = await parseQueueFile(config.queueFile);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      process.stderr.write(`Error: Queue file not found: ${config.queueFile}\n`);
      process.exit(1);
    }
    throw err;
  }

  // Group by status
  const running = entries.filter((e) => e.status === 'running');
  const pending = entries.filter((e) => e.status === 'pending');
  const done = entries.filter((e) => e.status === 'done');
  const failed = entries.filter((e) => e.status === 'failed');
  const activeCount = running.length + pending.length;

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    const queueItems: QueueItem[] = entries.map((e) => ({
      status: e.status,
      project: e.project,
      mode: e.mode,
      args: e.args,
      description: e.description ?? '',
      line_num: e.lineNum,
    }));

    outputJson({
      queue: queueItems,
      active_count: activeCount,
    });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`${bold('Queue:')} ${config.queueFile}`);
  outputHuman(sep);

  function formatEntry(entry: QueueEntry): string {
    const parts = [entry.project, entry.mode];
    if (entry.args) {
      parts.push(entry.args);
    }
    // project: mode | args
    return `${entry.project}: ${entry.mode}${entry.args ? ` | ${entry.args}` : ''}`;
  }

  if (running.length > 0) {
    outputHuman('');
    outputHuman(bold('In Progress'));
    for (const entry of running) {
      outputHuman(`  ${yellow('⟳')} ${formatEntry(entry)}`);
    }
  }

  if (pending.length > 0) {
    outputHuman('');
    outputHuman(bold('Queued'));
    for (const entry of pending) {
      outputHuman(`  ${dim('○')} ${formatEntry(entry)}`);
    }
  }

  if (done.length > 0) {
    outputHuman('');
    outputHuman(bold('Done'));
    for (const entry of done) {
      outputHuman(`  ${green('✓')} ${formatEntry(entry)}`);
    }
  }

  if (failed.length > 0) {
    outputHuman('');
    outputHuman(bold('Failed'));
    for (const entry of failed) {
      outputHuman(`  ${red('✗')} ${formatEntry(entry)}`);
    }
  }

  outputHuman('');
  outputHuman(`${activeCount} active item(s)`);
}

export { queueCommand };
