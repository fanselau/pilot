/**
 * Tests for `pilot kill <id>` command.
 *
 * Covers:
 *   - Exits 1 when job not found
 *   - Works without --force flag (--force is now optional for backward compat)
 *   - Exits 1 for non-running job
 *   - Calls killJobSession then forceQuitJob for running job
 *   - Still calls forceQuitJob when killJobSession returns killed:false
 *   - Exits 1 when forceQuitJob returns ok:false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetJob = vi.fn();
const mockForceQuitJob = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  forceQuitJob: (...args: unknown[]) => mockForceQuitJob(...args),
}));

const mockKillJobSession = vi.fn();

vi.mock('../../src/core/runner.js', () => ({
  killJobSession: (...args: unknown[]) => mockKillJobSession(...args),
}));

vi.mock('../../src/util/output.js', () => ({
  outputHuman: vi.fn(),
  outputJson: vi.fn(),
  isJsonMode: vi.fn(() => false),
}));

vi.mock('../../src/util/colors.js', () => ({
  green: (s: string) => s,
  red: (s: string) => s,
}));

import { killCommand } from '../../src/commands/kill.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRunningJob(id = 'abc1'): Job {
  return {
    id,
    project: 'my-project',
    scope: 'quick',
    description: 'test',
    requirementPath: null,
    status: 'running',
    priority: 0,
    dependsOn: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: JSON.stringify([`my-project-execute-phase-${id}`]),
    parentJobId: null,
    resumeHint: null,
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('killCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('exits 1 when job not found', async () => {
    mockGetJob.mockReturnValue(null);
    await expect(killCommand('notfound', { force: true })).rejects.toThrow('exit:1');
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringMatching(/not found/i));
  });

  it('works without --force flag (force is now optional)', async () => {
    const job = makeRunningJob();
    mockGetJob.mockReturnValue(job);
    mockKillJobSession.mockResolvedValue({ killed: true, reason: 'Sent SIGTERM to PID 1234' });
    mockForceQuitJob.mockReturnValue({ ok: true, job });

    // Should NOT exit 1 — force is no longer required
    await killCommand('abc1', {});
    expect(mockKillJobSession).toHaveBeenCalledWith(job);
    expect(mockForceQuitJob).toHaveBeenCalledWith('abc1', 'cli');
  });

  it('exits 1 for non-running job', async () => {
    mockGetJob.mockReturnValue({ ...makeRunningJob(), status: 'pending' });
    await expect(killCommand('abc1', { force: true })).rejects.toThrow('exit:1');
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringMatching(/not running/i));
  });

  it('calls killJobSession then forceQuitJob for running job', async () => {
    const job = makeRunningJob();
    mockGetJob.mockReturnValue(job);
    mockKillJobSession.mockResolvedValue({ killed: true, reason: 'Sent SIGTERM to PID 1234' });
    mockForceQuitJob.mockReturnValue({ ok: true, job });

    await killCommand('abc1', { force: true });

    expect(mockKillJobSession).toHaveBeenCalledWith(job);
    expect(mockForceQuitJob).toHaveBeenCalledWith('abc1', 'cli');
  });

  it('still calls forceQuitJob even when killJobSession returns killed:false', async () => {
    const job = makeRunningJob();
    mockGetJob.mockReturnValue(job);
    mockKillJobSession.mockResolvedValue({ killed: false, reason: 'Process not found' });
    mockForceQuitJob.mockReturnValue({ ok: true, job });

    await killCommand('abc1', { force: true });

    // Both should be called regardless of kill outcome
    expect(mockKillJobSession).toHaveBeenCalled();
    expect(mockForceQuitJob).toHaveBeenCalledWith('abc1', 'cli');
  });

  it('exits 1 when forceQuitJob returns ok:false', async () => {
    const job = makeRunningJob();
    mockGetJob.mockReturnValue(job);
    mockKillJobSession.mockResolvedValue({ killed: true, reason: 'ok' });
    mockForceQuitJob.mockReturnValue({ ok: false, reason: 'DB error' });

    await expect(killCommand('abc1', { force: true })).rejects.toThrow('exit:1');
  });
});
