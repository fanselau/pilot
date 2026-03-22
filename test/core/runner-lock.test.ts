/**
 * Tests for Runner singleton lock via proper-lockfile.
 *
 * Mocks proper-lockfile to avoid real filesystem locking — tests the
 * behavioral contract only: lock acquisition, rejection, and PID writing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── Mock proper-lockfile ────────────────────────────────────────────────────

const mockLockFn = vi.fn();
const mockUnlockFn = vi.fn();

vi.mock('proper-lockfile', () => ({
  default: {
    lock: mockLockFn,
    unlock: mockUnlockFn,
  },
}));

// ── Mock other dependencies to prevent real DB / process side effects ──────

vi.mock('../../src/core/db.js', () => ({
  getAllRunningJobs: vi.fn(() => []),
  markStale: vi.fn(),
  claimNextLaunchable: vi.fn(() => null),
  getNextPending: vi.fn(() => null),
  markRunning: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  cancel: vi.fn(),
  updateDelegationPayload: vi.fn(),
  advanceStep: vi.fn(),
  getJob: vi.fn(() => null),
  updateSessionTitles: vi.fn(),
  recordStep: vi.fn(() => 1),
  completeStep: vi.fn(),
  skipRemainingSteps: vi.fn(),
  getRunningJobsForProject: vi.fn(() => []),
  resetToPending: vi.fn(),
  updateJudgeVerdict: vi.fn(),
  updateActualModels: vi.fn(),
  reconcileStaleJobs: vi.fn(),
  getResumedReviewHoldJobs: vi.fn(() => []),
}));

vi.mock('../../src/core/delegate.js', () => ({
  delegate: vi.fn(),
  resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
  buildNewProjectArgs: vi.fn((job: { description: string }) => job.description),
  buildQuickArgs: vi.fn((job: { description: string }) => job.description),
  getNextPhaseNumber: vi.fn(() => 1),
}));

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: vi.fn(() => null),
  isSessionDone: vi.fn(() => false),
  getLastMessage: vi.fn(() => null),
  getSessionModels: vi.fn(() => []),
  getAssistantMessageCount: vi.fn(() => 0),
}));

vi.mock('../../src/core/models.js', () => ({
  patchAgentFrontmatter: vi.fn(),
  resolveAllAgentModels: vi.fn(() => ({})),
  resolveTopLevelModel: vi.fn(() => ({ model: 'claude-sonnet-4-5' })),
}));

// ── Mock node:fs to intercept lock file operations ─────────────────────────

let _mockPilotDir = '';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: unknown) => {
      if (filePath === '/proc/meminfo') {
        return 'MemAvailable:   62914560 kB\n';
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
    writeFileSync: vi.fn((filePath: string, data: unknown, options?: unknown) => {
      // Allow actual writes to happen in temp dirs
      actual.writeFileSync(filePath, data as string, options as Parameters<typeof actual.writeFileSync>[2]);
    }),
    statSync: vi.fn((filePath: string) => actual.statSync(filePath)),
  };
});

// ── Mock getConfig to point to temp dir ────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    pilotDir: _mockPilotDir,
    pilotDbPath: path.join(_mockPilotDir, 'pilot.db'),
    projectDir: _mockPilotDir,
    maxParallel: 1,
    sessionMemoryMaxMb: 8192,
    reservedMemoryMb: 4096,
    memoryKillThresholdMb: 2048,
    logLevel: 'INFO',
    noColor: false,
  })),
  resolveProjectDir: vi.fn((p: string) => p),
  getConfigFileDefaults: vi.fn(() => ({
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    scope: null,
  })),
}));

vi.mock('../../src/core/providers.js', () => ({
  checkProviderAvailability: vi.fn(() => Promise.resolve({ available: true, warning: null })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = path.join(tmpdir(), `pilot-lock-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Runner singleton lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockPilotDir = makeTempDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls lockfile.lock with the correct path and options', async () => {
    // Mock lock to succeed, returning a release function
    const mockRelease = vi.fn().mockResolvedValue(undefined);
    mockLockFn.mockResolvedValue(mockRelease);

    // Import Runner after mocks are in place
    const { createRunner } = await import('../../src/core/runner.js');
    const runner = createRunner({ once: true, pollInterval: 1 });

    // Run with a short circuit — once mode + no jobs = exits immediately
    await runner.run();

    // Verify lock was called
    expect(mockLockFn).toHaveBeenCalledTimes(1);

    const [lockPath, lockOptions] = mockLockFn.mock.calls[0] as [string, Record<string, unknown>];

    // Path should be ~/.pilot/runner.lock (using temp dir)
    expect(lockPath).toBe(path.join(_mockPilotDir, 'runner.lock'));

    // Options must match spec
    expect(lockOptions.stale).toBe(10000);
    expect(lockOptions.update).toBe(5000);
    expect(lockOptions.realpath).toBe(false);

    // Release function should have been called on exit
    expect(mockRelease).toHaveBeenCalled();
  });

  it('throws error with descriptive message when lock is already held', async () => {
    // Mock lock to throw ELOCKED error
    const elockError = Object.assign(
      new Error('Lock file is already being held'),
      { code: 'ELOCKED' },
    );
    mockLockFn.mockRejectedValue(elockError);

    const { createRunner } = await import('../../src/core/runner.js');
    const runner = createRunner({ once: true, pollInterval: 1 });

    await expect(runner.run()).rejects.toThrow('Failed to acquire runner lock: another instance is running');
  });

  it('writes PID to lock file after successful acquisition', async () => {
    const mockRelease = vi.fn().mockResolvedValue(undefined);
    mockLockFn.mockResolvedValue(mockRelease);

    // Use actual writeFileSync to verify PID write
    const { writeFileSync: actualWriteFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
    const writtenFiles: Record<string, string> = {};
    const { writeFileSync: mockedWriteFileSync } = vi.mocked(await import('node:fs'));
    mockedWriteFileSync.mockImplementation((filePath: unknown, data: unknown) => {
      writtenFiles[filePath as string] = String(data);
      actualWriteFileSync(filePath as string, data as string);
    });

    const { createRunner } = await import('../../src/core/runner.js');
    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    const lockPath = path.join(_mockPilotDir, 'runner.lock');
    // The PID should have been written to the lock file
    expect(writtenFiles[lockPath]).toBe(String(process.pid));
  });

  it('re-throws non-ELOCKED errors from lockfile.lock', async () => {
    const unexpectedError = new Error('Disk full');
    mockLockFn.mockRejectedValue(unexpectedError);

    const { createRunner } = await import('../../src/core/runner.js');
    const runner = createRunner({ once: true, pollInterval: 1 });

    await expect(runner.run()).rejects.toThrow('Disk full');
  });

  it('error message includes PID when lock file has content', async () => {
    // Write a PID to the lock file before the test
    const lockPath = path.join(_mockPilotDir, 'runner.lock');
    writeFileSync(lockPath, '99999');

    const elockError = Object.assign(
      new Error('Lock file is already being held'),
      { code: 'ELOCKED' },
    );
    mockLockFn.mockRejectedValue(elockError);

    const { createRunner } = await import('../../src/core/runner.js');
    const runner = createRunner({ once: true, pollInterval: 1 });

    await expect(runner.run()).rejects.toThrow('Failed to acquire runner lock: another instance is running (PID: 99999)');
  });
});
