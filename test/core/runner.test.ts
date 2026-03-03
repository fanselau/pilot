/**
 * Runner tests — focused on pure functions + minimal integration.
 * 
 * Heavy integration tests removed to prevent OOM on 16GB machines.
 * Pure function tests (scanPhaseDirs, verifyStepArtifacts, patchStepArgs,
 * evaluateStepResult, createRunner) cover the core logic without async overhead.
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

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: vi.fn(),
  isSessionActive: vi.fn(),
  getLastMessage: (...args: unknown[]) => mockGetLastMessage(...args),
}));

vi.mock('execa', () => ({
  execa: vi.fn(() => ({ unref: vi.fn(), catch: vi.fn().mockReturnThis(), stdout: '' })),
}));

// Dynamic mock data for readdirSync
let mockPhaseDirEntries: string[] = [];
let mockPhaseDirFiles: string[] = [];

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
    readdirSync: vi.fn((dirPath: string) => {
      if (typeof dirPath === 'string' && dirPath.endsWith('.planning/phases')) {
        return [...mockPhaseDirEntries];
      }
      if (typeof dirPath === 'string' && dirPath.includes('.planning/phases/')) {
        return [...mockPhaseDirFiles];
      }
      return [];
    }),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    watch: vi.fn(() => ({ on: vi.fn().mockReturnThis(), close: vi.fn() })),
  };
});

// ── Imports ────────────────────────────────────────────────────────────────

import { Runner, createRunner, evaluateStepResult, scanPhaseDirs, verifyStepArtifacts, patchStepArgs } from '../../src/core/runner.js';
import { claimNextLaunchable, markCompleted, getAllRunningJobs, forceQuitJob, reconcileStaleJobs } from '../../src/core/db.js';
import { delegate } from '../../src/core/delegate.js';
import { execa } from 'execa';
import type { DelegationStep, Job } from '../../src/core/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

async function resetReaddirMock(): Promise<void> {
  const { readdirSync } = await import('node:fs');
  vi.mocked(readdirSync).mockImplementation(((dirPath: unknown) => {
    const dp = String(dirPath);
    if (dp.endsWith('.planning/phases')) return [...mockPhaseDirEntries];
    if (dp.includes('.planning/phases/')) return [...mockPhaseDirFiles];
    return [];
  }) as typeof readdirSync);
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

describe('scanPhaseDirs', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
    await resetReaddirMock();
  });

  it('returns sorted phase directory names', () => {
    mockPhaseDirEntries = ['03-ui', '01-setup', '02-core'];
    expect(scanPhaseDirs('/tmp/proj')).toEqual(['01-setup', '02-core', '03-ui']);
  });

  it('returns empty array if no .planning/phases dir', async () => {
    const { readdirSync } = await import('node:fs');
    vi.mocked(readdirSync).mockImplementation(((dp: unknown) => {
      if (String(dp).includes('.planning/phases')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return [];
    }) as typeof readdirSync);
    expect(scanPhaseDirs('/tmp/nope')).toEqual([]);
  });

  it('filters out non-phase entries', async () => {
    mockPhaseDirEntries = ['01-setup', 'README.md', '.gitkeep', '02-core'];
    await resetReaddirMock();
    expect(scanPhaseDirs('/tmp/proj')).toEqual(['01-setup', '02-core']);
  });
});

describe('verifyStepArtifacts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPhaseDirEntries = [];
    mockPhaseDirFiles = [];
    await resetReaddirMock();
  });

  it('returns ok for non-phase commands', () => {
    const result = verifyStepArtifacts('/tmp/proj', { command: 'quick', args: 'Fix it' }, []);
    expect(result.ok).toBe(true);
  });

  it('detects new phase directory after add-phase', async () => {
    mockPhaseDirEntries = ['01-setup', '02-core', '03-new'];
    await resetReaddirMock();
    const result = verifyStepArtifacts('/tmp/proj', { command: 'add-phase', args: 'New' }, ['01-setup', '02-core']);
    expect(result.ok).toBe(true);
    expect(result.newPhaseNumber).toBe(3);
  });

  it('fails when add-phase creates no new dir', async () => {
    mockPhaseDirEntries = ['01-setup', '02-core'];
    await resetReaddirMock();
    const result = verifyStepArtifacts('/tmp/proj', { command: 'add-phase', args: 'X' }, ['01-setup', '02-core']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not create a new phase directory');
  });

  it('verifies PLAN.md exists for plan-phase', async () => {
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['03-01-PLAN.md'];
    await resetReaddirMock();
    const result = verifyStepArtifacts('/tmp/proj', { command: 'plan-phase', args: '3 --auto' }, []);
    expect(result.ok).toBe(true);
  });

  it('fails when no PLAN.md for plan-phase', async () => {
    mockPhaseDirEntries = ['03-ui'];
    mockPhaseDirFiles = ['STATE'];
    await resetReaddirMock();
    const result = verifyStepArtifacts('/tmp/proj', { command: 'plan-phase', args: '3 --auto' }, []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('did not create any PLAN.md files');
  });

  it('verifies SUMMARY.md exists for execute-phase', async () => {
    mockPhaseDirEntries = ['05-api'];
    mockPhaseDirFiles = ['05-01-SUMMARY.md'];
    await resetReaddirMock();
    const result = verifyStepArtifacts('/tmp/proj', { command: 'execute-phase', args: '5' }, []);
    expect(result.ok).toBe(true);
  });

  it('fails when no SUMMARY.md for execute-phase', async () => {
    mockPhaseDirEntries = ['05-api'];
    mockPhaseDirFiles = ['05-01-PLAN.md'];
    await resetReaddirMock();
    const result = verifyStepArtifacts('/tmp/proj', { command: 'execute-phase', args: '5' }, []);
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
    expect(steps[0].args).toBe('21 something');
    expect(steps[1].args).toBe('22 --auto');
    stderrSpy.mockRestore();
  });

  it('patches verify-phase as well', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const steps: DelegationStep[] = [{ command: 'verify-phase', args: '21' }];
    patchStepArgs(steps, 0, 21, 22);
    expect(steps[0].args).toBe('22');
    stderrSpy.mockRestore();
  });
});

// ── Dispatch + reconcileStaleRunning test helpers ──────────────────────────

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
    ...overrides,
  };
}

// ── Immediate dispatch tests ───────────────────────────────────────────────

describe('immediate dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset claimNextLaunchable to return null by default (no jobs)
    vi.mocked(claimNextLaunchable).mockReturnValue(null);
    // Default delegate resolves immediately with empty steps
    vi.mocked(delegate).mockResolvedValue({ steps: [], reasoning: 'test' });
    // Default markCompleted is a no-op
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

    // Both jobs should have been launched — claimNextLaunchable called 3 times (j1, j2, null)
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

    // With maxParallel=1: j1 runs, completes, j2 runs, completes, then null
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
    // pgrep returns empty stdout → process not found
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
    // pgrep returns a PID → process found
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

describe('evaluateStepResult', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('failure patterns', () => {
    const failureCases = [
      ['no matching phase', 'Error: no matching phase directory found for phase 3'],
      ['failed to execute', 'Failed to execute phase 5 because plans are missing'],
      ['no plans found', 'No plans found in the phase directory'],
      ['phase directory not found', 'Phase directory not found for phase 7'],
      ['error execute', 'There was an error while trying to execute the phase'],
    ];

    it.each(failureCases)('detects "%s" as definite failure', (_label, content) => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-f', role: 'assistant', content, createdAt: Date.now() - 60_000,
      });
      const result = evaluateStepResult('s1', 'execute-phase');
      expect(result.success).toBe(false);
      expect(result.certainty).toBe('definite');
    });
  });

  describe('success patterns', () => {
    const successCases = [
      ['execution complete', 'Phase 3 execution complete. All 4 plans executed successfully.'],
      ['all plans executed', 'All 5 plans executed successfully in phase 7.'],
      ['verification passed', 'Verification passed — all checks green.'],
      ['planning complete', 'Planning complete. Created 3 plan files.'],
      ['created N plan files', 'Created 3 plan files for phase 2.'],
      ['Phase N done', 'Phase 5 done. Moving to next step.'],
    ];

    it.each(successCases)('detects "%s" as definite success', (_label, content) => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-s', role: 'assistant', content, createdAt: Date.now() - 60_000,
      });
      const result = evaluateStepResult('s1', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('definite');
    });
  });

  describe('uncertain results', () => {
    it('returns uncertain with success:true for unknown patterns', () => {
      mockGetLastMessage.mockReturnValue({
        id: 'msg-u', role: 'assistant', content: 'I updated some files.', createdAt: Date.now() - 60_000,
      });
      const result = evaluateStepResult('s1', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.certainty).toBe('uncertain');
    });

    it('returns uncertain when no messages exist', () => {
      mockGetLastMessage.mockReturnValue(null);
      const result = evaluateStepResult('s1', 'execute-phase');
      expect(result.success).toBe(true);
      expect(result.reason).toBe('No messages to evaluate');
    });

    it('logs warning to stderr for uncertain results', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      mockGetLastMessage.mockReturnValue({
        id: 'msg-u', role: 'assistant', content: 'Some ambiguous message.', createdAt: Date.now() - 60_000,
      });
      evaluateStepResult('s1', 'execute-phase');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[runner] Warning: Step result ambiguous'));
      stderrSpy.mockRestore();
    });
  });
});
