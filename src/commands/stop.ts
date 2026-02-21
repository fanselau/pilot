/**
 * pilot stop — Stop queue runner.
 *
 * Reads the runner PID from pilot-runner PID file, sends SIGTERM, waits up
 * to 15s for clean exit.  With --force, sends immediate SIGKILL via
 * tree-kill (no SIGTERM, no wait).
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

  // --force: immediate SIGKILL (no SIGTERM, no wait)
  if (opts['force'] === true) {
    try {
      await treeKillAsync(pid, 'SIGKILL');
    } catch {
      // Process may have already died
    }
    await removePidFile('pilot-runner');

    if (isJsonMode()) {
      outputJson({ status: 'force_killed', pid });
    } else {
      outputHuman(`✓ Runner force-killed (PID ${pid})`);
    }
    return;
  }

  // Normal: send SIGTERM, wait up to 15s for clean exit
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    process.stderr.write(`Error: Failed to send SIGTERM to PID ${pid}: ${String(err)}\n`);
    process.exit(1);
  }

  const maxWait = 15;
  for (let i = 0; i < maxWait; i++) {
    await sleep(1000);
    if (!isProcessAlive(pid)) {
      break;
    }
  }

  // If still alive after 15s, force kill
  if (isProcessAlive(pid)) {
    try {
      await treeKillAsync(pid, 'SIGKILL');
    } catch {
      // Process may have just died
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
