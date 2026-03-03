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
const mockCancel = vi.fn();
const mockUpdateDelegationPlan = vi.fn();
const mockAdvanceStep = vi.fn();
const mockGetJob = vi.fn();
const mockUpdateSessionTitles = vi.fn();
const mockRecordStep = vi.fn(() => 1);  // returns row ID
const mockCompleteStep = vi.fn();
const mockSkipRemainingSteps = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getNextPending: (...args: unknown[]) => mockGetNextPending(...args),
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

import { Runner, createRunner, evaluateStepResult } from '../../src/core/runner.js';
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
      expect(mockResolveAllAgentModels).toHaveBeenCalledWith('balanced', 'claude-only');
      expect(mockPatchAgentFrontmatter).toHaveBeenCalled();
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
      expect(mockUpdateSessionTitles).toHaveBeenCalledTimes(3);
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

  describe('launch — semantic failure detection (R2)', () => {
    it('marks job failed when execute-phase output contains failure marker', async () => {
      const job = makeJob({ scope: 'phase', description: '3' });
      const plan = makePlan([{ command: 'execute-phase', args: '3' }]);

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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

      mockGetNextPending
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
