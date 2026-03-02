/**
 * `pilot reload` — Signal running daemon to reload after build.
 *
 * Reads ~/.pilot/daemon.pid, sends SIGHUP if daemon is alive.
 * Silent no-op if no daemon is running (exit 0, not an error).
 */

import { readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import { outputHuman, outputJson, isJsonMode } from '../util/output.js';
import { green } from '../util/colors.js';

async function reloadCommand(): Promise<void> {
  const config = getConfig();
  const pidFile = path.join(config.pilotDir, 'daemon.pid');

  // Try to read PID file
  let pidStr: string;
  try {
    pidStr = readFileSync(pidFile, 'utf8').trim();
  } catch {
    // No PID file — no daemon running
    if (isJsonMode()) {
      outputJson({ action: 'reload', pid: null, status: 'not_running' });
    } else {
      outputHuman('No daemon running (no PID file)');
    }
    return;
  }

  const pid = parseInt(pidStr, 10);
  if (Number.isNaN(pid)) {
    // Invalid PID file content — clean up
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    if (isJsonMode()) {
      outputJson({ action: 'reload', pid: null, status: 'not_running' });
    } else {
      outputHuman('Stale PID file removed (invalid content)');
    }
    return;
  }

  // Check if process is alive
  try {
    process.kill(pid, 0);
  } catch {
    // Process not alive — clean up stale PID file
    try { unlinkSync(pidFile); } catch { /* ignore */ }
    if (isJsonMode()) {
      outputJson({ action: 'reload', pid, status: 'not_running' });
    } else {
      outputHuman('Stale PID file removed (daemon not running)');
    }
    return;
  }

  // Process is alive — send SIGHUP
  process.kill(pid, 'SIGHUP');

  if (isJsonMode()) {
    outputJson({ action: 'reload', pid, status: 'signaled' });
  } else {
    outputHuman(`  ${green('✓')} Sent reload signal to daemon (PID ${pid})`);
  }
}

export { reloadCommand };
