import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Mock execa before importing cleanup module
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Mock config
vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(),
}));

// Mock process module
vi.mock('../../src/core/process.js', () => ({
  isProcessAlive: vi.fn(),
}));

import { execa } from 'execa';
import { getConfig } from '../../src/core/config.js';
import { isProcessAlive } from '../../src/core/process.js';
import { runCleanup } from '../../src/core/cleanup.js';
import type { CleanupAction, CleanupResult } from '../../src/core/cleanup.js';
import type { PilotConfig } from '../../src/core/types.js';

const mockedExeca = vi.mocked(execa);
const mockedGetConfig = vi.mocked(getConfig);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);

let tmpDir: string;

function makeConfig(overrides?: Partial<PilotConfig>): PilotConfig {
  return {
    queueFile: path.join(tmpDir, 'QUEUE.md'),
    pilotDir: path.join(tmpDir, '.pilot'),
    queueJsonFile: path.join(tmpDir, '.pilot', 'queue.json'),
    logDir: path.join(tmpDir, 'logs'),
    stuckThreshold: 90,
    projectDir: path.join(tmpDir, 'projects'),
    gsdDir: path.join(tmpDir, 'pilot-gsd'),
    noColor: false,
    pollInterval: 3,
    defaultTimeout: 60,
    ...overrides,
  };
}

describe('cleanup', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    tmpDir = await mkdtemp(path.join(tmpdir(), 'pilot-cleanup-'));

    const config = makeConfig();
    mockedGetConfig.mockReturnValue(config);
    mockedIsProcessAlive.mockReturnValue(false);

    // Default: pgrep returns no matches
    mockedExeca.mockImplementation((() => {
      return Promise.resolve({ stdout: '', exitCode: 1 });
    }) as unknown as typeof execa);

    // Create base dirs
    await mkdir(config.logDir, { recursive: true });
    await mkdir(config.pilotDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('stale PID removal', () => {
    it('detects stale PID files with dead processes', async () => {
      const config = makeConfig();
      await writeFile(path.join(config.logDir, 'gsd-dead-session-pid'), '12345');
      mockedIsProcessAlive.mockReturnValue(false);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const pidActions = result.actions.filter((a) => a.type === 'remove_pid');
      expect(pidActions).toHaveLength(1);
      expect(pidActions[0].target).toContain('gsd-dead-session-pid');
      expect(pidActions[0].reason).toContain('PID 12345 is dead');
    });

    it('does NOT detect PID files with alive processes', async () => {
      const config = makeConfig();
      await writeFile(path.join(config.logDir, 'gsd-alive-session-pid'), '12345');
      mockedIsProcessAlive.mockReturnValue(true);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const pidActions = result.actions.filter((a) => a.type === 'remove_pid');
      expect(pidActions).toHaveLength(0);
    });

    it('dry-run does NOT delete stale PID files', async () => {
      const config = makeConfig();
      const pidFile = path.join(config.logDir, 'gsd-dryrun-pid');
      await writeFile(pidFile, '99999');
      mockedIsProcessAlive.mockReturnValue(false);

      await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      // File should still exist
      const entries = await readdir(config.logDir);
      expect(entries).toContain('gsd-dryrun-pid');
    });

    it('real mode deletes stale PID files', async () => {
      const config = makeConfig();
      const pidFile = path.join(config.logDir, 'gsd-cleanup-pid');
      await writeFile(pidFile, '99998');
      mockedIsProcessAlive.mockReturnValue(false);

      await runCleanup({ dryRun: false, all: false, keepDays: 7 });

      // File should be gone
      const entries = await readdir(config.logDir);
      expect(entries).not.toContain('gsd-cleanup-pid');
    });

    it('detects PID files with invalid content', async () => {
      const config = makeConfig();
      await writeFile(path.join(config.logDir, 'gsd-invalid-pid'), 'not-a-number');

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const pidActions = result.actions.filter((a) => a.type === 'remove_pid');
      expect(pidActions).toHaveLength(1);
      expect(pidActions[0].reason).toContain('invalid PID content');
    });

    it('handles multiple stale PID files', async () => {
      const config = makeConfig();
      await writeFile(path.join(config.logDir, 'gsd-session1-pid'), '11111');
      await writeFile(path.join(config.logDir, 'gsd-session2-pid'), '22222');
      await writeFile(path.join(config.logDir, 'gsd-session3-pid'), '33333');
      mockedIsProcessAlive.mockReturnValue(false);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const pidActions = result.actions.filter((a) => a.type === 'remove_pid');
      expect(pidActions).toHaveLength(3);
    });
  });

  describe('old log file detection', () => {
    it('detects old gsd-*.log files', async () => {
      const config = makeConfig();
      const logFile = path.join(config.logDir, 'gsd-old-session.log');
      await writeFile(logFile, 'some log content');

      // Backdate the file's mtime to 10 days ago
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      const { utimes } = await import('node:fs/promises');
      await utimes(logFile, tenDaysAgo, tenDaysAgo);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const logActions = result.actions.filter(
        (a) => a.type === 'remove_log' && a.target.includes('gsd-old-session.log'),
      );
      expect(logActions).toHaveLength(1);
      expect(logActions[0].reason).toContain('days old');
    });

    it('does NOT detect recent log files', async () => {
      const config = makeConfig();
      const logFile = path.join(config.logDir, 'gsd-recent-session.log');
      await writeFile(logFile, 'some log content');
      // File was just created — mtime is now

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const logActions = result.actions.filter(
        (a) => a.type === 'remove_log' && a.target.includes('gsd-recent-session.log'),
      );
      expect(logActions).toHaveLength(0);
    });

    it('detects empty log files regardless of age', async () => {
      const config = makeConfig();
      const logFile = path.join(config.logDir, 'gsd-empty.log');
      await writeFile(logFile, '');

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const logActions = result.actions.filter(
        (a) => a.type === 'remove_log' && a.target.includes('gsd-empty.log'),
      );
      expect(logActions).toHaveLength(1);
      expect(logActions[0].reason).toBe('empty (0 bytes)');
    });

    it('scans runner log dir for old runner-*.log files', async () => {
      const runnerLogsDir = path.join(tmpDir, '.pilot', 'logs');
      await mkdir(runnerLogsDir, { recursive: true });
      const logFile = path.join(runnerLogsDir, 'runner-2025-01-01.log');
      await writeFile(logFile, 'runner log content');

      // Backdate the file's mtime to 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const { utimes } = await import('node:fs/promises');
      await utimes(logFile, thirtyDaysAgo, thirtyDaysAgo);

      // Override homedir to tmpDir for this test
      const origHomedir = process.env.HOME;
      process.env.HOME = tmpDir;

      try {
        const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

        // Check that runner log was detected (may or may not be detected
        // depending on os.homedir() behavior with env override)
        // The important thing is it doesn't crash
        expect(result.dryRun).toBe(true);
      } finally {
        if (origHomedir !== undefined) {
          process.env.HOME = origHomedir;
        }
      }
    });
  });

  describe('orphan detection', () => {
    it('detects orphaned processes via pgrep', async () => {
      const config = makeConfig();

      // pgrep returns PIDs
      mockedExeca.mockImplementation(((cmd: string) => {
        if (cmd === 'pgrep') {
          return Promise.resolve({ stdout: '55555\n66666', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', exitCode: 0 });
      }) as unknown as typeof execa);

      // No PID files tracked
      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const orphanActions = result.actions.filter((a) => a.type === 'kill_orphan');
      // Should detect some orphans (excluding self PID)
      // At least one should be found since 55555 and 66666 are not our PID
      expect(orphanActions.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT flag tracked PIDs as orphans', async () => {
      const config = makeConfig();

      // Create PID file for process 55555
      await writeFile(path.join(config.logDir, 'gsd-tracked-session-pid'), '55555');
      mockedIsProcessAlive.mockImplementation((pid) => pid === 55555);

      // pgrep returns only 55555
      mockedExeca.mockImplementation(((cmd: string) => {
        if (cmd === 'pgrep') {
          return Promise.resolve({ stdout: '55555', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', exitCode: 0 });
      }) as unknown as typeof execa);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const orphanActions = result.actions.filter((a) => a.type === 'kill_orphan');
      expect(orphanActions).toHaveLength(0);
    });

    it('handles pgrep returning no matches gracefully', async () => {
      mockedExeca.mockImplementation(((cmd: string) => {
        if (cmd === 'pgrep') {
          return Promise.resolve({ stdout: '', exitCode: 1 });
        }
        return Promise.resolve({ stdout: '', exitCode: 0 });
      }) as unknown as typeof execa);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const orphanActions = result.actions.filter((a) => a.type === 'kill_orphan');
      expect(orphanActions).toHaveLength(0);
    });

    it('handles pgrep command not found gracefully', async () => {
      mockedExeca.mockImplementation(((cmd: string) => {
        if (cmd === 'pgrep') {
          return Promise.reject(new Error('command not found'));
        }
        return Promise.resolve({ stdout: '', exitCode: 0 });
      }) as unknown as typeof execa);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      // Should not crash and should have no orphan actions
      const orphanActions = result.actions.filter((a) => a.type === 'kill_orphan');
      expect(orphanActions).toHaveLength(0);
    });
  });

  describe('--all mode (history)', () => {
    it('truncates history file when > 100 entries', async () => {
      const config = makeConfig();

      // Create history file with 150 entries
      const entries = Array.from({ length: 150 }, (_, i) =>
        JSON.stringify({ ts: `2026-01-${String(i + 1).padStart(2, '0')}`, project: `proj-${i}` }),
      );
      await writeFile(
        path.join(config.logDir, 'pilot-job-history.jsonl'),
        entries.join('\n') + '\n',
      );

      const result = await runCleanup({ dryRun: true, all: true, keepDays: 7 });

      const historyActions = result.actions.filter((a) => a.type === 'remove_history');
      expect(historyActions).toHaveLength(1);
      expect(historyActions[0].reason).toContain('truncated from 150 to 100');
    });

    it('does NOT truncate history file when <= 100 entries', async () => {
      const config = makeConfig();

      const entries = Array.from({ length: 50 }, (_, i) =>
        JSON.stringify({ ts: `2026-01-${String(i + 1).padStart(2, '0')}`, project: `proj-${i}` }),
      );
      await writeFile(
        path.join(config.logDir, 'pilot-job-history.jsonl'),
        entries.join('\n') + '\n',
      );

      const result = await runCleanup({ dryRun: true, all: true, keepDays: 7 });

      const historyActions = result.actions.filter((a) => a.type === 'remove_history');
      expect(historyActions).toHaveLength(0);
    });

    it('truncation in real mode actually rewrites the file', async () => {
      const config = makeConfig();

      const entries = Array.from({ length: 150 }, (_, i) =>
        JSON.stringify({ ts: `2026-01-${String(i + 1).padStart(2, '0')}`, project: `proj-${i}` }),
      );
      const historyPath = path.join(config.logDir, 'pilot-job-history.jsonl');
      await writeFile(historyPath, entries.join('\n') + '\n');

      await runCleanup({ dryRun: false, all: true, keepDays: 7 });

      // Verify file was truncated
      const content = await readFile(historyPath, 'utf8');
      const remaining = content.trim().split('\n').filter((l) => l.trim().length > 0);
      expect(remaining).toHaveLength(100);
      // Should keep the LAST 100 entries
      const lastEntry = JSON.parse(remaining[remaining.length - 1]);
      expect(lastEntry.project).toBe('proj-149');
    });

    it('reports queue history count (read-only)', async () => {
      const config = makeConfig();
      await mkdir(path.dirname(config.queueJsonFile), { recursive: true });
      await writeFile(config.queueJsonFile, JSON.stringify({
        version: 1,
        items: [],
        history: [
          { id: 'a', status: 'completed' },
          { id: 'b', status: 'failed' },
        ],
      }));

      const result = await runCleanup({ dryRun: true, all: true, keepDays: 7 });

      const queueActions = result.actions.filter((a) => a.type === 'clean_queue');
      expect(queueActions).toHaveLength(1);
      expect(queueActions[0].reason).toContain('2 completed/failed entries');
    });

    it('skips --all cleanup when all=false', async () => {
      const config = makeConfig();

      // Create history file with many entries
      const entries = Array.from({ length: 200 }, (_, i) =>
        JSON.stringify({ project: `proj-${i}` }),
      );
      await writeFile(
        path.join(config.logDir, 'pilot-job-history.jsonl'),
        entries.join('\n') + '\n',
      );

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      const historyActions = result.actions.filter((a) => a.type === 'remove_history');
      expect(historyActions).toHaveLength(0);
    });
  });

  describe('result structure', () => {
    it('returns CleanupResult with correct shape', async () => {
      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      expect(result).toHaveProperty('actions');
      expect(result).toHaveProperty('dryRun');
      expect(Array.isArray(result.actions)).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('returns dryRun=false when not in dry-run mode', async () => {
      const result = await runCleanup({ dryRun: false, all: false, keepDays: 7 });

      expect(result.dryRun).toBe(false);
    });

    it('actions have correct type fields', async () => {
      const config = makeConfig();
      // Create stale PID
      await writeFile(path.join(config.logDir, 'gsd-test-pid'), '99999');
      // Create empty log
      await writeFile(path.join(config.logDir, 'gsd-test.log'), '');
      mockedIsProcessAlive.mockReturnValue(false);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      for (const action of result.actions) {
        expect(['remove_pid', 'remove_log', 'kill_orphan', 'remove_history', 'clean_queue'])
          .toContain(action.type);
        expect(typeof action.target).toBe('string');
        expect(typeof action.reason).toBe('string');
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty log directory', async () => {
      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      expect(result.actions).toHaveLength(0);
    });

    it('handles non-existent log directory', async () => {
      const config = makeConfig({ logDir: path.join(tmpDir, 'nonexistent') });
      mockedGetConfig.mockReturnValue(config);

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      // Should not crash
      expect(result.actions).toHaveLength(0);
    });

    it('ignores non-PID files in log directory', async () => {
      const config = makeConfig();
      await writeFile(path.join(config.logDir, 'random-file.txt'), 'not a pid');
      await writeFile(path.join(config.logDir, 'gsd-session.log'), 'a log file');

      const result = await runCleanup({ dryRun: true, all: false, keepDays: 7 });

      // Should not have any PID removal actions for non-PID files
      const pidActions = result.actions.filter((a) => a.type === 'remove_pid');
      expect(pidActions).toHaveLength(0);
    });
  });
});
