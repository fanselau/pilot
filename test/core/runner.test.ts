import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all core module dependencies ──────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/QUEUE.md',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/queue-parser.js', () => ({
  parseQueueFile: vi.fn(),
  markEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/lock.js', () => ({
  withQueueLock: vi.fn(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('../../src/core/spawn.js', () => ({
  preSpawnChecks: vi.fn().mockResolvedValue(undefined),
  spawnSession: vi.fn(),
  truncateTitle: vi.fn((_p: string, _m: string, _a?: string) => 'test-title'),
}));

vi.mock('../../src/core/process.js', () => ({
  writePidFile: vi.fn().mockResolvedValue(undefined),
  removePidFile: vi.fn().mockResolvedValue(undefined),
  isProcessAlive: vi.fn(),
}));

vi.mock('../../src/core/postmortem.js', () => ({
  logPostmortem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/lifecycle.js', () => ({
  runLifecycleMode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '0', stderr: '', exitCode: 0 }),
}));

vi.mock('tree-kill', () => ({
  default: vi.fn((_pid: number, _signal: string, cb: () => void) => cb()),
}));

// Mock node:fs/promises — needed for checkExistingRunner and markEntryPending
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { parseQueueFile } from '../../src/core/queue-parser.js';
import { spawnSession } from '../../src/core/spawn.js';
import { isProcessAlive } from '../../src/core/process.js';
import { createRunner } from '../../src/core/runner.js';
import type { QueueEntry } from '../../src/core/types.js';

const mockedParseQueueFile = vi.mocked(parseQueueFile);
const mockedSpawnSession = vi.mocked(spawnSession);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('--once waits for launched jobs to complete before exiting', async () => {
    const pendingEntry: QueueEntry = {
      lineNum: 1,
      project: 'myproject',
      mode: 'run-command',
      args: 'quick fix something',
      status: 'pending',
    };

    // First call: return one pending entry
    // Subsequent calls: return empty (nothing more to launch)
    let scanCount = 0;
    mockedParseQueueFile.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) {
        return [pendingEntry];
      }
      return [];
    });

    // Mock spawnSession: returns a mock process with PID
    // Simulate exit event firing after a short delay
    const mockProcess = {
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'exit') {
          // Fire exit event after a short delay to simulate job completing
          setTimeout(() => cb(0), 50);
        }
      }),
      unref: vi.fn(),
    };
    mockedSpawnSession.mockResolvedValue({
      pid: 99999,
      process: mockProcess,
      title: 'test-title',
      logFile: '/tmp/test.log',
    });

    // isProcessAlive returns false — the process "died"
    // (exit event fires quickly, and by the time reap runs, process is gone)
    mockedIsProcessAlive.mockReturnValue(false);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
    });

    await runner.start();

    // Assert spawnSession was called (job was launched)
    expect(mockedSpawnSession).toHaveBeenCalledTimes(1);

    // Assert that isProcessAlive was called (reap checks the process)
    expect(mockedIsProcessAlive).toHaveBeenCalled();

    // The fact that start() resolved means it:
    // 1. Launched the job
    // 2. Found no more entries (--once scan complete)
    // 3. Waited in the wait-for-all block
    // 4. Reaped the completed job
    // 5. Exited cleanly
  }, 15000);

  it('run-command mode extracts command from args correctly', async () => {
    const runCommandEntry: QueueEntry = {
      lineNum: 1,
      project: 'myproject',
      mode: 'run-command',
      args: 'quick fix navbar',
      status: 'pending',
    };

    // First call: return the run-command entry
    // Subsequent calls: return empty
    let scanCount = 0;
    mockedParseQueueFile.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) {
        return [runCommandEntry];
      }
      return [];
    });

    // Mock spawnSession to capture the SpawnOptions passed to it
    const mockProcess = {
      on: vi.fn(),
      unref: vi.fn(),
    };
    mockedSpawnSession.mockResolvedValue({
      pid: 88888,
      process: mockProcess,
      title: 'test-title',
      logFile: '/tmp/test.log',
    });

    // Process dies immediately on first check
    mockedIsProcessAlive.mockReturnValue(false);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
    });

    await runner.start();

    // Assert spawnSession was called
    expect(mockedSpawnSession).toHaveBeenCalledTimes(1);

    // Extract the SpawnOptions passed to spawnSession
    const spawnArgs = mockedSpawnSession.mock.calls[0]![0];

    // run-command mode should extract 'quick' as the command
    expect(spawnArgs.command).toBe('quick');

    // The remaining args should be 'fix navbar'
    expect(spawnArgs.args).toBe('fix navbar');
  });

  it('run-command mode with single-word args uses it as command with no args', async () => {
    const runCommandEntry: QueueEntry = {
      lineNum: 1,
      project: 'myproject',
      mode: 'run-command',
      args: 'debug',
      status: 'pending',
    };

    let scanCount = 0;
    mockedParseQueueFile.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) {
        return [runCommandEntry];
      }
      return [];
    });

    const mockProcess = { on: vi.fn(), unref: vi.fn() };
    mockedSpawnSession.mockResolvedValue({
      pid: 77777,
      process: mockProcess,
      title: 'test-title',
      logFile: '/tmp/test.log',
    });

    mockedIsProcessAlive.mockReturnValue(false);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
    });

    await runner.start();

    expect(mockedSpawnSession).toHaveBeenCalledTimes(1);
    const spawnArgs = mockedSpawnSession.mock.calls[0]![0];

    // Single word: command = 'debug', args = undefined (empty string becomes undefined)
    expect(spawnArgs.command).toBe('debug');
    expect(spawnArgs.args).toBeUndefined();
  });
});
