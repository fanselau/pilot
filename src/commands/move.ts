/**
 * pilot move <id> — Reorder a queued item in the queue.
 *
 * Requires at least one of --next, --before, --after.
 * Only works on items with status 'queued'.
 */

import { moveItem } from '../core/queue-store.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';

export async function moveCommand(
  id: string,
  opts: Record<string, unknown>,
): Promise<void> {
  const next = opts['next'] === true;
  const before = opts['before'] as string | undefined;
  const after = opts['after'] as string | undefined;

  if (!next && before === undefined && after === undefined) {
    process.stderr.write('Error: Specify --next, --before <id>, or --after <id>\n');
    process.exit(2);
  }

  try {
    await moveItem(id, { next: next || undefined, before, after });
  } catch (err) {
    if (isJsonMode()) {
      outputJson({
        action: 'move',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } else {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(1);
  }

  if (isJsonMode()) {
    outputJson({
      action: 'move',
      id,
      success: true,
      position: next ? 'next' : before ? `before:${before}` : `after:${after}`,
    });
  } else {
    const dest = next ? 'to front' : before ? `before ${before}` : `after ${after}`;
    outputHuman(`\u2713 Moved ${id} ${dest}`);
  }
}
