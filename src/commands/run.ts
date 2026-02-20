/**
 * pilot run — Start queue runner.
 *
 * Creates and starts the queue runner state machine with parsed options.
 * Listens for runner events and formats human-readable output.
 * Handles --dry-run by collecting dry-run events and outputting as JSON.
 */

import { createRunner } from '../core/runner.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { getConfig } from '../core/config.js';
import type { RunnerOptions, QueueEntry } from '../core/types.js';

function formatTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

export async function runCommand(opts: Record<string, unknown>): Promise<void> {
  const config = getConfig();

  const runnerOpts: RunnerOptions = {
    maxParallel: parseInt(opts['maxParallel'] as string, 10) || 5,
    maxRetries: parseInt(opts['maxRetries'] as string, 10) || 3,
    once: opts['once'] === true,
    dryRun: opts['dryRun'] === true,
    force: opts['force'] === true,
  };

  const runner = createRunner(runnerOpts);

  // --dry-run with --json: collect results and output as JSON
  if (runnerOpts.dryRun && isJsonMode()) {
    const dryRunEntries: Array<{ project: string; mode: string; args: string }> = [];

    runner.on('dry-run', (entry: QueueEntry) => {
      dryRunEntries.push({
        project: entry.project,
        mode: entry.mode,
        args: entry.args,
      });
    });

    try {
      await runner.start();
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }

    outputJson({
      action: 'dry-run',
      entries: dryRunEntries,
    });
    return;
  }

  // Human-readable event listeners
  if (!isJsonMode()) {
    outputHuman(`Pilot Queue Runner started (PID: ${process.pid})`);
    outputHuman(`  max-parallel: ${runnerOpts.maxParallel}`);
    outputHuman(`  max-retries: ${runnerOpts.maxRetries}`);
    outputHuman(`  queue: ${config.queueFile}`);
    outputHuman('');
  }

  runner.on('scan', () => {
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Scanning queue...`);
    }
  });

  runner.on('launch', (entry: QueueEntry, pid: number) => {
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Launching: ${entry.project} | ${entry.mode} (PID ${pid})`);
    }
  });

  runner.on('dry-run', (entry: QueueEntry) => {
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Would launch: ${entry.project} | ${entry.mode}${entry.args ? ' | ' + entry.args : ''}`);
    }
  });

  runner.on('complete', (entry: QueueEntry, result: string) => {
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Completed: ${entry.project} (${result})`);
    }
  });

  runner.on('error', (message: string) => {
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Error: ${message}`);
    }
  });

  runner.on('shutdown', () => {
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Shutting down...`);
    }
  });

  // Start the runner
  try {
    await runner.start();
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  if (!isJsonMode()) {
    outputHuman(`[${formatTime()}] Queue empty, all jobs complete. Exiting.`);
  }
}
