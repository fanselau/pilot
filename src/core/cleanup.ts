/**
 * Cleanup logic: stale PIDs, old logs, orphaned processes.
 *
 * Powers `pilot cleanup` by detecting and removing accumulated cruft
 * that degrades operations over time. Supports dry-run mode for safety.
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, readdir, unlink, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { getConfig } from './config.js';
import { isProcessAlive } from './process.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface CleanupOptions {
  dryRun: boolean;
  all: boolean;           // aggressive: also clean history, old queue entries
  keepDays: number;       // default 7
}

interface CleanupAction {
  type: 'remove_pid' | 'remove_log' | 'kill_orphan' | 'remove_history' | 'clean_queue';
  target: string;         // file path or PID
  reason: string;         // why this was cleaned
}

interface CleanupResult {
  actions: CleanupAction[];   // what was (or would be) done
  dryRun: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / msPerDay);
}

// ── Cleanup steps ─────────────────────────────────────────────────────────

/**
 * Find and remove stale PID files (process is dead).
 */
async function cleanStalePids(
  logDir: string,
  dryRun: boolean,
): Promise<CleanupAction[]> {
  const actions: CleanupAction[] = [];

  let entries: string[];
  try {
    entries = await readdir(logDir);
  } catch {
    return actions;
  }

  const pidFiles = entries.filter(
    (name) => name.startsWith('gsd-') && name.endsWith('-pid'),
  );

  for (const filename of pidFiles) {
    const filePath = path.join(logDir, filename);

    try {
      const content = await readFile(filePath, 'utf8');
      const pid = parseInt(content.trim(), 10);

      if (Number.isNaN(pid) || pid <= 0 || !isProcessAlive(pid)) {
        actions.push({
          type: 'remove_pid',
          target: filePath,
          reason: Number.isNaN(pid) || pid <= 0
            ? 'invalid PID content'
            : `PID ${pid} is dead`,
        });
        if (!dryRun) {
          try {
            await unlink(filePath);
          } catch {
            // Best effort
          }
        }
      }
    } catch {
      // Unreadable file — treat as stale
      actions.push({
        type: 'remove_pid',
        target: filePath,
        reason: 'unreadable PID file',
      });
      if (!dryRun) {
        try {
          await unlink(filePath);
        } catch {
          // Best effort
        }
      }
    }
  }

  return actions;
}

/**
 * Find and remove old/empty log files.
 * Scans both $PILOT_LOG_DIR (gsd-*.log) and ~/.pilot/logs/ (runner-*.log).
 */
async function cleanOldLogs(
  logDir: string,
  keepDays: number,
  dryRun: boolean,
): Promise<CleanupAction[]> {
  const actions: CleanupAction[] = [];
  const now = new Date();

  // Scan gsd-*.log in $PILOT_LOG_DIR
  await scanLogDir(logDir, 'gsd-', '.log', keepDays, dryRun, now, actions);

  // Scan runner-*.log in ~/.pilot/logs/
  const runnerLogsDir = path.join(os.homedir(), '.pilot', 'logs');
  await scanLogDir(runnerLogsDir, 'runner-', '.log', keepDays, dryRun, now, actions);

  return actions;
}

async function scanLogDir(
  dir: string,
  prefix: string,
  suffix: string,
  keepDays: number,
  dryRun: boolean,
  now: Date,
  actions: CleanupAction[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  const logFiles = entries.filter(
    (name) => name.startsWith(prefix) && name.endsWith(suffix),
  );

  for (const filename of logFiles) {
    const filePath = path.join(dir, filename);

    try {
      const fileStat = await stat(filePath);

      // Empty files
      if (fileStat.size === 0) {
        actions.push({
          type: 'remove_log',
          target: filePath,
          reason: 'empty (0 bytes)',
        });
        if (!dryRun) {
          try {
            await unlink(filePath);
          } catch {
            // Best effort
          }
        }
        continue;
      }

      // Old files
      const ageDays = daysBetween(fileStat.mtime, now);
      if (ageDays > keepDays) {
        actions.push({
          type: 'remove_log',
          target: filePath,
          reason: `${ageDays} days old`,
        });
        if (!dryRun) {
          try {
            await unlink(filePath);
          } catch {
            // Best effort
          }
        }
      }
    } catch {
      // Can't stat — skip
    }
  }
}

/**
 * Find orphaned AI processes (running but not tracked by PID files).
 */
async function cleanOrphans(
  logDir: string,
  dryRun: boolean,
): Promise<CleanupAction[]> {
  const actions: CleanupAction[] = [];

  // Get tracked PIDs from PID files
  const trackedPids = new Set<number>();
  try {
    const entries = await readdir(logDir);
    const pidFiles = entries.filter(
      (name) => name.startsWith('gsd-') && name.endsWith('-pid'),
    );

    for (const filename of pidFiles) {
      try {
        const content = await readFile(path.join(logDir, filename), 'utf8');
        const pid = parseInt(content.trim(), 10);
        if (!Number.isNaN(pid) && pid > 0) {
          trackedPids.add(pid);
        }
      } catch {
        // Skip unreadable
      }
    }
  } catch {
    // Can't read dir — skip orphan detection
    return actions;
  }

  // Find running AI processes via pgrep
  let runningPids: number[] = [];
  try {
    const result = await execa('pgrep', ['-f', 'opencode|claude'], {
      reject: false,
      timeout: 5000,
    });
    if (result.stdout.trim().length > 0) {
      runningPids = result.stdout
        .trim()
        .split('\n')
        .map((line) => parseInt(line.trim(), 10))
        .filter((pid) => !Number.isNaN(pid) && pid > 0);
    }
  } catch {
    // pgrep not available or no matches — that's fine
    return actions;
  }

  // Exclude our own PID and parent PID (we're running opencode-related commands)
  const selfPid = process.pid;
  const parentPid = process.ppid;

  for (const pid of runningPids) {
    if (pid === selfPid || pid === parentPid) continue;
    if (!trackedPids.has(pid)) {
      actions.push({
        type: 'kill_orphan',
        target: String(pid),
        reason: 'not tracked by any PID file',
      });
      if (!dryRun) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Process may have already exited
        }
      }
    }
  }

  return actions;
}

/**
 * Aggressive cleanup: truncate old job history.
 */
async function cleanHistory(
  keepDays: number,
  dryRun: boolean,
): Promise<CleanupAction[]> {
  const actions: CleanupAction[] = [];
  const config = getConfig();

  // Truncate pilot-job-history.jsonl
  const historyPath = path.join(config.logDir, 'pilot-job-history.jsonl');
  try {
    const content = await readFile(historyPath, 'utf8');
    const lines = content.trim().split('\n').filter((l) => l.trim().length > 0);

    if (lines.length > 100) {
      const kept = lines.slice(-100);
      actions.push({
        type: 'remove_history',
        target: historyPath,
        reason: `truncated from ${lines.length} to 100 entries`,
      });
      if (!dryRun) {
        await writeFile(historyPath, kept.join('\n') + '\n', 'utf8');
      }
    }
  } catch {
    // File doesn't exist or unreadable — skip
  }

  // Report done/failed queue entry count (read-only, no modification)
  try {
    const queueContent = await readFile(config.queueJsonFile, 'utf8');
    const queueData = JSON.parse(queueContent) as { history?: unknown[] };
    const historyCount = Array.isArray(queueData.history) ? queueData.history.length : 0;
    if (historyCount > 0) {
      actions.push({
        type: 'clean_queue',
        target: config.queueJsonFile,
        reason: `${historyCount} completed/failed entries in history (report only)`,
      });
    }
  } catch {
    // No queue file or invalid — skip
  }

  return actions;
}

// ── Main API ──────────────────────────────────────────────────────────────

/**
 * Run cleanup: detect and remove stale PIDs, old logs, orphaned processes.
 *
 * @param options - Cleanup configuration
 * @returns Actions taken (or that would be taken in dry-run mode)
 */
async function runCleanup(options: CleanupOptions): Promise<CleanupResult> {
  const config = getConfig();
  const { dryRun, all, keepDays } = options;
  const actions: CleanupAction[] = [];

  // 1. Stale PID files
  actions.push(...await cleanStalePids(config.logDir, dryRun));

  // 2. Old/empty log files
  actions.push(...await cleanOldLogs(config.logDir, keepDays, dryRun));

  // 3. Orphaned processes
  actions.push(...await cleanOrphans(config.logDir, dryRun));

  // 4. Aggressive mode
  if (all) {
    actions.push(...await cleanHistory(keepDays, dryRun));
  }

  return { actions, dryRun };
}

export { runCleanup };
export type { CleanupOptions, CleanupAction, CleanupResult };
