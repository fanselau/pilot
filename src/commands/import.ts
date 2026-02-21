/**
 * pilot import [file] — Import QUEUE.md into queue.json.
 *
 * One-time migration from markdown queue format to JSON.
 * Reads pending/running entries from QUEUE.md, adds them to queue.json.
 * Done/failed entries are added to history.
 */

import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';
import { parseQueueFile } from '../core/queue-parser.js';
import { addItem, loadQueue, saveQueue, ensurePilotDir } from '../core/queue-store.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import type { QueueHistoryItem } from '../core/types.js';

/**
 * Generate a short random ID (same as queue-store shortId).
 */
function shortId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    id += alphabet[b % alphabet.length];
  }
  return id;
}

export async function importCommand(
  file: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  void opts; // used via isJsonMode()
  const config = getConfig();
  const queueMdPath = file ?? config.queueFile;

  // Check QUEUE.md exists
  try {
    await access(queueMdPath);
  } catch {
    process.stderr.write(`Error: Queue file not found: ${queueMdPath}\n`);
    process.exit(1);
  }

  // Parse old format
  const entries = await parseQueueFile(queueMdPath);

  if (entries.length === 0) {
    if (isJsonMode()) {
      outputJson({ action: 'import', imported: 0, to_history: 0 });
    } else {
      outputHuman('No entries found in QUEUE.md');
    }
    return;
  }

  await ensurePilotDir();
  let imported = 0;
  let toHistory = 0;

  // Add pending/running entries as queued items
  for (const entry of entries) {
    if (entry.status === 'pending' || entry.status === 'running') {
      await addItem({
        project: entry.project,
        mode: entry.mode,
        description: entry.args || entry.description || '',
      });
      imported++;
    } else if (entry.status === 'done' || entry.status === 'failed') {
      // Add completed/failed to history directly
      const queue = await loadQueue();
      const now = new Date().toISOString();
      const historyItem: QueueHistoryItem = {
        id: shortId(),
        project: entry.project,
        mode: entry.mode,
        description: entry.args || entry.description || '',
        status: entry.status === 'done' ? 'completed' : 'failed',
        addedAt: now,
        startedAt: now,
        completedAt: now,
        phase: null,
        attempts: 1,
        maxAttempts: 3,
        dependsOn: null,
        error: entry.status === 'failed' ? 'Imported from QUEUE.md' : null,
        meta: {},
        duration: 0,
      };
      queue.history.push(historyItem);
      // Cap history at 100
      if (queue.history.length > 100) {
        queue.history = queue.history.slice(-100);
      }
      await saveQueue(queue);
      toHistory++;
    }
  }

  if (isJsonMode()) {
    outputJson({ action: 'import', imported, to_history: toHistory });
  } else {
    outputHuman(`✓ Imported ${imported} active item(s), ${toHistory} to history`);
    outputHuman(`  Source: ${queueMdPath}`);
    outputHuman(`  Target: ${config.queueJsonFile}`);
  }
}
