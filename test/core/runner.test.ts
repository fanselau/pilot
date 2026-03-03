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
const mockClaimNextLaunchable = vi.fn();
const mockMarkRunning = vi.fn();
const mockMarkCompleted = vi.fn();
const mockMarkFailed = vi.fn();
const mockCancel = vi.fn();
const mockUpdateDelegationPlan = vi.fn();
const mockAdvanceStep = vi.fn();
const mockGetJob = vi.fn();
const mockUpdateSessionTitles = vi.fn();
const mockRecordStep = vi.fn(() => 1);  // returns row ID
const mockCompleteStep = vi.fn();
const mockSkipRemainingSteps = vi.fn();
const mockGetAllRunningJobs = vi.fn(() => []);  // returns empty array by default
const mockForceQuitJob = vi.fn(() => ({ ok: true }));

vi.mock('../../src/core/db.js', () => ({
  getNextPending: (...args: unknown[]) => mockGetNextPending(...args),
  claimNextLaunchable: (...args: unknown[]) => mockClaimNextLaunchable(...args),
  markRunning: (...args: unknown[]) => mockMarkRunning(...args),
  markCompleted: (...args: unknown[]) => mockMarkCompleted(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
  cancel: (...args: unknown[]) => mockCancel(...args),
  updateDelegationPlan: (...args: unknown[]) => mockUpdateDelegationPlan(...args),
  advanceStep: (...args: unknown[]) => mockAdvanceStep(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  updateSessionTitles: (...args: unknown[]) => mockUpdateSessionTitles(...args),
  recordStep: (...args: unknown[]) => mockRecordStep(...args),
  completeStep: (...args: unknown[]) => mockCompleteStep(...args),
  skipRemainingSteps: (...args: unknown[]) => mockSkipRemainingSteps(...args),
  getAllRunningJobs: (...args: unknown[]) => mockGetAllRunningJobs(...args),
  forceQuitJob: (...args: unknown[]) => mockForceQuitJob(...args),
}));

const mockDelegate = vi.fn();
vi.mock('../../src/core/delegate.js', () => ({
  delegate: (...args: unknown[]) => mockDelegate(...args),
  resolveOpencodeBinary: vi.fn(() => '/usr/bin/opencode'),
}));

const { mockResolveAllAgentModels, mockPatchAgentFrontmatter } = vi.hoisted(() => ({
  mockResolveAllAgentModels: vi.fn(() => ({})),
  mockPatchAgentFrontmatter: vi.fn(),
}));

vi.mock('../../src/core/models.js', () => ({
  resolveAllAgentModels: mockResolveAllAgentModels,
  patchAgentFrontmatter: mockPatchAgentFrontmatter,
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

// Dynamic mock data for readdirSync (inter-step artifact verification)
let mockPhaseDirEntries: string[] = [];   // entries in .planning/phases/
let mockPhaseDirFiles: string[] = [];     // files inside a specific phase dir (e.g. .planning/phases/03-ui/)

// Mock fs reads for pre-spawn checks + artifact verification
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
    readdirSync: vi.fn((dirPath: string) => {
      if (typeof dirPath === 'string' && dirPath.endsWith('.planning/phases')) {
        return [...mockPhaseDirEntries];
      }
      // Files inside a phase directory (e.g. .planning/phases/03-ui/)
      if (typeof dirPath === 'string' && dirPath.includes('.planning/phases/')) {
        return [...mockPhaseDirFiles];
      }
      return [];
    }),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    // Stub fs.watch — runner uses it for DB file change events
    watch: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      close: vi.fn(),
    })),
  };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { Runner, createRunner, evaluateStepResult, scanPhaseDirs, verifyStepArtifacts, patchStepArgs } from '../../src/core/runner.js';
import type { Job, DelegationPlan, DelegationStep } from '../../src/core/types.js';

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
    modelProfile: 'balanced',
    providerMode: 'claude-only',
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
    // Reset dynamic mock data
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
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
      mockClaimNextLaunchable.mockReturnValue(null);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockClaimNextLaunchable).toHaveBeenCalled();
      // markRunning is no longer called in launch() — claimNextLaunchable handles it atomically
    });

    it('processes one job then exits', async () => {
      const job = makeJob();
      const plan = makePlan();

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);
      mockSuccessfulSpawn();

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // Verify job lifecycle
      // markRunning no longer called here — claimNextLaunchable handles it atomically
      expect(mockUpdateDelegationPlan).toHaveBeenCalledWith('ab12', plan);
      expect(mockUpdateSessionTitles).toHaveBeenCalledWith('ab12', expect.arrayContaining([expect.any(String)]));
      expect(mockAdvanceStep).toHaveBeenCalledWith('ab12');
      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
      expect(mockResolveAllAgentModels).toHaveBeenCalledWith('balanced', 'claude-only');
      expect(mockPatchAgentFrontmatter).toHaveBeenCalled();
    }, 30000);
  });

  describe('launch — delegation error', () => {
    it('marks job failed when delegate throws', async () => {
      const job = makeJob();

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockRejectedValue(new Error('AI is down'));

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // markRunning no longer called here — claimNextLaunchable handles it atomically
      expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('Delegation failed'));
      expect(mockMarkCompleted).not.toHaveBeenCalled();
    }, 15000);
  });

  describe('launch — spawn error', () => {
    it('marks job failed when session never appears', async () => {
      const job = makeJob();
      const plan = makePlan();

      mockClaimNextLaunchable
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

      // Set up phase dirs so artifact verification passes
      mockPhaseDirEntries = ['03-ui'];
      mockPhaseDirFiles = ['03-01-PLAN.md', '03-01-SUMMARY.md'];

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);
      mockSuccessfulSpawn();

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // Should advance step twice (once per step)
      expect(mockAdvanceStep).toHaveBeenCalledTimes(2);
      expect(mockUpdateSessionTitles).toHaveBeenCalledTimes(3);
      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    }, 30000);
  });

  describe('graceful shutdown', () => {
    it('stop() prevents further job processing', async () => {
      let jobCounter = 0;

      // Return unique jobs to simulate realistic queue behavior
      mockClaimNextLaunchable.mockImplementation(() => {
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
      // At least one job was picked up (claimNextLaunchable was called)
      expect(mockClaimNextLaunchable).toHaveBeenCalled();
    }, 15000);
  });

  describe('launch — semantic failure detection (R2)', () => {
    it('marks job failed when execute-phase output contains failure marker', async () => {
      const job = makeJob({ scope: 'phase', description: '3' });
      const plan = makePlan([{ command: 'execute-phase', args: '3' }]);

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      // Spawn succeeds but last message contains failure marker
      mockFindSessionByTitle.mockReturnValue('session-456');
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-1',
        role: 'assistant',
        content: 'Error: no matching phase directory found for phase 3',
        createdAt: Date.now() - 120_000,
      });

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('no matching phase'));
      expect(mockMarkCompleted).not.toHaveBeenCalled();
    }, 30000);

    it('marks job completed when execute-phase output has no failure markers', async () => {
      const job = makeJob({ scope: 'phase', description: '3' });
      const plan = makePlan([{ command: 'execute-phase', args: '3' }]);

      // Set up phase dirs so artifact verification passes
      mockPhaseDirEntries = ['03-ui'];
      mockPhaseDirFiles = ['03-01-SUMMARY.md'];

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      mockFindSessionByTitle.mockReturnValue('session-789');
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-2',
        role: 'assistant',
        content: 'Phase 3 execution complete. All plans executed successfully.',
        createdAt: Date.now() - 120_000,
      });

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
      expect(mockMarkFailed).not.toHaveBeenCalled();
    }, 30000);

    it('marks job failed when plan-phase output contains failure marker', async () => {
      const job = makeJob({ scope: 'phase', description: '5' });
      const plan = makePlan([{ command: 'plan-phase', args: '5 --auto' }]);

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      mockFindSessionByTitle.mockReturnValue('session-plan');
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-3',
        role: 'assistant',
        content: 'Failed to plan phase 5: no plans found in directory',
        createdAt: Date.now() - 120_000,
      });

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('failed'));
      expect(mockMarkCompleted).not.toHaveBeenCalled();
    }, 30000);

    it('allows completion when no session messages exist', async () => {
      const job = makeJob({ scope: 'phase', description: '2' });
      const plan = makePlan([{ command: 'execute-phase', args: '2' }]);

      // Set up phase dirs so artifact verification passes
      mockPhaseDirEntries = ['02-core'];
      mockPhaseDirFiles = ['02-01-SUMMARY.md'];

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      mockFindSessionByTitle.mockReturnValue('session-empty');
      mockIsSessionActive.mockReturnValue(false);
      // First call for spawnAndWait polling (returns message to indicate done),
      // Second call for evaluateStepResult (returns null = no messages to evaluate)
      mockGetLastMessage
        .mockReturnValueOnce({
          id: 'msg-done',
          role: 'assistant',
          content: 'Done',
          createdAt: Date.now() - 120_000,
        })
        .mockReturnValueOnce(null);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // No messages = no failure markers = success
      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    }, 30000);

    it('does not check semantic failure for quick commands', async () => {
      const job = makeJob({ scope: 'quick', description: 'Fix navbar' });
      const plan = makePlan([{ command: 'quick', args: 'Fix navbar' }]);

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      // Even if message contains "error" words, quick commands don't get semantic check
      mockFindSessionByTitle.mockReturnValue('session-quick');
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-q',
        role: 'assistant',
        content: 'Error: no matching phase directory found',
        createdAt: Date.now() - 120_000,
      });

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // Quick commands skip semantic check — should complete
      expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    }, 30000);
  });

  describe('launch — step recording (R4)', () => {
    it('records step for each step in multi-step plan', async () => {
      const job = makeJob();
      const plan = makePlan([
        { command: 'plan-phase', args: '3 --auto' },
        { command: 'execute-phase', args: '3' },
      ]);

      // Set up phase dirs so artifact verification passes
      mockPhaseDirEntries = ['03-ui'];
      mockPhaseDirFiles = ['03-01-PLAN.md', '03-01-SUMMARY.md'];

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);
      mockSuccessfulSpawn();
      mockRecordStep.mockReturnValueOnce(10).mockReturnValueOnce(11);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // recordStep called once per step with correct args
      expect(mockRecordStep).toHaveBeenCalledTimes(2);
      expect(mockRecordStep).toHaveBeenCalledWith('ab12', 0, 'plan-phase', '3 --auto', expect.any(String));
      expect(mockRecordStep).toHaveBeenCalledWith('ab12', 1, 'execute-phase', '3', expect.any(String));
    }, 30000);

    it('completes step with verdict on semantic check', async () => {
      const job = makeJob({ scope: 'phase', description: '3' });
      const plan = makePlan([{ command: 'execute-phase', args: '3' }]);

      // Set up phase dirs so artifact verification passes
      mockPhaseDirEntries = ['03-ui'];
      mockPhaseDirFiles = ['03-01-SUMMARY.md'];

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      mockFindSessionByTitle.mockReturnValue('session-789');
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-2',
        role: 'assistant',
        content: 'Phase 3 execution complete. All plans executed successfully.',
        createdAt: Date.now() - 120_000,
      });
      mockRecordStep.mockReturnValue(20);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // completeStep called with semantic-check source and session ID
      expect(mockCompleteStep).toHaveBeenCalledWith(
        20, 'completed', 'semantic-check', expect.any(String), 'session-789',
      );
    }, 30000);

    it('marks step failed before throwing on semantic failure', async () => {
      const job = makeJob({ scope: 'phase', description: '3' });
      const plan = makePlan([{ command: 'execute-phase', args: '3' }]);

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      mockFindSessionByTitle.mockReturnValue('session-fail');
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-fail',
        role: 'assistant',
        content: 'Error: no matching phase directory found for phase 3',
        createdAt: Date.now() - 120_000,
      });
      mockRecordStep.mockReturnValue(30);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // completeStep with 'failed' called BEFORE markFailed
      expect(mockCompleteStep).toHaveBeenCalledWith(
        30, 'failed', 'semantic-check', expect.stringContaining('no matching phase'), 'session-fail',
      );
      // markFailed also called (job-level failure)
      expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('no matching phase'));

      // Verify order: completeStep was called before markFailed
      const completeStepCallOrder = mockCompleteStep.mock.invocationCallOrder[0];
      const markFailedCallOrder = mockMarkFailed.mock.invocationCallOrder[0];
      expect(completeStepCallOrder).toBeLessThan(markFailedCallOrder);
    }, 30000);

    it('records step completed for quick commands without verdict', async () => {
      const job = makeJob({ scope: 'quick', description: 'Fix navbar' });
      const plan = makePlan([{ command: 'quick', args: 'Fix navbar' }]);

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);
      mockSuccessfulSpawn();
      mockRecordStep.mockReturnValue(40);

      const runner = createRunner({ once: true, pollInterval: 1 });
      await runner.run();

      // completeStep called with no verdict source for quick commands
      expect(mockCompleteStep).toHaveBeenCalledWith(
        40, 'completed', null, null, expect.any(String),
      );
    }, 30000);
  });

  describe('launch — shutdown interruption (R3)', () => {
    it('marks interrupted job as cancelled, not completed, and skips remaining steps', async () => {
      const job = makeJob();
      const plan = makePlan([
        { command: 'plan-phase', args: '3 --auto' },
        { command: 'execute-phase', args: '3' },
      ]);

      // Set up phase dirs so artifact verification passes for the first step
      mockPhaseDirEntries = ['03-ui'];
      mockPhaseDirFiles = ['03-01-PLAN.md', '03-01-SUMMARY.md'];

      mockClaimNextLaunchable
        .mockReturnValueOnce(job)
        .mockReturnValue(null);

      mockDelegate.mockResolvedValue(plan);

      // First step: session appears and finishes quickly with clean output
      let spawnCallCount = 0;
      mockFindSessionByTitle.mockImplementation(() => {
        spawnCallCount++;
        return `session-${spawnCallCount}`;
      });
      mockIsSessionActive.mockReturnValue(false);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-ok',
        role: 'assistant',
        content: 'Planning complete. No issues found.',
        createdAt: Date.now() - 120_000,
      });

      const runner = createRunner({ once: true, pollInterval: 1, maxParallel: 1 });

      // Stop runner after first advanceStep (after first step completes)
      mockAdvanceStep.mockImplementationOnce(() => {
        runner.stop();
      });

      await runner.run();

      // Should NOT be marked completed since not all steps ran
      expect(mockMarkCompleted).not.toHaveBeenCalled();
      // Should be cancelled
      expect(mockCancel).toHaveBeenCalledWith('ab12');
      // Should call skipRemainingSteps for the remaining steps
      expect(mockSkipRemainingSteps).toHaveBeenCalledWith('ab12', 1, 'Runner shutdown');
    }, 30000);
  });
});

/**
 * Restore the default readdirSync mock that reads from module-level variables.
 * Tests that override mockImplementation must call this to reset state.
 */
async function restoreDefaultReaddirSync(): Promise<void> {
  const { readdirSync } = await import('node:fs');
  vi.mocked(readdirSync).mockImplementation(((dirPath: unknown) => {
    const dp = String(dirPath);
    if (dp.endsWith('.planning/phases')) {
      return [...mockPhaseDirEntries];
    }
    if (dp.includes('.planning/phases/')) {
      return [...mockPhaseDirFiles];
    }
    return [];
  }) as typeof readdirSync);
}

describe('launch — inter-step artifact verification', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
    await restoreDefaultReaddirSync();
    const { _resetSpawnRateLimit } = await import('../../src/core/runner.js');
    _resetSpawnRateLimit();
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
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('add-phase creates dir → runner detects and patches plan-phase/execute-phase args', async () => {
    const job = makeJob({ scope: 'phase', description: 'Dark Mode' });
    const plan = makePlan([
      { command: 'add-phase', args: 'Dark Mode' },
      { command: 'plan-phase', args: '21 --auto' },
      { command: 'execute-phase', args: '21' },
    ]);

    // Before add-phase: dirs up to 20
    const initialDirs = Array.from({ length: 20 }, (_, i) => `${String(i + 1).padStart(2, '0')}-phase${i + 1}`);
    // After add-phase: dirs up to 22 (actual number differs from predicted 21!)
    const afterAddDirs = [...initialDirs, '22-dark-mode'];

    // readdirSync needs to return different values before and after add-phase
    const { readdirSync: mockReaddirSync } = await import('node:fs');
    let addPhaseComplete = false;
    vi.mocked(mockReaddirSync).mockImplementation(((dirPath: unknown) => {
      const dp = String(dirPath);
      if (dp.endsWith('.planning/phases')) {
        return addPhaseComplete ? afterAddDirs : initialDirs;
      }
      if (dp.includes('.planning/phases/')) {
        return ['22-01-PLAN.md', '22-01-SUMMARY.md'];
      }
      return [];
    }) as typeof mockReaddirSync);

    // Mark add-phase as complete after spawn
    mockFindSessionByTitle.mockReturnValue('session-add');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-add',
      role: 'assistant',
      content: 'Phase added. Planning complete. Created 2 plan files.',
      createdAt: Date.now() - 120_000,
    });

    // After the first spawnAndWait (add-phase), change dirs to reflect new phase
    const origExeca = (await import('execa')).execa;
    vi.mocked(origExeca).mockImplementation((() => {
      addPhaseComplete = true;
      return { unref: vi.fn(), catch: vi.fn().mockReturnThis(), pid: 12345 };
    }) as unknown as typeof origExeca);

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    // Verify patched args were used for plan-phase and execute-phase steps
    // The recordStep mock captures the args passed to each step
    expect(mockRecordStep).toHaveBeenCalledTimes(3);
    // Step 1: add-phase (unchanged)
    expect(mockRecordStep).toHaveBeenCalledWith(expect.any(String), 0, 'add-phase', 'Dark Mode', expect.any(String));
    // Step 2: plan-phase should have been patched from "21 --auto" to "22 --auto"
    expect(mockRecordStep).toHaveBeenCalledWith(expect.any(String), 1, 'plan-phase', '22 --auto', expect.any(String));
    // Step 3: execute-phase should have been patched from "21" to "22"
    expect(mockRecordStep).toHaveBeenCalledWith(expect.any(String), 2, 'execute-phase', '22', expect.any(String));
    expect(mockMarkCompleted).toHaveBeenCalled();
  }, 30000);

  it('add-phase fails when no new dir is created', async () => {
    const job = makeJob({ scope: 'phase', description: 'Dark Mode' });
    const plan = makePlan([
      { command: 'add-phase', args: 'Dark Mode' },
      { command: 'plan-phase', args: '21 --auto' },
    ]);

    // Same dirs before and after add-phase (no new dir created)
    const staticDirs = ['01-setup', '02-core'];
    mockPhaseDirEntries = staticDirs;

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);
    mockSuccessfulSpawn();

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    expect(mockMarkFailed).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('did not create a new phase directory'));
    expect(mockMarkCompleted).not.toHaveBeenCalled();
  }, 30000);

  it('plan-phase fails when no PLAN.md files exist', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'plan-phase', args: '3 --auto' }]);

    // Phase dir exists but no PLAN.md files
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['STATE'];  // Only STATE file, no PLAN.md

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);
    mockSuccessfulSpawn();

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    expect(mockMarkFailed).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('did not create any PLAN.md files'));
    expect(mockMarkCompleted).not.toHaveBeenCalled();
  }, 30000);

  it('execute-phase succeeds with SUMMARY.md files', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'execute-phase', args: '3' }]);

    // Phase dir has SUMMARY.md
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['03-01-SUMMARY.md', '03-01-PLAN.md'];

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    mockFindSessionByTitle.mockReturnValue('session-exec');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-exec',
      role: 'assistant',
      content: 'Phase 3 execution complete.',
      createdAt: Date.now() - 120_000,
    });

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    expect(mockMarkCompleted).toHaveBeenCalled();
    expect(mockMarkFailed).not.toHaveBeenCalled();
  }, 30000);

  it('phase number mismatch logs patching to stderr', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const job = makeJob({ scope: 'phase', description: 'X' });
    const plan = makePlan([
      { command: 'add-phase', args: 'X' },
      { command: 'plan-phase', args: '21 --auto' },
      { command: 'execute-phase', args: '21' },
    ]);

    const initialDirs = ['01-setup', '02-core'];
    const afterAddDirs = [...initialDirs, '22-new-feature'];

    const { readdirSync: mockReaddirSync } = await import('node:fs');
    let addPhaseComplete = false;
    vi.mocked(mockReaddirSync).mockImplementation(((dirPath: unknown) => {
      const dp = String(dirPath);
      if (dp.endsWith('.planning/phases')) {
        return addPhaseComplete ? afterAddDirs : initialDirs;
      }
      if (dp.includes('.planning/phases/')) {
        return ['22-01-PLAN.md', '22-01-SUMMARY.md'];
      }
      return [];
    }) as typeof mockReaddirSync);

    mockFindSessionByTitle.mockReturnValue('session-patch');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-patch',
      role: 'assistant',
      content: 'Phase added. Planning complete. Created 2 plan files.',
      createdAt: Date.now() - 120_000,
    });

    const origExeca = (await import('execa')).execa;
    vi.mocked(origExeca).mockImplementation((() => {
      addPhaseComplete = true;
      return { unref: vi.fn(), catch: vi.fn().mockReturnThis(), pid: 12345 };
    }) as unknown as typeof origExeca);

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    // Verify stderr contains patching messages
    const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0]));
    expect(stderrCalls.some(c => c.includes('Patched plan-phase args: 21 --auto'))).toBe(true);
    expect(stderrCalls.some(c => c.includes('Patched execute-phase args: 21'))).toBe(true);

    stderrSpy.mockRestore();
  }, 30000);

  it('non-phase commands skip artifact verification', async () => {
    const job = makeJob({ scope: 'quick', description: 'Fix it' });
    const plan = makePlan([{ command: 'quick', args: 'Fix it' }]);

    // No phase dir setup needed — quick commands skip verification
    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);
    mockSuccessfulSpawn();

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    expect(mockMarkCompleted).toHaveBeenCalled();
    expect(mockMarkFailed).not.toHaveBeenCalled();
  }, 30000);
});

describe('plan-phase grace window artifact verification', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
    await restoreDefaultReaddirSync();
    const { _resetSpawnRateLimit } = await import('../../src/core/runner.js');
    _resetSpawnRateLimit();
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
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGHUP');
  });

  it('plan-phase succeeds immediately when PLAN.md exists on first check', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'plan-phase', args: '3 --auto' }]);

    // PLAN.md is present from the start
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['03-01-PLAN.md'];

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    // Spawn with success message so semantic check passes
    mockFindSessionByTitle.mockReturnValue('session-fast');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-fast',
      role: 'assistant',
      content: 'Planning complete. Created 1 plan files.',
      createdAt: Date.now() - 120_000,
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0]));

    // Should succeed immediately — no grace window entered
    expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    expect(mockMarkFailed).not.toHaveBeenCalled();
    expect(stderrCalls.some(c => c.includes('grace window'))).toBe(false);

    stderrSpy.mockRestore();
  }, 30000);

  it('plan-phase succeeds within grace window when PLAN.md appears late', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'plan-phase', args: '3 --auto' }]);

    // Start with no PLAN.md, then it appears after a few calls
    const { readdirSync: mockReaddirSync } = await import('node:fs');
    let artifactCallCount = 0;
    vi.mocked(mockReaddirSync).mockImplementation(((dirPath: unknown) => {
      const dp = String(dirPath);
      if (dp.endsWith('.planning/phases')) return ['03-ui'];
      if (dp.includes('.planning/phases/')) {
        artifactCallCount++;
        // Return PLAN.md only after the 3rd call (initial check + 2 grace window polls)
        return artifactCallCount > 2 ? ['03-01-PLAN.md'] : ['STATE'];
      }
      return [];
    }) as typeof mockReaddirSync);

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    // For spawnAndWait to complete: session inactive with old message
    // For grace window: session active with recent message
    // Use mockReturnValueOnce to control the sequence:
    //   - First findSessionByTitle call (spawnAndWait poll): returns session
    //   - Subsequent calls (grace window): also returns session (active)
    mockFindSessionByTitle.mockReturnValue('session-late');
    // First isSessionActive call = spawnAndWait (inactive → spawn done)
    // Subsequent = grace window (active → keep polling)
    mockIsSessionActive.mockReturnValueOnce(false).mockReturnValue(true);
    // First getLastMessage = spawnAndWait (old → spawn finishes immediately)
    // Subsequent = grace window (recent → session alive)
    mockGetLastMessage
      .mockReturnValueOnce({
        id: 'msg-spawn',
        role: 'assistant',
        content: 'Planning complete. Created 1 plan files.',
        createdAt: Date.now() - 120_000, // Old — spawn done
      })
      .mockReturnValue({
        id: 'msg-grace',
        role: 'assistant',
        content: 'Planning complete. Created 1 plan files.',
        createdAt: Date.now() - 5_000, // Recent — session alive in grace window
      });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0]));

    // Job should succeed — artifacts appeared within grace window
    expect(mockMarkCompleted).toHaveBeenCalledWith('ab12');
    expect(mockMarkFailed).not.toHaveBeenCalled();

    // Should have entered grace window and found artifacts
    expect(stderrCalls.some(c => c.includes('entering grace window'))).toBe(true);
    expect(stderrCalls.some(c => c.includes('Artifacts appeared after'))).toBe(true);

    stderrSpy.mockRestore();
  }, 60000);

  it('plan-phase fails immediately when artifacts missing and session is dead', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'plan-phase', args: '3 --auto' }]);

    // Phase dir exists but never has PLAN.md
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['STATE'];

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    // Session is NOT active and last message is old
    mockFindSessionByTitle.mockReturnValue('session-dead');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-dead',
      role: 'assistant',
      content: 'Planning complete. Created 1 plan files.',
      createdAt: Date.now() - 120_000, // 2 minutes ago — dead session
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0]));

    // Job should fail — session dead, no artifacts
    expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('artifact check failed'));
    expect(mockMarkCompleted).not.toHaveBeenCalled();

    // Should have entered grace window and detected inactive session
    expect(stderrCalls.some(c => c.includes('entering grace window'))).toBe(true);
    expect(stderrCalls.some(c => c.includes('session inactive'))).toBe(true);

    stderrSpy.mockRestore();
  }, 30000);

  it('plan-phase fails after grace window exhausted with active session', async () => {
    const job = makeJob({ scope: 'phase', description: '3' });
    const plan = makePlan([{ command: 'plan-phase', args: '3 --auto' }]);

    // Never produce PLAN.md files
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['STATE'];

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    // For spawnAndWait to complete quickly: inactive with old message
    // For grace window: active with recent message (session alive, but no artifacts)
    mockFindSessionByTitle.mockReturnValue('session-stuck');
    // spawnAndWait poll: inactive → done. Grace window polls: active → keep retrying
    mockIsSessionActive.mockReturnValueOnce(false).mockReturnValue(true);
    // spawnAndWait: old message → done immediately
    // Grace window: recent message → session alive
    mockGetLastMessage
      .mockReturnValueOnce({
        id: 'msg-spawn-done',
        role: 'assistant',
        content: 'Planning complete. Created 1 plan files.',
        createdAt: Date.now() - 120_000, // Old — spawn done
      })
      .mockReturnValue({
        id: 'msg-grace-active',
        role: 'assistant',
        content: 'Planning complete. Created 1 plan files.',
        createdAt: Date.now() - 5_000, // Recent — session alive during grace window
      });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const runner = createRunner({ once: true, pollInterval: 1 });

    // Trigger graceful shutdown after grace window enters first poll (~4s: 2s initial sleep + 3s grace poll)
    // This simulates the grace window being interrupted by shutdown (the !this.shuttingDown guard exits the loop)
    // The job is then failed by the grace window returning the failed verification result
    setTimeout(() => runner.stop(), 7_000);

    await runner.run();

    const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0]));

    // Job should fail — grace window interrupted/exhausted, artifacts never appeared
    expect(mockMarkFailed).toHaveBeenCalled();
    expect(mockMarkCompleted).not.toHaveBeenCalled();

    // Should have entered grace window
    expect(stderrCalls.some(c => c.includes('entering grace window'))).toBe(true);

    stderrSpy.mockRestore();
  }, 30000);

  it('execute-phase does NOT use grace window — uses old 2-retry behavior', async () => {
    const job = makeJob({ scope: 'phase', description: '5' });
    const plan = makePlan([{ command: 'execute-phase', args: '5 --auto' }]);

    // Phase dir exists but NO SUMMARY.md (execute-phase should fail without grace window)
    mockPhaseDirEntries = ['05-api'];
    mockPhaseDirFiles = ['05-01-PLAN.md']; // Only PLAN.md, no SUMMARY.md

    mockClaimNextLaunchable
      .mockReturnValueOnce(job)
      .mockReturnValue(null);
    mockDelegate.mockResolvedValue(plan);

    // Session must be inactive with old message so spawnAndWait completes
    mockFindSessionByTitle.mockReturnValue('session-exec-no-grace');
    mockIsSessionActive.mockReturnValue(false);
    mockGetLastMessage.mockReturnValue({
      id: 'msg-exec-ng',
      role: 'assistant',
      content: 'Phase 5 execution complete.',
      createdAt: Date.now() - 120_000, // Old — spawn done
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const runner = createRunner({ once: true, pollInterval: 1 });
    await runner.run();

    const stderrCalls = stderrSpy.mock.calls.map(c => String(c[0]));

    // execute-phase should fail — no SUMMARY.md (uses old 2-retry, no grace window)
    expect(mockMarkFailed).toHaveBeenCalledWith('ab12', expect.stringContaining('artifact check failed'));
    expect(mockMarkCompleted).not.toHaveBeenCalled();

    // Should NOT have entered grace window messages
    expect(stderrCalls.some(c => c.includes('entering grace window'))).toBe(false);
    expect(stderrCalls.some(c => c.includes('session inactive'))).toBe(false);

    stderrSpy.mockRestore();
  }, 30000);
});

describe('scanPhaseDirs', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
    await restoreDefaultReaddirSync();
  });

  it('returns sorted phase directory names', () => {
    mockPhaseDirEntries = ['03-ui', '01-setup', '02-core'];
    const result = scanPhaseDirs('/tmp/test-projects/myproject');
    expect(result).toEqual(['01-setup', '02-core', '03-ui']);
  });

  it('returns empty array if no .planning/phases dir', async () => {
    const { readdirSync: mockReaddirSync } = await import('node:fs');
    vi.mocked(mockReaddirSync).mockImplementation(((dirPath: unknown) => {
      const dp = String(dirPath);
      if (dp.includes('.planning/phases')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return [];
    }) as typeof mockReaddirSync);
    const result = scanPhaseDirs('/tmp/test-projects/noproject');
    expect(result).toEqual([]);
  });

  it('filters out non-phase entries', () => {
    mockPhaseDirEntries = ['01-setup', 'README.md', '.gitkeep', '02-core'];
    const result = scanPhaseDirs('/tmp/test-projects/myproject');
    expect(result).toEqual(['01-setup', '02-core']);
  });
});

describe('verifyStepArtifacts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
    await restoreDefaultReaddirSync();
  });

  it('returns ok for non-phase commands', () => {
    const step: DelegationStep = { command: 'quick', args: 'Fix it' };
    const result = verifyStepArtifacts('/tmp/proj', step, []);
    expect(result.ok).toBe(true);
  });

  it('detects new phase directory after add-phase', () => {
    mockPhaseDirEntries = ['01-setup', '02-core', '03-new-feature'];
    const step: DelegationStep = { command: 'add-phase', args: 'New Feature' };
    const prevDirs = ['01-setup', '02-core'];
    const result = verifyStepArtifacts('/tmp/proj', step, prevDirs);
    expect(result.ok).toBe(true);
    expect(result.newPhaseNumber).toBe(3);
  });

  it('fails when add-phase creates no new dir', () => {
    mockPhaseDirEntries = ['01-setup', '02-core'];
    const step: DelegationStep = { command: 'add-phase', args: 'X' };
    const prevDirs = ['01-setup', '02-core'];
    const result = verifyStepArtifacts('/tmp/proj', step, prevDirs);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not create a new phase directory');
  });

  it('verifies PLAN.md exists for plan-phase', () => {
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['03-01-PLAN.md'];
    const step: DelegationStep = { command: 'plan-phase', args: '3 --auto' };
    const result = verifyStepArtifacts('/tmp/proj', step, []);
    expect(result.ok).toBe(true);
  });

  it('fails when no PLAN.md for plan-phase', () => {
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['STATE'];
    const step: DelegationStep = { command: 'plan-phase', args: '3 --auto' };
    const result = verifyStepArtifacts('/tmp/proj', step, []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not create any PLAN.md files');
  });

  it('verifies SUMMARY.md exists for execute-phase', () => {
    mockPhaseDirEntries = ['05-api'];
    mockPhaseDirFiles = ['05-01-SUMMARY.md'];
    const step: DelegationStep = { command: 'execute-phase', args: '5' };
    const result = verifyStepArtifacts('/tmp/proj', step, []);
    expect(result.ok).toBe(true);
  });

  it('fails when no SUMMARY.md for execute-phase', () => {
    mockPhaseDirEntries = ['05-api'];
    mockPhaseDirFiles = ['05-01-PLAN.md'];
    const step: DelegationStep = { command: 'execute-phase', args: '5' };
    const result = verifyStepArtifacts('/tmp/proj', step, []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not create any SUMMARY.md files');
  });
});

describe('patchStepArgs', () => {
  it('patches phase number in plan-phase and execute-phase args', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const steps: DelegationStep[] = [
      { command: 'add-phase', args: 'X' },
      { command: 'plan-phase', args: '21 --auto' },
      { command: 'execute-phase', args: '21' },
    ];
    patchStepArgs(steps, 1, 21, 22);
    expect(steps[1].args).toBe('22 --auto');
    expect(steps[2].args).toBe('22');
    stderrSpy.mockRestore();
  });

  it('does not patch args that do not match predicted phase', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const steps: DelegationStep[] = [
      { command: 'plan-phase', args: '10 --auto' },
      { command: 'execute-phase', args: '10' },
    ];
    patchStepArgs(steps, 0, 21, 22);
    // args should be unchanged since they don't match predicted (21)
    expect(steps[0].args).toBe('10 --auto');
    expect(steps[1].args).toBe('10');
    stderrSpy.mockRestore();
  });

  it('skips non-phase commands', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const steps: DelegationStep[] = [
      { command: 'quick', args: '21 something' },
      { command: 'plan-phase', args: '21 --auto' },
    ];
    patchStepArgs(steps, 0, 21, 22);
    expect(steps[0].args).toBe('21 something'); // quick not patched
    expect(steps[1].args).toBe('22 --auto');     // plan-phase patched
    stderrSpy.mockRestore();
  });

  it('patches verify-phase as well', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const steps: DelegationStep[] = [
      { command: 'verify-phase', args: '21' },
    ];
    patchStepArgs(steps, 0, 21, 22);
    expect(steps[0].args).toBe('22');
    stderrSpy.mockRestore();
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

describe('evaluateStepResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('failure patterns', () => {
    it('returns definite failure for "no matching phase" message', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-1',
        role: 'assistant',
        content: 'Error: no matching phase directory found for phase 3',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-1', 'execute-phase');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('no matching phase');
      expect(result.source).toBe('semantic-check');
      expect(result.certainty).toBe('definite');
    });

    it('returns definite failure for "failed to execute" message', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-2',
        role: 'assistant',
        content: 'Failed to execute phase 5 because plans are missing',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-2', 'execute-phase');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Semantic failure detected');
      expect(result.certainty).toBe('definite');
    });

    it('returns definite failure for "no plans found" message', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-3',
        role: 'assistant',
        content: 'No plans found in the phase directory',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-3', 'plan-phase');
      expect(result.success).toBe(false);
      expect(result.certainty).toBe('definite');
    });

    it('returns definite failure for "phase directory not found" message', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-4',
        role: 'assistant',
        content: 'Phase directory not found for phase 7',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-4', 'execute-phase');
      expect(result.success).toBe(false);
      expect(result.certainty).toBe('definite');
    });

    it('returns definite failure for "error execute" pattern', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-7',
        role: 'assistant',
        content: 'There was an error while trying to execute the phase',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-7', 'execute-phase');
      expect(result.success).toBe(false);
      expect(result.certainty).toBe('definite');
    });
  });

  describe('success patterns', () => {
    it('returns definite success for "Phase 3 execution complete"', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-5',
        role: 'assistant',
        content: 'Phase 3 execution complete. All 4 plans executed successfully. Created 12 files.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-5', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.reason).toContain('Success marker');
      expect(result.certainty).toBe('definite');
    });

    it('returns definite success for "all plans executed successfully"', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-s1',
        role: 'assistant',
        content: 'All 5 plans executed successfully in phase 7.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-s1', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('definite');
    });

    it('returns definite success for "verification passed"', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-s2',
        role: 'assistant',
        content: 'Verification passed — all checks green.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-s2', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('definite');
    });

    it('returns definite success for "planning complete"', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-s3',
        role: 'assistant',
        content: 'Planning complete. Created 3 plan files.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-s3', 'plan-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('definite');
    });

    it('returns definite success for "created 3 plan files"', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-s4',
        role: 'assistant',
        content: 'Created 3 plan files for phase 2.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-s4', 'plan-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('definite');
    });

    it('returns definite success for "Phase 5 done"', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-s5',
        role: 'assistant',
        content: 'Phase 5 done. Moving to next step.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-s5', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('definite');
    });
  });

  describe('uncertain results', () => {
    it('returns uncertain when message has no known patterns', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-u1',
        role: 'assistant',
        content: 'I updated some files and made changes to the codebase.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-u1', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('uncertain');
      expect(result.reason).toContain('uncertain');
    });

    it('returns success:true for uncertain (benefit of the doubt)', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-u2',
        role: 'assistant',
        content: 'Finished working on the task. Looks good.',
        createdAt: Date.now() - 60_000,
      });

      const result = evaluateStepResult('session-u2', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('uncertain');
    });

    it('logs warning to stderr for uncertain results', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      mockGetLastMessage.mockReturnValue({
        id: 'msg-u3',
        role: 'assistant',
        content: 'Some ambiguous message about work.',
        createdAt: Date.now() - 60_000,
      });

      evaluateStepResult('session-u3', 'execute-phase');

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[runner] Warning: Step result ambiguous'),
      );

      stderrSpy.mockRestore();
    });

    it('returns uncertain when no messages exist', () => {
      mockGetLastMessage.mockReturnValue(null);

      const result = evaluateStepResult('session-6', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.reason).toBe('No messages to evaluate');
      expect(result.certainty).toBe('uncertain');
    });
  });
});
