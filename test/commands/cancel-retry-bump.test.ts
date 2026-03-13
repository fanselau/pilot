/**
 * Tests for cancel, retry, and bump commands — status validation and behavior.
 *
 * Each command validates job status before operating:
 *   - cancel: only pending jobs
 *   - retry: only failed/cancelled jobs
 *   - bump: only pending jobs
 *
 * Mocks: db.ts, output.ts, colors.ts.
 * Uses vi.spyOn for process.stderr.write and process.exit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

// ── Mock data ──────────────────────────────────────────────────────────────

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
    resumeHint: null,
    attempts: 0,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockJobs: Record<string, Job> = {};
const mockCancel = vi.fn();
const mockRetry = vi.fn();
const mockBump = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (id: string) => mockJobs[id] ?? null,
  cancel: (...args: unknown[]) => mockCancel(...args),
  retry: (...args: unknown[]) => mockRetry(...args),
  bump: (...args: unknown[]) => mockBump(...args),
  unblockProject: vi.fn(),  // added in Plan 33-01: retry also unblocks project
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

import { cancelCommand } from '../../src/commands/cancel.js';
import { retryCommand } from '../../src/commands/retry.js';
import { bumpCommand } from '../../src/commands/bump.js';

// ── Setup / Teardown ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockJobs = {};

  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as never);
});

afterEach(() => {
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

// ── cancelCommand ──────────────────────────────────────────────────────────

describe('cancelCommand', () => {
  it('cancels a pending job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'pending' });

    await cancelCommand('ab12');

    expect(mockCancel).toHaveBeenCalledWith('ab12');
    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Cancelled');
    expect(output).toContain('ab12');
  });

  it('outputs JSON when json mode active', async () => {
    mockJsonMode = true;
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'pending' });

    await cancelCommand('ab12');

    expect(mockOutputJson).toHaveBeenCalledWith({ cancelled: 'ab12' });
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('exits 1 when job not found', async () => {
    await expect(cancelCommand('zzzz')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderr).toContain('Job not found');
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('rejects cancel on running job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'running' });

    await expect(cancelCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderr).toContain("Cannot cancel");
    expect(stderr).toContain("running");
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('rejects cancel on completed job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'completed' });

    await expect(cancelCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('rejects cancel on failed job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'failed' });

    await expect(cancelCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

// ── retryCommand ──────────────────────────────────────────────────────────

describe('retryCommand', () => {
  it('retries a failed job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'failed' });

    await retryCommand('ab12');

    expect(mockRetry).toHaveBeenCalledWith('ab12');
    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Retried');
    expect(output).toContain('pending');
  });

  it('retries a cancelled job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'cancelled' });

    await retryCommand('ab12');

    expect(mockRetry).toHaveBeenCalledWith('ab12');
  });

  it('outputs JSON when json mode active', async () => {
    mockJsonMode = true;
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'failed' });

    await retryCommand('ab12');

    expect(mockOutputJson).toHaveBeenCalledWith({ retried: 'ab12', unblocked: 'test-proj' });
  });

  it('supports --why explain-only mode without mutating state', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'failed', error: 'network timeout' });

    await retryCommand('ab12', { why: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Retry check: ab12');
    expect(output).toContain('what: Last run failed but appears retryable.');
    expect(output).toContain('next: Run pilot retry ab12.');
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('shows needs-revision guidance in --why mode for no-op failures', async () => {
    mockJobs['ab12'] = makeJob({
      id: 'ab12',
      status: 'failed',
      gitBaseCommit: 'abc',
      gitHeadCommit: 'abc',
    });

    await retryCommand('ab12', { why: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Retry alone is unlikely to fix this failure.');
    expect(output).toContain('Revise the requirement and queue a follow-up job.');
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('returns structured JSON reason in --why mode', async () => {
    mockJsonMode = true;
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'failed', error: 'judge failed' });

    await retryCommand('ab12', { why: true });

    expect(mockOutputJson).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ab12',
        status: 'failed',
        retryable: true,
        reason: expect.objectContaining({ code: 'retryable-failure' }),
      }),
    );
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('exits 1 when job not found', async () => {
    await expect(retryCommand('zzzz')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('rejects retry on pending job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'pending' });

    await expect(retryCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderr).toContain("Cannot retry");
    expect(stderr).toContain("pending");
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('rejects retry on running job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'running' });

    await expect(retryCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('rejects retry on completed job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'completed' });

    await expect(retryCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRetry).not.toHaveBeenCalled();
  });
});

// ── bumpCommand ────────────────────────────────────────────────────────────

describe('bumpCommand', () => {
  it('bumps a pending job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'pending' });

    await bumpCommand('ab12');

    expect(mockBump).toHaveBeenCalledWith('ab12');
    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Bumped');
    expect(output).toContain('front');
  });

  it('outputs JSON when json mode active', async () => {
    mockJsonMode = true;
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'pending' });

    await bumpCommand('ab12');

    expect(mockOutputJson).toHaveBeenCalledWith({ bumped: 'ab12' });
  });

  it('exits 1 when job not found', async () => {
    await expect(bumpCommand('zzzz')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockBump).not.toHaveBeenCalled();
  });

  it('rejects bump on running job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'running' });

    await expect(bumpCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(stderr).toContain("Cannot bump");
    expect(stderr).toContain("running");
    expect(mockBump).not.toHaveBeenCalled();
  });

  it('rejects bump on completed job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'completed' });

    await expect(bumpCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockBump).not.toHaveBeenCalled();
  });

  it('rejects bump on failed job', async () => {
    mockJobs['ab12'] = makeJob({ id: 'ab12', status: 'failed' });

    await expect(bumpCommand('ab12')).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockBump).not.toHaveBeenCalled();
  });
});
