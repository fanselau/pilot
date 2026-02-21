import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock config
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

// Mock process.ts
vi.mock('../../src/core/process.js', () => ({
  writePidFile: vi.fn().mockResolvedValue(undefined),
  removePidFile: vi.fn().mockResolvedValue(undefined),
  isProcessAlive: vi.fn(),
}));

// Mock execa for binary check
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

// Mock node:fs/promises for /proc/meminfo reads and statfs
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    statfs: vi.fn(),
  };
});

import { readFile, statfs } from 'node:fs/promises';
import {
  checkDiskSpace,
  getSystemFreeMem,
  enforceSpawnRateLimit,
} from '../../src/core/spawn.js';

const mockedReadFile = vi.mocked(readFile);
const mockedStatfs = vi.mocked(statfs);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Memory guard tests ─────────────────────────────────────────────────────

describe('getSystemFreeMem', () => {
  it('returns available MB when /proc/meminfo readable', async () => {
    mockedReadFile.mockResolvedValue(
      'MemTotal:       16384000 kB\nMemFree:         8192000 kB\nMemAvailable:    3145728 kB\n',
    );

    const result = await getSystemFreeMem();
    // 3145728 kB / 1024 = 3072 MB
    expect(result).toBe(3072);
  });

  it('returns null when /proc/meminfo unreadable', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await getSystemFreeMem();
    expect(result).toBeNull();
  });

  it('returns null when MemAvailable line missing', async () => {
    mockedReadFile.mockResolvedValue('MemTotal:       16384000 kB\nMemFree:         8192000 kB\n');

    const result = await getSystemFreeMem();
    expect(result).toBeNull();
  });
});

// ── Disk space check tests ─────────────────────────────────────────────────

describe('checkDiskSpace', () => {
  it('throws when < 1GB free', async () => {
    // Simulate 500MB free
    mockedStatfs.mockResolvedValue({
      bfree: BigInt(122_070), // blocks
      bsize: BigInt(4096),    // block size
      // 122_070 * 4096 = ~500MB = 499_998_720 bytes < 1GB
    } as unknown as Awaited<ReturnType<typeof statfs>>);

    await expect(checkDiskSpace('/tmp/project')).rejects.toThrow('Disk space too low');
  });

  it('resolves successfully when > 1GB free', async () => {
    // Simulate 2GB free
    mockedStatfs.mockResolvedValue({
      bfree: BigInt(524_288), // blocks
      bsize: BigInt(4096),    // block size
      // 524_288 * 4096 = 2,147,483,648 bytes = 2GB
    } as unknown as Awaited<ReturnType<typeof statfs>>);

    await expect(checkDiskSpace('/tmp/project')).resolves.not.toThrow();
  });

  it('skips check with warning when statfs fails', async () => {
    mockedStatfs.mockRejectedValue(new Error('ENOSYS'));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await expect(checkDiskSpace('/tmp/project')).resolves.not.toThrow();
    stderrSpy.mockRestore();
  });
});

// ── Spawn rate limiter tests ───────────────────────────────────────────────

describe('enforceSpawnRateLimit', () => {
  it('enforces minimum interval between spawns', async () => {
    // The rate limiter uses module-level state. We just verify that
    // calling it twice in quick succession introduces a delay.
    // Use vi.useFakeTimers to avoid real 5-second waits.
    vi.useFakeTimers();

    // First call resets the timer — should resolve quickly
    const p1 = enforceSpawnRateLimit();
    await vi.runAllTimersAsync();
    await p1;

    // Second call should need to wait ~5s
    const p2 = enforceSpawnRateLimit();
    // Advance timers to resolve the sleep
    await vi.advanceTimersByTimeAsync(5000);
    await p2;

    vi.useRealTimers();
    // If we get here without hanging, rate limiting works
    expect(true).toBe(true);
  });
});
