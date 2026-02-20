/**
 * PID file management and process introspection.
 *
 * Manages the PID file lifecycle that tracks running sessions.
 * PID files use the `gsd-` prefix for backward compatibility with
 * existing bash tooling: `${logDir}/gsd-${session}-pid`
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from './config.js';

/**
 * Read a PID from a session's PID file.
 * Returns null if the file doesn't exist or content isn't a valid number.
 */
async function readPidFile(session: string): Promise<number | null> {
  const config = getConfig();
  const pidPath = path.join(config.logDir, `gsd-${session}-pid`);

  try {
    const content = await readFile(pidPath, 'utf8');
    const pid = parseInt(content.trim(), 10);
    if (Number.isNaN(pid) || pid <= 0) {
      return null;
    }
    return pid;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Write a PID to a session's PID file.
 */
async function writePidFile(session: string, pid: number): Promise<void> {
  const config = getConfig();
  const pidPath = path.join(config.logDir, `gsd-${session}-pid`);
  await writeFile(pidPath, String(pid), 'utf8');
}

/**
 * Remove a session's PID file.
 * Silently ignores if the file doesn't exist (ENOENT).
 */
async function removePidFile(session: string): Promise<void> {
  const config = getConfig();
  const pidPath = path.join(config.logDir, `gsd-${session}-pid`);

  try {
    await unlink(pidPath);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

/**
 * Scan the log directory for PID files and return entries with alive processes.
 *
 * Reads all `gsd-*-pid` files, extracts session names, verifies each PID is
 * alive, and returns only the living ones.
 */
async function scanPidFiles(): Promise<Array<{ session: string; pid: number }>> {
  const config = getConfig();
  const results: Array<{ session: string; pid: number }> = [];

  let entries: string[];
  try {
    entries = await readdir(config.logDir);
  } catch {
    return results;
  }

  const pidFiles = entries.filter(
    (name) => name.startsWith('gsd-') && name.endsWith('-pid'),
  );

  for (const filename of pidFiles) {
    // Extract session name: gsd-{session}-pid → {session}
    const session = filename.slice(4, -4); // Remove 'gsd-' prefix and '-pid' suffix
    if (session.length === 0) {
      continue;
    }

    try {
      const content = await readFile(path.join(config.logDir, filename), 'utf8');
      const pid = parseInt(content.trim(), 10);
      if (Number.isNaN(pid) || pid <= 0) {
        continue;
      }
      if (isProcessAlive(pid)) {
        results.push({ session, pid });
      }
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  return results;
}

/**
 * Check if a process is alive using kill(pid, 0).
 *
 * Returns true if:
 *   - No error (process exists and we can signal it)
 *   - EPERM error (process exists but we lack permission to signal it)
 * Returns false if:
 *   - ESRCH error (no such process)
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err) {
      const errno = err as NodeJS.ErrnoException;
      // EPERM = permission denied → process exists, can't signal
      if (errno.code === 'EPERM') {
        return true;
      }
    }
    return false;
  }
}

/**
 * Get the runtime of a process in seconds by reading /proc.
 *
 * Reads /proc/{pid}/stat (field 22, 0-indexed 21 = starttime in clock ticks)
 * and /proc/uptime (system uptime in seconds).
 *
 * Calculates: runtime = system_uptime - (starttime / CLK_TCK)
 * CLK_TCK = 100 on Linux (standard sysconf(_SC_CLK_TCK) value).
 *
 * Returns null if /proc files are unreadable (e.g., non-Linux, process gone).
 */
async function getProcessRuntime(pid: number): Promise<number | null> {
  const CLK_TCK = 100;

  try {
    const [statContent, uptimeContent] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf8'),
      readFile('/proc/uptime', 'utf8'),
    ]);

    // /proc/pid/stat has fields separated by spaces. Field 22 (1-indexed) is starttime.
    // But the comm field (field 2) can contain spaces and is wrapped in parens.
    // Safe parse: find the closing paren, then split remaining fields.
    const closeParenIdx = statContent.lastIndexOf(')');
    if (closeParenIdx === -1) {
      return null;
    }
    const afterComm = statContent.slice(closeParenIdx + 2); // Skip ') '
    const fields = afterComm.split(' ');
    // After comm, fields start at index 0 = state (field 3 in 1-indexed)
    // starttime is field 22 (1-indexed) = index 19 after comm (22 - 3 = 19)
    const starttime = parseInt(fields[19], 10);
    if (Number.isNaN(starttime)) {
      return null;
    }

    // /proc/uptime: first field is system uptime in seconds (floating point)
    const systemUptime = parseFloat(uptimeContent.split(' ')[0]);
    if (Number.isNaN(systemUptime)) {
      return null;
    }

    const runtime = systemUptime - starttime / CLK_TCK;
    return Math.max(0, Math.round(runtime));
  } catch {
    return null;
  }
}

export {
  readPidFile,
  writePidFile,
  removePidFile,
  scanPidFiles,
  isProcessAlive,
  getProcessRuntime,
};
