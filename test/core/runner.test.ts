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
    pollInterval: 3,
    defaultTimeout: 60,
    maxParallel: 2,
    logLevel: 'INFO',
  })),
}));

vi.mock('../../src/core/queue-store.js', () => ({
  findLaunchableAtomic: vi.fn(),
  cascadeFailure: vi.fn().mockResolvedValue([]),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markQueued: vi.fn().mockResolvedValue(undefined),
  loadQueue: vi.fn().mockResolvedValue({ version: 1, items: [], history: [], completedIds: [] }),
  ensurePilotDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/spawn.js', () => ({
  preSpawnChecks: vi.fn().mockResolvedValue(undefined),
  spawnSession: vi.fn(),
  truncateTitle: vi.fn((_p: string, _m: string, _a?: string) => 'test-title'),
  enforceSpawnRateLimit: vi.fn().mockResolvedValue(undefined),
  checkBinary: vi.fn().mockResolvedValue('/usr/bin/opencode'),
  getSystemFreeMem: vi.fn().mockResolvedValue(8192),
}));

vi.mock('../../src/core/lock.js', () => ({
  cleanStaleLocks: vi.fn().mockResolvedValue(undefined),
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

// Mock node:fs/promises — needed for checkExistingRunner, cleanOrphanProcesses, cleanJobLogs
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock node:fs — needed for heartbeat (writeFileSync) and disk check (statfsSync)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    statfsSync: vi.fn(() => ({
      bfree: BigInt(10_000_000),
      bsize: BigInt(4096),
    })),
  };
});

import { findLaunchableAtomic, cascadeFailure, markCompleted, markFailed, markQueued } from '../../src/core/queue-store.js';
import { spawnSession } from '../../src/core/spawn.js';
import { isProcessAlive } from '../../src/core/process.js';
import { execa } from 'execa';
import { createRunner } from '../../src/core/runner.js';
import type { QueueJsonItem } from '../../src/core/types.js';

const mockedFindLaunchableAtomic = vi.mocked(findLaunchableAtomic);
const mockedCascadeFailure = vi.mocked(cascadeFailure);
const mockedMarkCompleted = vi.mocked(markCompleted);
const mockedMarkFailed = vi.mocked(markFailed);
const mockedMarkQueued = vi.mocked(markQueued);
const mockedSpawnSession = vi.mocked(spawnSession);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);
const mockedExeca = vi.mocked(execa);

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
    // findLaunchableAtomic returns the item already marked running
    let scanCount = 0;
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) {
        return { ...item, status: 'running' as const, attempts: 1 };
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
      pollInterval: 3,
    });

    await runner.start();

    // findLaunchableAtomic marks running atomically — no separate markRunning call
    expect(mockedFindLaunchableAtomic).toHaveBeenCalled();

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
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return { ...item, status: 'running' as const, attempts: 1 };
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
      pollInterval: 3,
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
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return { ...item, status: 'running' as const, attempts: 1 };
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
      pollInterval: 3,
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
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return { ...item, status: 'running' as const, attempts: 1 };
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
      pollInterval: 3,
    });

    // Must add error listener — EventEmitter throws on unhandled 'error' events
    const errors: string[] = [];
    runner.on('error', (msg: string) => errors.push(msg));

    await runner.start();

    // findLaunchableAtomic marks running atomically — no separate markRunning call
    expect(mockedFindLaunchableAtomic).toHaveBeenCalled();

    // After spawn failure, markQueued should be called to revert
    expect(mockedMarkQueued).toHaveBeenCalledWith('test-id-1234');

    // Error should have been emitted
    expect(errors.some(e => e.includes('spawn failed'))).toBe(true);
  });

  it('--once exits when no items available', async () => {
    mockedFindLaunchableAtomic.mockResolvedValue(null);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });

    // Should resolve (exit) quickly
    await runner.start();
    expect(mockedFindLaunchableAtomic).toHaveBeenCalled();
    // No sessions spawned
    expect(mockedSpawnSession).not.toHaveBeenCalled();
  });

  it('per-item maxAttempts: retries when attempts < maxAttempts', async () => {
    const item = makeItem({
      mode: 'run-command',
      description: 'debug',
      attempts: 1,
      maxAttempts: 3,
    });

    let scanCount = 0;
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return { ...item, status: 'running' as const, attempts: 1 };
      return null;
    });

    const mockProcess = {
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'exit') setTimeout(() => cb(1), 50); // non-zero exit = failure
      }),
      unref: vi.fn(),
    };
    mockedSpawnSession.mockResolvedValue({
      pid: 55555,
      process: mockProcess,
      title: 'test-title',
      logFile: '/tmp/test.log',
    });
    mockedIsProcessAlive.mockReturnValue(false);

    // Override execa: git rev-list returns same count (0 new commits),
    // git status --porcelain returns empty (no planning changes)
    mockedExeca.mockImplementation((async (cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-list') return { stdout: '5', stderr: '', exitCode: 0 };
      if (cmd === 'git' && args[0] === 'status') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'git' && args[0] === 'add') return { stdout: '', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    }) as unknown as typeof execa);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });
    runner.on('error', () => {}); // suppress

    await runner.start();

    // attempts(1) < maxAttempts(3) → retry via markQueued
    expect(mockedMarkQueued).toHaveBeenCalledWith('test-id-1234');
    expect(mockedMarkFailed).not.toHaveBeenCalled();
  });

  it('per-item maxAttempts: fails when attempts >= maxAttempts and calls cascadeFailure', async () => {
    const item = makeItem({
      mode: 'run-command',
      description: 'debug',
      attempts: 3,
      maxAttempts: 3,
    });

    let scanCount = 0;
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return { ...item, status: 'running' as const, attempts: 3 };
      return null;
    });

    const mockProcess = {
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'exit') setTimeout(() => cb(1), 50); // non-zero exit = failure
      }),
      unref: vi.fn(),
    };
    mockedSpawnSession.mockResolvedValue({
      pid: 44444,
      process: mockProcess,
      title: 'test-title',
      logFile: '/tmp/test.log',
    });
    mockedIsProcessAlive.mockReturnValue(false);

    // Override execa: git rev-list returns same count (0 new commits),
    // git status --porcelain returns empty (no planning changes)
    mockedExeca.mockImplementation((async (cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-list') return { stdout: '5', stderr: '', exitCode: 0 };
      if (cmd === 'git' && args[0] === 'status') return { stdout: '', stderr: '', exitCode: 0 };
      if (cmd === 'git' && args[0] === 'add') return { stdout: '', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    }) as unknown as typeof execa);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });
    runner.on('error', () => {}); // suppress

    await runner.start();

    // attempts(3) >= maxAttempts(3) → permanent failure
    expect(mockedMarkFailed).toHaveBeenCalledWith('test-id-1234', expect.stringContaining('exit code'));
    expect(mockedMarkQueued).not.toHaveBeenCalled();
    // cascadeFailure should be called after permanent failure
    expect(mockedCascadeFailure).toHaveBeenCalledWith('test-id-1234');
  });

  it('registers SIGTERM and SIGINT handlers', async () => {
    mockedFindLaunchableAtomic.mockResolvedValue(null);

    const processOnSpy = vi.spyOn(process, 'on');
    const processOffSpy = vi.spyOn(process, 'off');

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });

    await runner.start();

    // Both SIGTERM and SIGINT should have been registered
    const onCalls = processOnSpy.mock.calls.map((c) => c[0]);
    expect(onCalls).toContain('SIGTERM');
    expect(onCalls).toContain('SIGINT');

    // And cleaned up after start completes
    const offCalls = processOffSpy.mock.calls.map((c) => c[0]);
    expect(offCalls).toContain('SIGTERM');
    expect(offCalls).toContain('SIGINT');

    processOnSpy.mockRestore();
    processOffSpy.mockRestore();
  });
});
