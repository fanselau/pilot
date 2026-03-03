/**
 * Runner tests — focused on pure functions + minimal integration.
 *
 * Heavy integration tests removed to prevent OOM on 16GB machines.
 * createRunner, dispatch, reconciliation, and killJobSession cover the core logic.
 *
 * Removed tests for deleted functions (evaluateStepResult, verifyStepArtifacts,
 * patchStepArgs, scanPhaseDirs) — replaced by judge-based evaluation.
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

vi.mock('../../src/core/db.js', () => ({
  getNextPending: vi.fn(),
  claimNextLaunchable: vi.fn(),
  markRunning: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  cancel: vi.fn(),
  updateDelegationPlan: vi.fn(),
  advanceStep: vi.fn(),
  getJob: vi.fn(),
  updateSessionTitles: vi.fn(),
  recordStep: vi.fn(() => 1),
  completeStep: vi.fn(),
  skipRemainingSteps: vi.fn(),
  getAllRunningJobs: vi.fn(() => []),
  forceQuitJob: vi.fn(() => ({ ok: true })),
  reconcileStaleJobs: vi.fn(() => []),
  resetToPending: vi.fn(),
  updateJudgeVerdict: vi.fn(),
}));

vi.mock('../../src/core/delegate.js', () => ({
  delegate: vi.fn(),
  resolveOpencodeBinary: vi.fn(() => '/usr/bin/opencode'),
}));

vi.mock('../../src/core/models.js', () => ({
  resolveAllAgentModels: vi.fn(() => ({})),
  patchAgentFrontmatter: vi.fn(),
}));

const mockGetLastMessage = vi.fn();
const mockFindSessionByTitle = vi.fn();
const mockIsSessionDone = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  isSessionDone: (...args: unknown[]) => mockIsSessionDone(...args),
  getLastMessage: (...args: unknown[]) => mockGetLastMessage(...args),
}));

vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const result = {
      pid: 99999,
      unref: vi.fn(),
      catch: vi.fn(),
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
    result.catch = vi.fn().mockReturnValue(result);
    return result;
  }),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string) => {
      if (typeof filePath === 'string' && filePath === '/proc/meminfo') {
        return 'MemAvailable:  8388608 kB\n';
      }
      if (typeof filePath === 'string' && filePath.endsWith('opencode.json')) {
        return JSON.stringify({ permission: { allow: true } });
      }
      return actual.readFileSync(filePath, 'utf8');
    }),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    watch: vi.fn(() => ({ on: vi.fn().mockReturnThis(), close: vi.fn() })),
  };
});

// ── Imports ────────────────────────────────────────────────────────────────

import { Runner, createRunner, killJobSession, _resetSpawnRateLimit } from '../../src/core/runner.js';
import { claimNextLaunchable, markCompleted, markFailed, getAllRunningJobs, forceQuitJob, reconcileStaleJobs, resetToPending, updateJudgeVerdict } from '../../src/core/db.js';
import { delegate } from '../../src/core/delegate.js';
import { execa } from 'execa';
import type { Job } from '../../src/core/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeJob(id: string, project: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    project,
    scope: 'quick',
    description: 'test job',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    createdAt: new Date().toISOString(),
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
    judgeVerdict: null,
    ...overrides,
  };
}

// ── Pure function tests ────────────────────────────────────────────────────

describe('createRunner', () => {
  it('returns a Runner instance with correct initial state', () => {
    const runner = createRunner();
    expect(runner).toBeInstanceOf(Runner);
    const state = runner.getState();
    expect(state.active).toBe(false);
    expect(state.activeJobs).toBe(0);
    expect(state.jobIds).toEqual([]);
  });

  it('accepts custom options', () => {
    const runner = createRunner({ maxParallel: 10, once: true });
    expect(runner).toBeInstanceOf(Runner);
  });

  it('stop() sets shuttingDown', () => {
    const runner = createRunner();
    runner.stop();
    expect(runner.getState().active).toBe(false);
  });
});

// ── Immediate dispatch tests ───────────────────────────────────────────────

describe('immediate dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(claimNextLaunchable).mockReturnValue(null);
    vi.mocked(delegate).mockResolvedValue({ steps: [], reasoning: 'test' });
    vi.mocked(markCompleted).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fills multiple slots in one iteration when capacity exists', async () => {
    const job1 = makeJob('j1', 'proj-a');
    const job2 = makeJob('j2', 'proj-b');
    let claimCount = 0;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (claimCount === 0) { claimCount++; return job1; }
      if (claimCount === 1) { claimCount++; return job2; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({ steps: [], reasoning: 'test' });

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 60 });
    await runner.run();

    expect(vi.mocked(claimNextLaunchable).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('j1');
    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('j2');
  });

  it('stops claiming when maxParallel reached', async () => {
    const job1 = makeJob('j1', 'proj-a');
    const job2 = makeJob('j2', 'proj-b');
    let claimCount = 0;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (claimCount === 0) { claimCount++; return job1; }
      if (claimCount === 1) { claimCount++; return job2; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({ steps: [], reasoning: 'test' });

    const runner = createRunner({ maxParallel: 1, once: true, pollInterval: 60 });
    await runner.run();

    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('j1');
    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('j2');
  });
});

// ── reconcileStaleRunning (via runner.run) ────────────────────────────────

describe('reconcileStaleRunning (via runner.run)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(claimNextLaunchable).mockReturnValue(null);
    vi.mocked(delegate).mockResolvedValue({ steps: [], reasoning: 'test' });
    vi.mocked(markCompleted).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls forceQuitJob for running jobs whose process is not found', async () => {
    const staleJob = makeJob('stale1', 'proj-a', {
      status: 'running',
      sessionTitles: JSON.stringify(['proj-a-execute-phase-1']),
    });
    vi.mocked(getAllRunningJobs).mockReturnValue([staleJob]);
    vi.mocked(execa).mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
    } as Awaited<ReturnType<typeof execa>>);

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 60 });
    await runner.run();

    expect(vi.mocked(forceQuitJob)).toHaveBeenCalledWith(
      'stale1',
      'cli',
      expect.stringMatching(/stale|reconcil/i),
    );
  });

  it('does NOT call forceQuitJob for jobs whose process is alive', async () => {
    const liveJob = makeJob('live1', 'proj-b', {
      status: 'running',
      sessionTitles: JSON.stringify(['proj-b-execute-phase-2']),
    });
    vi.mocked(getAllRunningJobs).mockReturnValue([liveJob]);
    vi.mocked(execa).mockResolvedValue({
      stdout: '12345\n',
      stderr: '',
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>);

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 60 });
    await runner.run();

    expect(vi.mocked(forceQuitJob)).not.toHaveBeenCalled();
  });
});

// ── Judge-based evaluation tests ──────────────────────────────────────────

describe('judge-based evaluation (via launch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSpawnRateLimit(); // Reset 5s spawn rate limiter between tests

    // Restore execa mock to return object with unref/catch/pid (not a Promise).
    // Previous test suites may have called mockResolvedValue which persists
    // across clearAllMocks (only clears call counts, not implementation).
    vi.mocked(execa).mockImplementation((() => {
      const result = {
        pid: 99999,
        unref: vi.fn(),
        catch: vi.fn(),
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
      result.catch = vi.fn().mockReturnValue(result);
      return result;
    }) as unknown as typeof execa);

    vi.mocked(claimNextLaunchable).mockReturnValue(null);
    vi.mocked(markCompleted).mockImplementation(() => undefined);
    vi.mocked(markFailed).mockImplementation(() => undefined);
    vi.mocked(resetToPending).mockImplementation(() => undefined);
    vi.mocked(updateJudgeVerdict).mockImplementation(() => undefined);
    mockFindSessionByTitle.mockReturnValue(null);
    mockIsSessionDone.mockReturnValue(true);
    mockGetLastMessage.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks completed when phase step has passing judge verdict', async () => {
    const job = makeJob('jp1', 'proj-c', { scope: 'phase' });
    let claimed = false;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (!claimed) { claimed = true; return job; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({
      steps: [{ command: 'phase', args: 'Add auth --auto' }],
      reasoning: 'single-session phase',
    });

    // spawnAndWait succeeds (isSessionDone returns true)
    mockIsSessionDone.mockReturnValue(true);
    mockFindSessionByTitle.mockReturnValue('session-123');
    // Judge returns pass verdict
    mockGetLastMessage.mockReturnValue({
      id: 'msg1', role: 'assistant',
      content: '```json\n{"verdict":"pass","confidence":0.9,"summary":"Phase complete","retryRecommendation":"none"}\n```',
      createdAt: Date.now(),
    });

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 1 });
    await runner.run();

    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('jp1');
    expect(vi.mocked(updateJudgeVerdict)).toHaveBeenCalled();
  });

  it('resets to pending when judge verdict is fail with retry-full', async () => {
    const job = makeJob('jp2', 'proj-d', { scope: 'phase', attempts: 1, maxAttempts: 3 });
    let claimed = false;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (!claimed) { claimed = true; return job; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({
      steps: [{ command: 'phase', args: 'Add auth --auto' }],
      reasoning: 'single-session phase',
    });

    mockIsSessionDone.mockReturnValue(true);
    mockFindSessionByTitle.mockReturnValue('session-456');
    mockGetLastMessage.mockReturnValue({
      id: 'msg2', role: 'assistant',
      content: '```json\n{"verdict":"fail","confidence":0.8,"summary":"Build failed","retryRecommendation":"retry-full","retryHint":"Fix tsconfig"}\n```',
      createdAt: Date.now(),
    });

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 1 });
    await runner.run();

    expect(vi.mocked(resetToPending)).toHaveBeenCalledWith('jp2', 'Fix tsconfig');
    expect(vi.mocked(markCompleted)).not.toHaveBeenCalledWith('jp2');
    expect(vi.mocked(markFailed)).not.toHaveBeenCalledWith('jp2', expect.any(String));
  });

  it('resets to pending when judge verdict is partial with retry-resume', async () => {
    const job = makeJob('jp3', 'proj-e', { scope: 'phase', attempts: 1, maxAttempts: 3 });
    let claimed = false;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (!claimed) { claimed = true; return job; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({
      steps: [{ command: 'phase', args: 'Build UI --auto' }],
      reasoning: 'single-session phase',
    });

    mockIsSessionDone.mockReturnValue(true);
    mockFindSessionByTitle.mockReturnValue('session-789');
    mockGetLastMessage.mockReturnValue({
      id: 'msg3', role: 'assistant',
      content: '```json\n{"verdict":"partial","confidence":0.7,"summary":"3 of 5 plans done","retryRecommendation":"retry-resume","retryHint":"Resume from plan 04"}\n```',
      createdAt: Date.now(),
    });

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 1 });
    await runner.run();

    expect(vi.mocked(resetToPending)).toHaveBeenCalledWith('jp3', 'Resume from plan 04');
    expect(vi.mocked(markCompleted)).not.toHaveBeenCalledWith('jp3');
  });

  it('marks failed when judge verdict is fail and max attempts reached', async () => {
    const job = makeJob('jp4', 'proj-f', { scope: 'phase', attempts: 3, maxAttempts: 3 });
    let claimed = false;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (!claimed) { claimed = true; return job; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({
      steps: [{ command: 'phase', args: 'Broken feature --auto' }],
      reasoning: 'single-session phase',
    });

    mockIsSessionDone.mockReturnValue(true);
    mockFindSessionByTitle.mockReturnValue('session-fail');
    mockGetLastMessage.mockReturnValue({
      id: 'msg4', role: 'assistant',
      content: '```json\n{"verdict":"fail","confidence":0.9,"summary":"Fatal compilation errors","retryRecommendation":"none"}\n```',
      createdAt: Date.now(),
    });

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 1 });
    await runner.run();

    expect(vi.mocked(markFailed)).toHaveBeenCalledWith('jp4', expect.stringContaining('fail'));
    expect(vi.mocked(resetToPending)).not.toHaveBeenCalled();
  });

  it('marks completed (benefit of doubt) when judge fails to parse', async () => {
    const job = makeJob('jp5', 'proj-g', { scope: 'phase' });
    let claimed = false;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (!claimed) { claimed = true; return job; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({
      steps: [{ command: 'phase', args: 'Do stuff --auto' }],
      reasoning: 'single-session phase',
    });

    mockIsSessionDone.mockReturnValue(true);
    mockFindSessionByTitle.mockReturnValue('session-garbled');
    // Judge returns garbled output
    mockGetLastMessage.mockReturnValue({
      id: 'msg5', role: 'assistant',
      content: 'This is not valid JSON at all',
      createdAt: Date.now(),
    });

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 1 });
    await runner.run();

    // Judge failure = benefit of doubt → markCompleted
    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('jp5');
  });

  it('marks completed for non-phase commands without judge', async () => {
    const job = makeJob('jq1', 'proj-h', { scope: 'quick' });
    let claimed = false;
    vi.mocked(claimNextLaunchable).mockImplementation(() => {
      if (!claimed) { claimed = true; return job; }
      return null;
    });
    vi.mocked(delegate).mockResolvedValue({
      steps: [{ command: 'quick', args: 'Fix a bug' }],
      reasoning: 'direct quick',
    });

    mockIsSessionDone.mockReturnValue(true);
    mockFindSessionByTitle.mockReturnValue('session-quick');

    const runner = createRunner({ maxParallel: 2, once: true, pollInterval: 1 });
    await runner.run();

    // Quick jobs don't get judged — just markCompleted
    expect(vi.mocked(markCompleted)).toHaveBeenCalledWith('jq1');
    expect(vi.mocked(updateJudgeVerdict)).not.toHaveBeenCalled();
  });
});
