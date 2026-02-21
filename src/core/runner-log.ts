/**
 * Runner log writer with structured logging levels and size-based rotation.
 *
 * Writes structured log lines to ~/.pilot/logs/runner-YYYY-MM-DD.log.
 * Format: [YYYY-MM-DDTHH:MM:SS] [LEVEL] message
 *
 * Features:
 * - Log levels: DEBUG < INFO < WARN < ERROR (configurable minimum)
 * - Size-based rotation at 10MB with max 3 rotations (~40MB total)
 * - Date-based rotation deletes files older than `keepDays`
 * - Backward compat: log() maps to info()
 *
 * Pure core module — no UI dependencies.
 */

import { mkdirSync, appendFileSync, readdirSync, unlinkSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Types ──────────────────────────────────────────────────────────────────

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface RunnerLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  log(message: string): void;   // backward compat — same as info()
  getPath(): string;
  close(): void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(os.homedir(), '.pilot', 'logs');
const RUNNER_LOG_PREFIX = 'runner-';
const RUNNER_LOG_SUFFIX = '.log';

/** 10MB max log file size before rotation. */
const MAX_LOG_SIZE = 10 * 1024 * 1024;

/** Maximum number of rotated files to keep. */
const MAX_ROTATIONS = 3;

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format ISO-8601 local timestamp: YYYY-MM-DDTHH:MM:SS
 */
function formatTimestamp(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${min}:${s}`;
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

/**
 * Rotate log file by size: current → .log.1 → .log.2 → .log.3 (deleted).
 *
 * After rotation, the next appendFileSync creates a fresh file at logPath.
 */
function rotateBySize(logPath: string): void {
  try {
    // Delete oldest rotation if it exists
    const oldest = `${logPath}.${MAX_ROTATIONS}`;
    try { unlinkSync(oldest); } catch { /* may not exist */ }

    // Shift existing rotations: .2→.3, .1→.2
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      try { renameSync(from, to); } catch { /* may not exist */ }
    }

    // Move current log to .1
    try { renameSync(logPath, `${logPath}.1`); } catch { /* may not exist */ }
  } catch {
    // Best effort — rotation failure shouldn't crash anything
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a runner logger that writes to ~/.pilot/logs/runner-YYYY-MM-DD.log.
 *
 * Uses sync writes (appendFileSync) because runner log writes are infrequent
 * and small — no interleaving risk with sync approach.
 *
 * Log format: [YYYY-MM-DDTHH:MM:SS] [LEVEL] message
 *
 * @param logsDir - Override logs directory (for testing). Defaults to ~/.pilot/logs/
 * @param level - Minimum log level to write. Defaults to 'INFO'.
 */
function createRunnerLogger(logsDir: string = LOGS_DIR, level: LogLevel = 'INFO'): RunnerLogger {
  try {
    ensureLogsDir(logsDir);
  } catch {
    // Best effort — log writes will fail silently if dir can't be created
  }

  const date = formatDate(new Date());
  const logPath = path.join(logsDir, `${RUNNER_LOG_PREFIX}${date}${RUNNER_LOG_SUFFIX}`);
  const minLevel = LEVEL_ORDER[level];

  function writeLog(msgLevel: LogLevel, message: string): void {
    if (LEVEL_ORDER[msgLevel] < minLevel) return;

    // Check file size before writing — rotate if > MAX_LOG_SIZE
    try {
      const st = statSync(logPath);
      if (st.size > MAX_LOG_SIZE) {
        rotateBySize(logPath);
      }
    } catch {
      // File may not exist yet — that's fine
    }

    const ts = formatTimestamp(new Date());
    const line = `[${ts}] [${msgLevel}] ${message}\n`;
    try {
      appendFileSync(logPath, line, 'utf8');
    } catch {
      // Best effort — don't crash the runner over a log write failure
    }
  }

  return {
    debug(message: string): void {
      writeLog('DEBUG', message);
    },
    info(message: string): void {
      writeLog('INFO', message);
    },
    warn(message: string): void {
      writeLog('WARN', message);
    },
    error(message: string): void {
      writeLog('ERROR', message);
    },
    log(message: string): void {
      // Backward compat — maps to info()
      writeLog('INFO', message);
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
