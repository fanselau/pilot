/**
 * pilot run — Start queue runner.
 *
 * Creates and starts the queue runner state machine with parsed options.
 * Listens for runner events and formats human-readable output.
 * Handles --dry-run by collecting dry-run events and outputting as JSON.
 * Writes its own log to ~/.pilot/logs/runner-YYYY-MM-DD.log.
 * Sends webhook notifications on complete/fail events.
 */

import { createRunner } from '../core/runner.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { getConfig } from '../core/config.js';
import { createRunnerLogger, rotateRunnerLogs } from '../core/runner-log.js';
import { loadNotificationConfig, sendNotification } from '../core/notifications.js';
import type { RunnerOptions, QueueJsonItem } from '../core/types.js';
import type { NotificationConfig } from '../core/notifications.js';

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
    pollInterval: config.pollInterval,
  };

  // ── Runner log setup ────────────────────────────────────────────────
  const logger = createRunnerLogger();
  rotateRunnerLogs(7);
  logger.log(`Runner starting (PID: ${process.pid})`);
  logger.log(`  max-parallel: ${runnerOpts.maxParallel}, max-retries: ${runnerOpts.maxRetries}`);

  // ── Notification config ─────────────────────────────────────────────
  const isNotify = opts['notify'] === true;
  const isQuiet = opts['quiet'] === true;

  let notifConfig: NotificationConfig | null = null;
  if (!isQuiet) {
    notifConfig = await loadNotificationConfig();
    if (isNotify && notifConfig === null) {
      // --notify without config file: create minimal enabled config (no webhook → logs only)
      notifConfig = { enabled: true, on: ['complete', 'fail', 'stuck'], webhook: undefined };
    }
  }

  const runner = createRunner(runnerOpts);

  // --dry-run with --json: collect results and output as JSON
  if (runnerOpts.dryRun && isJsonMode()) {
    const dryRunEntries: Array<{ project: string; mode: string; args: string }> = [];

    runner.on('dry-run', (item: QueueJsonItem) => {
      dryRunEntries.push({
        project: item.project,
        mode: item.mode,
        args: item.description,
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
    outputHuman(`  log: ${logger.getPath()}`);
    outputHuman('');
  }

  runner.on('scan', () => {
    logger.log('Scanning queue...');
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Scanning queue...`);
    }
  });

  runner.on('launch', (item: QueueJsonItem, pid: number) => {
    const msg = `Launching: ${item.project} | ${item.mode} (PID ${pid})`;
    logger.log(msg);
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] ${msg}`);
    }
  });

  runner.on('dry-run', (item: QueueJsonItem) => {
    const msg = `Would launch: ${item.project} | ${item.mode}${item.description ? ' | ' + item.description : ''}`;
    logger.log(msg);
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] ${msg}`);
    }
  });

  runner.on('complete', (item: QueueJsonItem, result: string) => {
    const msg = `Completed: ${item.project} (${result})`;
    logger.log(msg);
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] ${msg}`);
    }

    // Send notification on complete
    if (notifConfig !== null) {
      void sendNotification(notifConfig, {
        event: 'complete',
        project: item.project,
        title: item.description || item.mode,
      });
    }
  });

  runner.on('error', (message: string) => {
    logger.log(`Error: ${message}`);
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Error: ${message}`);
    }

    // Send notification on fail (errors indicate job failures)
    if (notifConfig !== null) {
      void sendNotification(notifConfig, {
        event: 'fail',
        project: 'runner',
        title: 'queue-runner',
        error: message,
      });
    }
  });

  runner.on('idle', () => {
    const msg = 'Watching for new queue entries...';
    logger.log(msg);
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] ${msg}`);
    }
  });

  runner.on('shutdown', () => {
    logger.log('Shutting down...');
    if (!isJsonMode()) {
      outputHuman(`[${formatTime()}] Shutting down...`);
    }
  });

  // Start the runner
  try {
    await runner.start();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.log(`Fatal error: ${errMsg}`);
    process.stderr.write(`Error: ${errMsg}\n`);
    process.exit(1);
  }

  const exitMsg = 'Queue empty, all jobs complete. Exiting.';
  logger.log(exitMsg);
  logger.close();

  if (!isJsonMode()) {
    outputHuman(`[${formatTime()}] ${exitMsg}`);
  }
}
