/**
 * Unit tests for the v2 queue runner.
 *
 * Mocks all external dependencies (db.ts, delegate.ts, opencode-db.ts, execa)
 * to test the runner's event loop, launch flow, and shutdown behavior.
 *
 * Testing strategy: The runner's event loop uses async sleep/poll which is
 * hard to test with fake timers. We test through the public API:
 * - createRunner/getState/stop for construction and state
 * - run() with --once for the event loop (mocking all sleeps away)
 * - Launch behavior tested via run() with carefully timed mocks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    maxParallel: 2,
    pollInterval: 1,
    defaultTimeout: 60,
    projectDir: '/tmp/test-projects',
    pilotDir: '/tmp/.pilot',
    pilotDbPath: '/tmp/.pilot/pilot.db',
    gsdDir: '/tmp/pilot-gsd',
    stuckThreshold: 90,
    logLevel: 'INFO',
    noColor: false,
  })),
}));

const mockGetNextPending = vi.fn();
const mockMarkRunning = vi.fn();
const mockMarkCompleted = vi.fn();
const mockMarkFailed = vi.fn();
const mockUpdateDelegationPlan = vi.fn();
const mockAdvanceStep = vi.fn();
const mockGetJob = vi.fn();
const mockUpdateSessionTitles = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getNextPending: (...args: unknown[]) => mockGetNextPending(...args),
  markRunning: (...args: unknown[]) => mockMarkRunning(...args),
  markCompleted: (...args: unknown[]) => mockMarkCompleted(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
  updateDelegationPlan: (...args: unknown[]) => mockUpdateDelegationPlan(...args),
  advanceStep: (...args: unknown[]) => mockAdvanceStep(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  updateSessionTitles: (...args: unknown[]) => mockUpdateSessionTitles(...args),
}));

const mockDelegate = vi.fn();
vi.mock('../../src/core/delegate.js', () => ({
  delegate: (...args: unknown[]) => mockDelegate(...args),
  resolveOpencodeBinary: vi.fn(() => '/usr/bin/opencode'),
}));

const mockFindSessionByTitle = vi.fn();
const mockIsSessionActive = vi.fn();
const mockGetLastMessage = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  isSessionActive: (...args: unknown[]) => mockIsSessionActive(...args),
  getLastMessage: (...args: unknown[]) => mockGetLastMessage(...args),
}));

vi.mock('execa', () => ({
  execa: vi.fn(() => ({ unref: vi.fn(), catch: vi.fn().mockReturnThis() })),
}));

// Mock fs reads for pre-spawn checks
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string) => {
      if (typeof filePath === 'string' && filePath === '/proc/meminfo') {
        return 'MemAvailable:  8388608 kB\n'; // 8GB available
      }
      if (typeof filePath === 'string' && filePath.endsWith('opencode.json')) {
        return JSON.stringify({ permission: { allow: true } });
      }
      return actual.readFileSync(filePath, 'utf8');
    }),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
  };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { Runner, createRunner } from '../../src/core/runner.js';
import type { Job, DelegationPlan } from '../../src/core/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'test-project',
    scope: 'quick',
    description: 'Fix the navbar',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    createdAt: '2026-02-22T00:00:00Z',
    startedAt: null,
    completedAt: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    ...overrides,
  };
}

function makePlan(steps: Array<{ command: string; args: string }> = [{ command: 'quick', args: 'Fix it' }]): DelegationPlan {
  return {
    steps,
    reasoning: 'Test plan',
  };
}

/**
 * Helper to set up mocks for a successful spawnAndWait flow.
 * Session appears immediately, is not active, and has an old message.
 */
function mockSuccessfulSpawn(): void {
  mockFindSessionByTitle.mockReturnValue('session-123');
  mockIsSessionActive.mockReturnValue(false);
  mockGetLastMessage.mockReturnValue({
    id: 'msg-1',
    role: 'assistant',
    content: 'Done',
    createdAt: Date.now() - 120_000, // 2 minutes ago
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Runner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset spawn rate limiter between tests to avoid inter-test timing issues
    const { _resetSpawnRateLimit } = await import('../../src/core/runner.js');
    _resetSpawnRateLimit();
    // Reset config mock to default values (other tests may have changed it)
    const { getConfig } = await import('../../src/core/config.js');
    vi.mocked(getConfig).mockReturnValue({
      maxParallel: 2,
      pollInterval: 1,
      defaultTimeout: 60,
      projectDir: '/tmp/test-projects',
      pilotDir: '/tmp/.pilot',
      pilotDbPath: '/tmp/.pilot/pilot.db',
      gsdDir: '/tmp/pilot-gsd',
      stuckThreshold: 90,
      logLevel: 'INFO' as const,
      noColor: false,
    });
  });

  afterEach(() => {
    // Clean up SIGTERM/SIGINT handlers to prevent test interference
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  describe('constructor', () => {
    it('creates with default options from config', () => {
      const runner = createRunner();
      const state = runner.getState();
      expect(state.active).toBe(false);
      expect(state.activeJobs).toBe(0);
      expect(state.jobIds).toEqual([]);
    });

    it('accepts custom options that override config', () => {
      const runner = createRunner({ maxParallel: 10, once: true, pollInterval: 30 });
      expect(runner).toBeInstanceOf(Runner);
    });
  });

  describe('stop()', () => {
    it('sets shuttingDown and stops the runner', () => {
      const runner = createRunner();
      runner.stop();
      const state = runner.getState();
      expect(state.active).toBe(false);
    });
  });

  describe('getState()', () => {
    it('reports initial state correctly', () => {
      const runner = createRunner();
      const state = runner.getState();
      expect(state).toEqual({
        active: false,
        activeJobs: 0,
        jobIds: [],
      });
    });
  });

  describe('run() with --once', () => {
    it('exits immediately when queue is empty', async () => {
      mockGetNextPending.mockReturnValue(null);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockGetNextPending).toHaveBeenCalled();
      expect(mockMarkRunning).not.toHaveBeenCalled();
    });

    it('processes one job then exits', async () => {
      const job = makeJob();
      const plan = makePlan();

      mockGetNextPending
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);
      mockSuccessfulSpawn();

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // Verify job lifecycle
      expect(mockMarkRunning).toHaveBeenCalledWith('ab12');
      expect(mockUpdateDelegationPlan).toHaveBeenCalledWith('ab12', plan);
      expect(mockUpdateSessionTitles).toHaveBeenCalledWith('ab12', expect.arrayContaining([expect.any(String)]));
      expect(mockAdvanceStep).toHaveBeenCalledWith('ab12');
      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    }, 30000);
  });

  describe('launch — delegation error', () => {
    it('marks job failed when delegate throws', async () => {
      const job = makeJob();

      mockGetNextPending
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockRejectedValue(new Error('AI is down'));

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockMarkRunning).toHaveBeenCalledWith('ab12');
      expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('Delegation failed'));
      expect(mockMarkCompleted).not.toHaveBeenCalled();
    }, 15000);
  });

  describe('launch — spawn error', () => {
    it('marks job failed when session never appears', async () => {
      const job = makeJob();
      const plan = makePlan();

      mockGetNextPending
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      // Session never appears in DB
      mockFindSessionByTitle.mockReturnValue(null);

      // Very short timeout to avoid waiting in test
      const { getConfig } = await import('../../src/core/config.js');
      vi.mocked(getConfig).mockReturnValue({
        maxParallel: 2,
        pollInterval: 1,
        defaultTimeout: 0.01, // ~600ms timeout
        projectDir: '/tmp/test-projects',
        pilotDir: '/tmp/.pilot',
        pilotDbPath: '/tmp/.pilot/pilot.db',
        gsdDir: '/tmp/pilot-gsd',
        stuckThreshold: 90,
        logLevel: 'INFO' as const,
        noColor: false,
      });

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('Session never appeared'));
    }, 30000);
  });

  describe('launch — multi-step plan', () => {
    it('executes steps sequentially and advances step counter', async () => {
      const job = makeJob();
      const plan = makePlan([
        { command: 'plan-phase', args: '3 --auto' },
        { command: 'execute-phase', args: '3' },
      ]);

      mockGetNextPending
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);
      mockSuccessfulSpawn();

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // Should advance step twice (once per step)
      expect(mockAdvanceStep).toHaveBeenCalledTimes(2);
      expect(mockUpdateSessionTitles).toHaveBeenCalledTimes(2);
      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    }, 30000);
  });

  describe('graceful shutdown', () => {
    it('stop() prevents further job processing', async () => {
      let jobCounter = 0;

      // Return unique jobs to simulate realistic queue behavior
      mockGetNextPending.mockImplementation(() => {
        jobCounter++;
        if (jobCounter > 3) return null; // Limit jobs
        return makeJob({ id: `j${String(jobCounter).padStart(3, '0')}` });
      });

      mockDelegate.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 50));
        return makePlan();
      });
      mockSuccessfulSpawn();

      const runner = createRunner({ once: false, pollInterval: 1, maxParallel: 1 });

      // Stop after a short delay
      setTimeout(() => runner.stop(), 300);

      await runner.run();

      // Runner should have stopped
      const state = runner.getState();
      expect(state.active).toBe(false);
      // At least one job was picked up
      expect(mockMarkRunning).toHaveBeenCalled();
    }, 15000);
  });
});

describe('createRunner', () => {
  it('returns a Runner instance', () => {
    const runner = createRunner();
    expect(runner).toBeInstanceOf(Runner);
  });

  it('accepts partial options', () => {
    const runner = createRunner({ maxParallel: 3 });
    expect(runner).toBeInstanceOf(Runner);
  });
});
