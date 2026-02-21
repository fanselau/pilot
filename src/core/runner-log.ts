/**
 * Runner log writer with date-based rotation.
 *
 * Writes timestamped log lines to ~/.pilot/logs/runner-YYYY-MM-DD.log.
 * Rotation deletes files older than `keepDays` based on filename date
 * (deterministic, not mtime).
 *
 * Pure core module — no UI dependencies.
 */

import { mkdirSync, appendFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunnerLogger {
  log(message: string): void;
  getPath(): string;
  close(): void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(os.homedir(), '.pilot', 'logs');
const RUNNER_LOG_PREFIX = 'runner-';
const RUNNER_LOG_SUFFIX = '.log';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimestamp(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${min}:${s}`;
}

function ensureLogsDir(logsDir: string = LOGS_DIR): void {
  mkdirSync(logsDir, { recursive: true });
}

/**
 * Parse date string from runner log filename.
 * Returns null if filename doesn't match pattern.
 */
function parseDateFromFilename(filename: string): Date | null {
  const match = filename.match(/^runner-(\d{4})-(\d{2})-(\d{2})\.log$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a runner logger that writes to ~/.pilot/logs/runner-YYYY-MM-DD.log.
 *
 * Uses sync writes (appendFileSync) because runner log writes are infrequent
 * and small — no interleaving risk with sync approach.
 *
 * @param logsDir - Override logs directory (for testing). Defaults to ~/.pilot/logs/
 */
function createRunnerLogger(logsDir: string = LOGS_DIR): RunnerLogger {
  try {
    ensureLogsDir(logsDir);
  } catch {
    // Best effort — log writes will fail silently if dir can't be created
  }

  const date = formatDate(new Date());
  const logPath = path.join(logsDir, `${RUNNER_LOG_PREFIX}${date}${RUNNER_LOG_SUFFIX}`);

  return {
    log(message: string): void {
      const ts = formatTimestamp(new Date());
      const line = `[${ts}] ${message}\n`;
      try {
        appendFileSync(logPath, line, 'utf8');
      } catch {
        // Best effort — don't crash the runner over a log write failure
      }
    },
    getPath(): string {
      return logPath;
    },
    close(): void {
      // No-op for sync writes — nothing to flush or close
    },
  };
}

/**
 * Get the path to the runner log for a specific date.
 *
 * @param date - Date string in YYYY-MM-DD format. Defaults to today.
 * @param logsDir - Override logs directory (for testing).
 */
function getRunnerLogPath(date?: string, logsDir: string = LOGS_DIR): string {
  const dateStr = date ?? formatDate(new Date());
  return path.join(logsDir, `${RUNNER_LOG_PREFIX}${dateStr}${RUNNER_LOG_SUFFIX}`);
}

/**
 * Find the most recent runner log file by scanning the logs directory
 * and sorting by date in filename.
 *
 * Returns null if no runner logs exist.
 *
 * @param logsDir - Override logs directory (for testing).
 */
function getLatestRunnerLogPath(logsDir: string = LOGS_DIR): string | null {
  let entries: string[];
  try {
    entries = readdirSync(logsDir);
  } catch {
    return null;
  }

  const logFiles = entries
    .filter((f) => f.startsWith(RUNNER_LOG_PREFIX) && f.endsWith(RUNNER_LOG_SUFFIX))
    .sort()
    .reverse(); // Most recent date first (lexicographic sort works for YYYY-MM-DD)

  if (logFiles.length === 0) return null;

  return path.join(logsDir, logFiles[0]);
}

/**
 * Delete runner log files older than `keepDays` days.
 *
 * Uses filename date for comparison (deterministic, not mtime).
 *
 * @param keepDays - Number of days to keep. Defaults to 7.
 * @param logsDir - Override logs directory (for testing).
 * @returns Number of files deleted.
 */
function rotateRunnerLogs(keepDays: number = 7, logsDir: string = LOGS_DIR): number {
  let entries: string[];
  try {
    entries = readdirSync(logsDir);
  } catch {
    return 0;
  }

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays);
  let deleted = 0;

  for (const filename of entries) {
    const fileDate = parseDateFromFilename(filename);
    if (fileDate === null) continue;

    if (fileDate < cutoff) {
      try {
        unlinkSync(path.join(logsDir, filename));
        deleted++;
      } catch {
        // Best effort — skip files we can't delete
      }
    }
  }

  return deleted;
}

export { createRunnerLogger, getRunnerLogPath, getLatestRunnerLogPath, rotateRunnerLogs };
