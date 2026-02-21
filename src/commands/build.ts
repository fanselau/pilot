/**
 * pilot build <project> <requirement-or-description> — Synchronous build.
 *
 * Queues work via addCommand (silently), then starts the queue runner
 * in-process with --once mode, blocking until the specific queued item
 * completes. Reports success/failure and exits.
 *
 * With --no-run: only queues (same as add).
 */

import { getConfig } from '../core/config.js';
import { getItemById } from '../core/queue-store.js';
import { createRunner } from '../core/runner.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { addCommand } from './add.js';
import { createRunnerLogger, rotateRunnerLogs } from '../core/runner-log.js';
import type { RunnerOptions, QueueJsonItem } from '../core/types.js';

export async function buildCommand(
  project: string,
  input: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  if (!input) {
    process.stderr.write('Error: Provide a requirements file or description\n');
    process.exit(2);
  }

  const config = getConfig();

  // Step 1: Queue the work via smart add (silent — suppress add's human output)
  const addResult = await addCommand(project, input, { ...opts, silent: true });

  if (addResult.dryRun || addResult.id === null) {
    if (isJsonMode()) {
      outputJson({ action: 'dry-run', ...addResult });
    } else {
      outputHuman(`Dry run — would queue:`);
      outputHuman(`  Project: ${project}`);
      outputHuman(`  Scope: ${addResult.scope}`);
      outputHuman(`  Mode: ${addResult.internalMode}`);
    }
    return;
  }

  // --no-run: only queue, don't start runner
  if (opts['run'] === false) {
    if (isJsonMode()) {
      outputJson({ action: 'queued', ...addResult });
    } else {
      outputHuman(`✓ Queued (${addResult.id}): ${project} | ${addResult.scope}`);
    }
    return;
  }

  // Step 2: Start runner in --once mode (in-process, blocks until drain)
  if (!isJsonMode()) {
    outputHuman('Building... (waiting for completion)');
  }

  const logger = createRunnerLogger();
  rotateRunnerLogs(7);

  const runnerOpts: RunnerOptions = {
    maxParallel: 5,
    maxRetries: 3,
    once: true,
    dryRun: false,
    force: true,
    pollInterval: config.pollInterval,
  };

  const runner = createRunner(runnerOpts);

  let itemResult: string | null = null;
  runner.on('complete', (item: QueueJsonItem, result: string) => {
    if (item.id === addResult.id) {
      itemResult = result;
    }
    logger.log(`Completed: ${item.project} (${result})`);
  });
  runner.on('error', (msg: string) => {
    logger.log(`Error: ${msg}`);
  });
  runner.on('launch', (item: QueueJsonItem, pid: number) => {
    logger.log(`Launching: ${item.project} | ${item.mode} (PID ${pid})`);
  });

  try {
    await runner.start();
  } catch (err) {
    logger.close();
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  logger.close();

  // Step 3: Check final status of our specific item
  if (itemResult === null) {
    const item = await getItemById(addResult.id);
    if (item !== null) {
      itemResult = item.status;
    } else {
      // Item moved to history — completed (success or fail)
      itemResult = 'completed (in history)';
    }
  }

  if (isJsonMode()) {
    outputJson({
      action: 'build',
      ...addResult,
      result: itemResult,
    });
  } else {
    if (itemResult === 'success' || itemResult === 'success_no_artifacts') {
      outputHuman(`✓ Build complete: ${project}`);
    } else if (itemResult === 'failed') {
      outputHuman(`✗ Build failed: ${project}`);
      process.exit(1);
    } else {
      outputHuman(`Build finished with status: ${itemResult}`);
    }
  }
}
