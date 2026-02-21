import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all core module dependencies ──────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/QUEUE.md',
    pilotDir: '/tmp/.pilot',
    queueJsonFile: '/tmp/.pilot/queue.json',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/queue-store.js', () => ({
  findLaunchable: vi.fn(),
  markRunning: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markQueued: vi.fn().mockResolvedValue(undefined),
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

// Mock node:fs/promises — needed for checkExistingRunner
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { findLaunchable, markRunning, markCompleted, markQueued } from '../../src/core/queue-store.js';
import { spawnSession } from '../../src/core/spawn.js';
import { isProcessAlive } from '../../src/core/process.js';
import { createRunner } from '../../src/core/runner.js';
import type { QueueJsonItem } from '../../src/core/types.js';

const mockedFindLaunchable = vi.mocked(findLaunchable);
const mockedMarkRunning = vi.mocked(markRunning);
const mockedMarkCompleted = vi.mocked(markCompleted);
const mockedMarkQueued = vi.mocked(markQueued);
const mockedSpawnSession = vi.mocked(spawnSession);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);

// ── Helper: create a mock QueueJsonItem ────────────────────────────────────

function makeItem(overrides: Partial<QueueJsonItem> = {}): QueueJsonItem {
  return {
    id: 'test-id-1234',
    project: 'myproject',
    mode: 'run-command',
    description: 'quick fix something',
    status: 'queued',
    addedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    phase: null,
    attempts: 0,
    maxAttempts: 3,
    dependsOn: null,
    error: null,
    meta: {},
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('--once waits for launched jobs to complete before exiting', async () => {
    const item = makeItem();

    // First call: return the item (launchable)
    // Subsequent calls: return null (nothing more to launch)
    let scanCount = 0;
    mockedFindLaunchable.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) {
        return item;
      }
      return null;
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
    mockedIsProcessAlive.mockReturnValue(false);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
    });

    await runner.start();

    // Assert markRunning was called with the item ID
    expect(mockedMarkRunning).toHaveBeenCalledWith('test-id-1234');

    // Assert spawnSession was called (job was launched)
    expect(mockedSpawnSession).toHaveBeenCalledTimes(1);

    // Assert that isProcessAlive was called (reap checks the process)
    expect(mockedIsProcessAlive).toHaveBeenCalled();

    // Assert markCompleted was called (job completed successfully with exit 0)
    expect(mockedMarkCompleted).toHaveBeenCalledWith('test-id-1234');
  }, 15000);

  it('run-command mode extracts command from description correctly', async () => {
    const item = makeItem({
      mode: 'run-command',
      description: 'quick fix navbar',
    });

    let scanCount = 0;
    mockedFindLaunchable.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return item;
      return null;
    });

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

    // run-command mode should extract 'quick' as the command from description
    expect(spawnArgs.command).toBe('quick');
    expect(spawnArgs.args).toBe('fix navbar');
  });

  it('run-command mode with single-word description uses it as command with no args', async () => {
    const item = makeItem({
      mode: 'run-command',
      description: 'debug',
    });

    let scanCount = 0;
    mockedFindLaunchable.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return item;
      return null;
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

    // Single word: command = 'debug', args = undefined
    expect(spawnArgs.command).toBe('debug');
    expect(spawnArgs.args).toBeUndefined();
  });

  it('spawn failure marks item back to queued via markQueued', async () => {
    const item = makeItem({
      mode: 'run-command',
      description: 'quick fix',
    });

    let scanCount = 0;
    mockedFindLaunchable.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return item;
      return null;
    });

    // spawnSession throws an error
    mockedSpawnSession.mockRejectedValue(new Error('spawn failed'));

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
    });

    // Must add error listener — EventEmitter throws on unhandled 'error' events
    const errors: string[] = [];
    runner.on('error', (msg: string) => errors.push(msg));

    await runner.start();

    // markRunning should have been called before spawn attempt
    expect(mockedMarkRunning).toHaveBeenCalledWith('test-id-1234');

    // After spawn failure, markQueued should be called to revert
    expect(mockedMarkQueued).toHaveBeenCalledWith('test-id-1234');

    // Error should have been emitted
    expect(errors.some(e => e.includes('spawn failed'))).toBe(true);
  });
});
