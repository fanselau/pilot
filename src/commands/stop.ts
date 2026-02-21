/**
 * pilot stop — Stop queue runner.
 *
 * Reads the runner PID from gsd-pilot-runner-pid, sends SIGTERM, waits up
 * to 30s for clean exit.  With --force, sends SIGKILL via tree-kill after
 * timeout.
 */

import treeKill from 'tree-kill';
import { getConfig } from '../core/config.js';
import { readPidFile, removePidFile, isProcessAlive } from '../core/process.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';

/**
 * Wrap tree-kill callback API in a promise.
 */
function treeKillAsync(pid: number, signal: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    treeKill(pid, signal, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function stopCommand(opts: Record<string, unknown>): Promise<void> {
  void getConfig(); // validate config loads

  // Read runner PID file (gsd-pilot-runner-pid)
  const pid = await readPidFile('pilot-runner');

  if (pid === null || !isProcessAlive(pid)) {
    // Clean up stale PID file if it exists
    if (pid !== null) {
      await removePidFile('pilot-runner');
    }

    if (isJsonMode()) {
      outputJson({ status: 'not_running' });
    } else {
      outputHuman('Runner not running');
    }
    return;
  }

  // Send SIGTERM
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    process.stderr.write(`Error: Failed to send SIGTERM to PID ${pid}: ${String(err)}\n`);
    process.exit(1);
  }

  // Wait up to 30s for process to die (poll every 1s)
  const maxWait = 30;
  for (let i = 0; i < maxWait; i++) {
    await sleep(1000);
    if (!isProcessAlive(pid)) {
      break;
    }
  }

  // Check if still alive
  if (isProcessAlive(pid)) {
    if (opts['force'] === true) {
      // Force kill with tree-kill SIGKILL
      try {
        await treeKillAsync(pid, 'SIGKILL');
      } catch {
        // Process may have just died
      }
    } else {
      if (isJsonMode()) {
        outputJson({ status: 'timeout', pid, message: 'Runner still alive after 30s. Use --force to kill.' });
      } else {
        outputHuman(`Runner still alive after 30s. Use --force to kill.`);
      }
      process.exit(1);
    }
  }

  // Clean up PID file
  await removePidFile('pilot-runner');

  if (isJsonMode()) {
    outputJson({ status: 'stopped', pid });
  } else {
    outputHuman(`✓ Runner stopped (PID ${pid})`);
  }
}
