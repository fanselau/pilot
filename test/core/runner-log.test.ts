import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createRunnerLogger,
  getRunnerLogPath,
  getLatestRunnerLogPath,
  rotateRunnerLogs,
} from '../../src/core/runner-log.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'pilot-runner-log-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('createRunnerLogger', () => {
  it('creates logs directory and writes timestamped lines', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir);

    logger.log('Runner started');
    logger.log('Scanning queue');

    const content = await readFile(logger.getPath(), 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(2);
    // Each line should have timestamp format [HH:MM:SS]
    expect(lines[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] Runner started$/);
    expect(lines[1]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] Scanning queue$/);
  });

  it('generates date-stamped filename', () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir);

    const logPath = logger.getPath();
    const filename = path.basename(logPath);

    // Should match runner-YYYY-MM-DD.log
    expect(filename).toMatch(/^runner-\d{4}-\d{2}-\d{2}\.log$/);
  });

  it('close is safe to call (no-op)', () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir);
    expect(() => logger.close()).not.toThrow();
  });

  it('silently handles write errors', () => {
    // Use a path that doesn't exist and can't be created
    const logger = createRunnerLogger('/nonexistent/deeply/nested/path');
    // Should not throw
    expect(() => logger.log('test message')).not.toThrow();
  });
});

describe('getRunnerLogPath', () => {
  it('returns path for today by default', () => {
    const logPath = getRunnerLogPath(undefined, tmpDir);
    const filename = path.basename(logPath);
    expect(filename).toMatch(/^runner-\d{4}-\d{2}-\d{2}\.log$/);
    expect(path.dirname(logPath)).toBe(tmpDir);
  });

  it('returns path for specific date', () => {
    const logPath = getRunnerLogPath('2026-01-15', tmpDir);
    expect(logPath).toBe(path.join(tmpDir, 'runner-2026-01-15.log'));
  });
});

describe('getLatestRunnerLogPath', () => {
  it('returns null when directory does not exist', () => {
    const result = getLatestRunnerLogPath(path.join(tmpDir, 'nonexistent'));
    expect(result).toBeNull();
  });

  it('returns null when no runner logs exist', async () => {
    const logsDir = path.join(tmpDir, 'empty-logs');
    await mkdir(logsDir, { recursive: true });
    const result = getLatestRunnerLogPath(logsDir);
    expect(result).toBeNull();
  });

  it('returns most recent log by filename date', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    // Create logs with different dates
    await writeFile(path.join(logsDir, 'runner-2026-02-18.log'), 'old');
    await writeFile(path.join(logsDir, 'runner-2026-02-20.log'), 'newest');
    await writeFile(path.join(logsDir, 'runner-2026-02-19.log'), 'middle');
    // Non-runner files should be ignored
    await writeFile(path.join(logsDir, 'other.log'), 'ignore');

    const result = getLatestRunnerLogPath(logsDir);
    expect(result).toBe(path.join(logsDir, 'runner-2026-02-20.log'));
  });

  it('ignores non-runner-log files', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    await writeFile(path.join(logsDir, 'something-else.log'), 'x');
    await writeFile(path.join(logsDir, 'runner-2026-02-20.log'), 'y');

    const result = getLatestRunnerLogPath(logsDir);
    expect(result).toBe(path.join(logsDir, 'runner-2026-02-20.log'));
  });
});

describe('rotateRunnerLogs', () => {
  it('deletes files older than keepDays', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    // Create log files with dates spanning 10 days ago to today
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      dates.push(dateStr);
      await writeFile(path.join(logsDir, `runner-${dateStr}.log`), `log ${i}`);
    }

    // Keep last 3 days (should delete files older than 3 days)
    const deleted = rotateRunnerLogs(3, logsDir);

    const remaining = await readdir(logsDir);
    const runnerLogs = remaining.filter((f) => f.startsWith('runner-'));

    // Should have kept 3 days (today, yesterday, day before)
    // Deleted = 10 - 3 = 7 (approximately, depending on exact cutoff)
    expect(deleted).toBeGreaterThanOrEqual(6);
    expect(runnerLogs.length).toBeLessThanOrEqual(4); // 3 days + possible edge case
  });

  it('keeps recent files', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    await writeFile(path.join(logsDir, `runner-${todayStr}.log`), 'today');

    const deleted = rotateRunnerLogs(7, logsDir);

    expect(deleted).toBe(0);
    const remaining = await readdir(logsDir);
    expect(remaining).toContain(`runner-${todayStr}.log`);
  });

  it('returns 0 when directory does not exist', () => {
    const deleted = rotateRunnerLogs(7, path.join(tmpDir, 'nonexistent'));
    expect(deleted).toBe(0);
  });

  it('ignores non-runner-log files', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    await writeFile(path.join(logsDir, 'other-file.log'), 'keep');
    await writeFile(path.join(logsDir, 'runner-2020-01-01.log'), 'old');

    const deleted = rotateRunnerLogs(7, logsDir);

    expect(deleted).toBe(1); // only the old runner log
    const remaining = await readdir(logsDir);
    expect(remaining).toContain('other-file.log');
    expect(remaining).not.toContain('runner-2020-01-01.log');
  });
});
