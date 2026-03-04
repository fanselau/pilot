/**
 * Tests for `pilot milestone <action> <id>` command.
 *
 * Actions tested: status, resume, skip.
 * Mocks: db.ts, output.ts, colors.ts.
 * Uses real _getTestDb so DB state is isolated per test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

// ── Mock data helpers ──────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'test-proj',
    scope: 'quick',
    description: 'do stuff',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-02T10:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    resumeHint: null,
    judgeVerdict: null,
    actualModels: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

// We test milestoneCommand via mocked DB so we control all state.
let mockMilestone: Job | undefined;
let mockChildren: Job[] = [];
let mockCounts = { total: 0, completed: 0, failed: 0, running: 0, pending: 0, paused: 0 };

const mockRetry = vi.fn();
const mockCancel = vi.fn();
const mockUnpauseMilestone = vi.fn();
const mockClearDependsOn = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (_id: string) => mockMilestone,
  getChildJobs: (_id: string) => mockChildren,
  getMilestoneStatus: (_id: string) => mockCounts,
  retry: (...args: unknown[]) => mockRetry(...args),
  cancel: (...args: unknown[]) => mockCancel(...args),
  unpauseMilestone: (...args: unknown[]) => mockUnpauseMilestone(...args),
  clearDependsOn: (...args: unknown[]) => mockClearDependsOn(...args),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  isJsonMode: () => mockJsonMode,
}));

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
}));

import { milestoneCommand } from '../../src/commands/milestone.js';

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockMilestone = undefined;
  mockChildren = [];
  mockCounts = { total: 0, completed: 0, failed: 0, running: 0, pending: 0, paused: 0 };
});

// ── status action ──────────────────────────────────────────────────────────

describe('milestoneCommand status', () => {
  it('shows milestone info and child phases in human mode', async () => {
    mockMilestone = makeJob({ id: 'ms01', scope: 'milestone', status: 'completed', description: 'big milestone', project: 'my-app' });
    mockChildren = [
      makeJob({ id: 'ch01', scope: 'phase', status: 'completed', description: '1' }),
      makeJob({ id: 'ch02', scope: 'phase', status: 'running',   description: '2' }),
    ];
    mockCounts = { total: 2, completed: 1, failed: 0, running: 1, pending: 0, paused: 0 };

    await milestoneCommand('status', 'ms01');

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('ms01');
    expect(output).toContain('my-app');
    expect(output).toContain('big milestone');
    expect(output).toContain('1/2 completed');
    expect(output).toContain('ch01');
    expect(output).toContain('ch02');
  });

  it('outputs JSON with milestone, children, and counts', async () => {
    mockJsonMode = true;
    mockMilestone = makeJob({ id: 'ms01', scope: 'milestone', status: 'paused', description: 'big one', project: 'proj' });
    mockChildren = [makeJob({ id: 'ch01', scope: 'phase', status: 'failed', description: '1' })];
    mockCounts = { total: 1, completed: 0, failed: 1, running: 0, pending: 0, paused: 0 };

    await milestoneCommand('status', 'ms01');

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const data = mockOutputJson.mock.calls[0][0];
    expect(data).toHaveProperty('milestone');
    expect(data).toHaveProperty('children');
    expect(data).toHaveProperty('status');
    expect(data.milestone.id).toBe('ms01');
    expect(data.children).toHaveLength(1);
    expect(data.status.failed).toBe(1);
  });

  it('exits with error when job is not a milestone', async () => {
    mockMilestone = makeJob({ id: 'jb01', scope: 'quick', status: 'pending' });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);

    await expect(milestoneCommand('status', 'jb01')).rejects.toThrow('exit');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not a milestone'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('shows resume/skip hints when milestone is paused with a failed child', async () => {
    mockMilestone = makeJob({ id: 'ms02', scope: 'milestone', status: 'paused', description: 'paused one', project: 'proj' });
    mockChildren = [makeJob({ id: 'ch99', scope: 'phase', status: 'failed', description: 'Phase 2' })];
    mockCounts = { total: 1, completed: 0, failed: 1, running: 0, pending: 0, paused: 0 };

    await milestoneCommand('status', 'ms02');

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Milestone is paused');
    expect(output).toContain('pilot milestone resume ms02');
    expect(output).toContain('pilot milestone skip ms02');
  });
});

// ── resume action ──────────────────────────────────────────────────────────

describe('milestoneCommand resume', () => {
  it('retries failed child and unpauses milestone', async () => {
    mockMilestone = makeJob({ id: 'ms10', scope: 'milestone', status: 'paused', description: 'mile', project: 'proj' });
    mockChildren = [
      makeJob({ id: 'ch10', scope: 'phase', status: 'failed', description: 'Phase 2' }),
    ];

    await milestoneCommand('resume', 'ms10');

    expect(mockRetry).toHaveBeenCalledWith('ch10');
    expect(mockUnpauseMilestone).toHaveBeenCalledWith('ms10');
  });

  it('outputs JSON confirming resumed child on resume', async () => {
    mockJsonMode = true;
    mockMilestone = makeJob({ id: 'ms10', scope: 'milestone', status: 'paused', description: 'mile', project: 'proj' });
    mockChildren = [makeJob({ id: 'ch10', scope: 'phase', status: 'failed', description: 'Phase 2' })];

    await milestoneCommand('resume', 'ms10');

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const data = mockOutputJson.mock.calls[0][0];
    expect(data.resumed).toBe('ms10');
    expect(data.retriedChild).toBe('ch10');
  });

  it('exits with error when milestone is not paused', async () => {
    mockMilestone = makeJob({ id: 'ms11', scope: 'milestone', status: 'completed' });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);

    await expect(milestoneCommand('resume', 'ms11')).rejects.toThrow('exit');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not paused'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── skip action ────────────────────────────────────────────────────────────

describe('milestoneCommand skip', () => {
  it('cancels failed child, clears depends_on of next, unpauses milestone', async () => {
    mockMilestone = makeJob({ id: 'ms20', scope: 'milestone', status: 'paused', description: 'mile', project: 'proj' });
    mockChildren = [
      makeJob({ id: 'ch20', scope: 'phase', status: 'failed',  description: 'Phase 2', dependsOn: null }),
      makeJob({ id: 'ch21', scope: 'phase', status: 'pending', description: 'Phase 3', dependsOn: 'ch20' }),
    ];

    await milestoneCommand('skip', 'ms20');

    expect(mockCancel).toHaveBeenCalledWith('ch20');
    expect(mockClearDependsOn).toHaveBeenCalledWith('ch21');
    expect(mockUnpauseMilestone).toHaveBeenCalledWith('ms20');
  });

  it('outputs JSON with cancelled child and unblocked next phase', async () => {
    mockJsonMode = true;
    mockMilestone = makeJob({ id: 'ms20', scope: 'milestone', status: 'paused', description: 'mile', project: 'proj' });
    mockChildren = [
      makeJob({ id: 'ch20', scope: 'phase', status: 'failed',  description: 'Phase 2', dependsOn: null }),
      makeJob({ id: 'ch21', scope: 'phase', status: 'pending', description: 'Phase 3', dependsOn: 'ch20' }),
    ];

    await milestoneCommand('skip', 'ms20');

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const data = mockOutputJson.mock.calls[0][0];
    expect(data.skipped).toBe('ms20');
    expect(data.cancelledChild).toBe('ch20');
    expect(data.unblocked).toBe('ch21');
  });

  it('skips with no next phase when failed child is last', async () => {
    mockMilestone = makeJob({ id: 'ms22', scope: 'milestone', status: 'paused', description: 'mile', project: 'proj' });
    mockChildren = [
      makeJob({ id: 'ch22', scope: 'phase', status: 'failed', description: 'Phase 3', dependsOn: null }),
      // no pending child that depends on ch22
    ];

    await milestoneCommand('skip', 'ms22');

    expect(mockCancel).toHaveBeenCalledWith('ch22');
    expect(mockClearDependsOn).not.toHaveBeenCalled();
    expect(mockUnpauseMilestone).toHaveBeenCalledWith('ms22');
  });

  it('exits with error when milestone is not paused', async () => {
    mockMilestone = makeJob({ id: 'ms23', scope: 'milestone', status: 'running' });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);

    await expect(milestoneCommand('skip', 'ms23')).rejects.toThrow('exit');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not paused'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
