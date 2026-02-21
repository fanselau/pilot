import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
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
  it('creates logs directory and writes structured [ISO] [LEVEL] lines', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir);

    logger.log('Runner started');
    logger.log('Scanning queue');

    const content = await readFile(logger.getPath(), 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(2);
    // New format: [YYYY-MM-DDTHH:MM:SS] [INFO] message
    expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\] \[INFO\] Runner started$/);
    expect(lines[1]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\] \[INFO\] Scanning queue$/);
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

describe('log levels', () => {
  it('has debug/info/warn/error methods', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir, 'DEBUG');

    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    const content = await readFile(logger.getPath(), 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('[DEBUG] debug msg');
    expect(lines[1]).toContain('[INFO] info msg');
    expect(lines[2]).toContain('[WARN] warn msg');
    expect(lines[3]).toContain('[ERROR] error msg');
  });

  it('filters below minimum level', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir, 'WARN');

    logger.debug('should be filtered');
    logger.info('should be filtered');
    logger.warn('should appear');
    logger.error('should appear');

    const content = await readFile(logger.getPath(), 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('[WARN] should appear');
    expect(lines[1]).toContain('[ERROR] should appear');
  });

  it('ERROR level only shows errors', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir, 'ERROR');

    logger.debug('no');
    logger.info('no');
    logger.warn('no');
    logger.error('yes');

    const content = await readFile(logger.getPath(), 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[ERROR] yes');
  });

  it('default level is INFO (filters DEBUG)', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir); // default = INFO

    logger.debug('filtered');
    logger.info('visible');

    const content = await readFile(logger.getPath(), 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[INFO] visible');
  });

  it('log() maps to info() for backward compat', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    const logger = createRunnerLogger(logsDir);

    logger.log('backward compat message');

    const content = await readFile(logger.getPath(), 'utf8');
    expect(content).toContain('[INFO] backward compat message');
  });
});

describe('size-based rotation', () => {
  it('rotates when file exceeds 10MB', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    // Create the logger
    const logger = createRunnerLogger(logsDir);
    const logPath = logger.getPath();

    // Pre-fill the file to just over 10MB
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 1);
    writeFileSync(logPath, bigContent);

    // Writing a new message should trigger rotation
    logger.info('post-rotation message');

    // The original file should now be rotated to .1
    const rotated = logPath + '.1';
    const rotatedExists = await stat(rotated).then(() => true).catch(() => false);
    expect(rotatedExists).toBe(true);

    // Current file should contain the new message
    const content = await readFile(logPath, 'utf8');
    expect(content).toContain('[INFO] post-rotation message');

    // Rotated file should contain the old big content
    const rotatedContent = await readFile(rotated, 'utf8');
    expect(rotatedContent.length).toBeGreaterThan(10 * 1024 * 1024);
  });

  it('cascades rotations: .1 → .2 → .3', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    const logger = createRunnerLogger(logsDir);
    const logPath = logger.getPath();

    // Create existing rotation files
    writeFileSync(logPath + '.1', 'rotation-1');
    writeFileSync(logPath + '.2', 'rotation-2');

    // Pre-fill main file over 10MB
    writeFileSync(logPath, 'x'.repeat(10 * 1024 * 1024 + 1));

    // Write triggers rotation cascade
    logger.info('new message');

    // .1 should now be the previous main file (big)
    const r1 = await readFile(logPath + '.1', 'utf8');
    expect(r1.length).toBeGreaterThan(10 * 1024 * 1024);

    // .2 should be old .1
    const r2 = await readFile(logPath + '.2', 'utf8');
    expect(r2).toBe('rotation-1');

    // .3 should be old .2
    const r3 = await readFile(logPath + '.3', 'utf8');
    expect(r3).toBe('rotation-2');

    // Current file has new message
    const content = await readFile(logPath, 'utf8');
    expect(content).toContain('[INFO] new message');
  });

  it('deletes .3 when rotating beyond max', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    const logger = createRunnerLogger(logsDir);
    const logPath = logger.getPath();

    // Create existing rotation files at max
    writeFileSync(logPath + '.1', 'rot-1');
    writeFileSync(logPath + '.2', 'rot-2');
    writeFileSync(logPath + '.3', 'rot-3-should-be-deleted');

    // Pre-fill main file over 10MB
    writeFileSync(logPath, 'x'.repeat(10 * 1024 * 1024 + 1));

    // Write triggers rotation — .3 should be deleted, everything shifts
    logger.info('fresh');

    // .3 should now be old .2 (not the original .3 which was deleted)
    const r3 = await readFile(logPath + '.3', 'utf8');
    expect(r3).toBe('rot-2');

    // .2 should be old .1
    const r2 = await readFile(logPath + '.2', 'utf8');
    expect(r2).toBe('rot-1');
  });

  it('does not rotate when under 10MB', async () => {
    const logsDir = path.join(tmpDir, 'logs');
    await mkdir(logsDir, { recursive: true });

    const logger = createRunnerLogger(logsDir);
    const logPath = logger.getPath();

    // Write some content (well under 10MB)
    writeFileSync(logPath, 'initial content\n');
    logger.info('another line');

    // No rotation files should exist
    const rotated = logPath + '.1';
    const exists = await stat(rotated).then(() => true).catch(() => false);
    expect(exists).toBe(false);

    // Content should be appended
    const content = await readFile(logPath, 'utf8');
    expect(content).toContain('initial content');
    expect(content).toContain('[INFO] another line');
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
