/**
 * pilot tail <session> — Live-follow session log file.
 *
 * Uses native fs.watch + read stream to follow a log file in real-time.
 * Does NOT shell out to `tail -f`.
 */

import { stat, access, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../core/config.js';

interface TailOpts {
  json?: boolean;
}

async function tailCommand(session: string, opts: TailOpts): Promise<void> {
  void opts;
  const config = getConfig();

  // Resolve log file path
  const logPath = path.join(config.logDir, `gsd-${session}.log`);

  // Check file exists
  try {
    await access(logPath);
  } catch {
    process.stderr.write(`Error: Log file not found: ${logPath}\n`);
    process.exit(1);
  }

  // Get initial file size (start following from end)
  const fileStat = await stat(logPath);
  let position = fileStat.size;

  process.stdout.write(`Following: ${logPath}\n`);

  // Set up file watcher
  let watcher: FSWatcher | null = null;

  const readNewContent = async (): Promise<void> => {
    try {
      const currentStat = await stat(logPath);
      if (currentStat.size <= position) {
        // File truncated or no new data
        if (currentStat.size < position) {
          position = 0; // Reset if truncated
        }
        return;
      }

      const stream = createReadStream(logPath, {
        start: position,
        encoding: 'utf8',
      });

      for await (const chunk of stream) {
        process.stdout.write(chunk as string);
      }

      position = currentStat.size;
    } catch {
      // File may have been deleted or moved
    }
  };

  watcher = watch(logPath, { persistent: true }, (_eventType) => {
    void readNewContent();
  });

  // Also poll periodically as fs.watch can miss events on some systems
  const pollInterval = setInterval(() => {
    void readNewContent();
  }, 1000);

  // Handle clean Ctrl-C exit
  const cleanup = (): void => {
    process.stdout.write(`\nStopped following: ${session}\n`);
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    clearInterval(pollInterval);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

export { tailCommand };
