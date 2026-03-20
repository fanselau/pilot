import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobObservabilitySnapshot, JobStep } from '../../src/core/types.js';
import type { JobWhy } from '../../src/core/job-introspection.js';
import { buildJobExportMarkdown } from '../../src/core/job-export.js';

const mockGetJob = vi.fn();
const mockGetJobSteps = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(...args),
}));

const mockBuildJobObservability = vi.fn();

vi.mock('../../src/core/job-observability.js', () => ({
  buildJobObservability: (...args: unknown[]) => mockBuildJobObservability(...args),
}));

const mockBuildJobWhy = vi.fn();
const mockBuildRetryWhy = vi.fn();
const mockBuildUndoWhy = vi.fn();

vi.mock('../../src/core/job-introspection.js', () => ({
  buildJobWhy: (...args: unknown[]) => mockBuildJobWhy(...args),
  buildRetryWhy: (...args: unknown[]) => mockBuildRetryWhy(...args),
  buildUndoWhy: (...args: unknown[]) => mockBuildUndoWhy(...args),
}));

const mockGetConfig = vi.fn();

vi.mock('../../src/core/config.js', () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  isJsonMode: () => mockJsonMode,
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
}));

const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

import { exportCommand } from '../../src/commands/export.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'alpha',
    scope: 'phase',
    description: 'Implement export command for observability.',
    requirementPath: 'requirements/job-observability-cost-tracking-and-export.md',
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08T01:00:00Z',
    startedAt: '2026-03-08T01:01:00Z',
    completedAt: '2026-03-08T01:12:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 2,
    sessionTitles: '["alpha-execute-phase-1"]',
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: ['anthropic/claude-sonnet-4-6'],
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '2222222222222222222222222222222222222222',
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

function makeStep(overrides: Partial<JobStep> = {}): JobStep {
  return {
    id: 1,
    jobId: 'ab12',
    stepIndex: 0,
    command: 'execute-phase',
    args: '45 --auto',
    sessionTitle: 'alpha-execute-phase-1',
    sessionId: 's1',
    status: 'completed',
    verdictSource: 'semantic-check',
    verdictReason: 'build passed and tests passed',
    startedAt: '2026-03-08T01:01:00Z',
    completedAt: '2026-03-08T01:06:00Z',
    durationMs: 300000,
    ...overrides,
  };
}

function makeObservability(overrides: Partial<JobObservabilitySnapshot> = {}): JobObservabilitySnapshot {
  return {
    jobId: 'ab12',
    jobStatus: 'completed',
    terminal: true,
    requested: {
      modelProfile: 'balanced',
      providerMode: 'hybrid',
      scope: 'phase',
      intendedExecutorModel: 'anthropic/claude-sonnet-4-6',
      notes: [],
    },
    observed: {
      status: 'available',
      models: ['anthropic/claude-sonnet-4-6'],
      notes: [],
    },
    tokens: {
      status: 'available',
      totals: {
        input: 1200,
        output: 800,
        reasoning: 300,
        cacheRead: 50,
        cacheWrite: 20,
        total: 2370,
      },
      byModel: {
        'anthropic/claude-sonnet-4-6': {
          input: 1200,
          output: 800,
          reasoning: 300,
          cacheRead: 50,
          cacheWrite: 20,
          total: 2370,
        },
      },
      notes: [],
    },
    cost: {
      status: 'estimated',
      currency: 'USD',
      estimatedUsd: 0.032,
      byModel: [
        {
          model: 'anthropic/claude-sonnet-4-6',
          status: 'estimated',
          estimatedUsd: 0.032,
          tokens: {
            input: 1200,
            output: 800,
            reasoning: 300,
            cacheRead: 50,
            cacheWrite: 20,
            total: 2370,
          },
          notes: [],
        },
      ],
      notes: [],
    },
    ...overrides,
  };
}

const statusWhy: JobWhy = {
  code: 'undo-safe',
  badge: 'undo:safe',
  what: 'Undo checkpoints look compatible.',
  why: 'Base/head checkpoints exist with no active guard signals.',
  next: 'Run pilot undo ab12 --dry-run to preview rollback.',
};

const retryWhy: JobWhy = {
  code: 'not-applicable',
  badge: 'n/a',
  what: 'Job is completed.',
  why: 'Retry only applies to failed or cancelled jobs.',
  next: 'Queue a new job for follow-up work.',
};

const undoWhy: JobWhy = {
  code: 'undo-safe',
  badge: 'undo:safe',
  what: 'Undo checkpoints look compatible.',
  why: 'Base/head checkpoints exist with no active guard signals.',
  next: 'Run pilot undo ab12 --dry-run to preview rollback.',
};

describe('buildJobExportMarkdown', () => {
  it('builds a success artifact with requested/observed/estimated semantics and commit delta', () => {
    const markdown = buildJobExportMarkdown({
      job: makeJob(),
      steps: [
        makeStep({ stepIndex: 0, command: 'plan-phase', args: '45 --auto' }),
        makeStep({ id: 2, stepIndex: 1, command: 'execute-phase', args: '45 --auto' }),
      ],
      observability: makeObservability(),
      statusWhy,
      retryWhy,
      undoWhy,
      generatedAt: new Date('2026-03-08T01:20:00Z'),
    });

    expect(markdown).toContain('# Pilot Job Export: ab12');
    expect(markdown).toContain('Requested run configuration (`requested`)');
    expect(markdown).toContain('Actual models (`observed` = available): `anthropic/claude-sonnet-4-6`');
    expect(markdown).toContain('Cost estimate status (`estimated`): estimated');
    expect(markdown).toContain('Estimated cost (`estimated`): $0.0320 USD');
    expect(markdown).toContain('Commit delta: changed');
    expect(markdown).toContain('Requirement path: requirements/job-observability-cost-tracking-and-export.md');
    expect(markdown).toContain('step 1: plan-phase 45 --auto');
    expect(markdown).toContain('step 2: execute-phase 45 --auto');
  });

  it('builds a failure artifact with failure context and retry guidance', () => {
    const markdown = buildJobExportMarkdown({
      job: makeJob({
        status: 'failed',
        error: 'verification failed',
        gitHeadCommit: '1111111111111111111111111111111111111111',
      }),
      steps: [
        makeStep({ stepIndex: 0, command: 'plan-phase', status: 'completed' }),
        makeStep({
          id: 2,
          stepIndex: 1,
          command: 'execute-phase',
          status: 'failed',
          verdictReason: 'build failed due to type errors in export command implementation',
        }),
      ],
      observability: makeObservability({
        jobStatus: 'failed',
      }),
      statusWhy: {
        code: 'failed',
        badge: 'failed',
        what: 'Last run failed.',
        why: 'Latest failure: verification failed',
        next: 'Run pilot unblock "test-proj" and queue a new job.',
      },
      retryWhy: {
        code: 'failed',
        badge: 'failed',
        what: 'Last run failed.',
        why: 'Latest failure: verification failed',
        next: 'Run pilot unblock "test-proj" and queue a new job.',
      },
      undoWhy: {
        code: 'undo-safe',
        badge: 'undo:safe',
        what: 'Undo checkpoints look compatible.',
        why: 'Base/head checkpoints exist with no active guard signals.',
        next: 'Run pilot undo ab12 --dry-run to preview rollback.',
      },
    });

    expect(markdown).toContain('Outcome summary: Last run failed.');
    expect(markdown).toContain('Failure context: execute-phase 45 --auto');
    expect(markdown).toContain('Failure reason: build failed due to type errors in export command implementation');
    expect(markdown).toContain('Retry context: Last run failed.');
    expect(markdown).toContain('Commit delta: no-op');
  });

  it('shows explicit unavailable/partial caveats when observability data is missing', () => {
    const markdown = buildJobExportMarkdown({
      job: makeJob({
        status: 'running',
        startedAt: '2026-03-08T01:01:00Z',
        completedAt: null,
        gitBaseCommit: null,
        gitHeadCommit: null,
      }),
      steps: [
        makeStep({
          stepIndex: 0,
          command: 'execute-phase',
          status: 'running',
          verdictSource: null,
          verdictReason: null,
        }),
      ],
      observability: makeObservability({
        jobStatus: 'running',
        terminal: false,
        observed: {
          status: 'unavailable',
          models: [],
          notes: ['No session titles are recorded for this job yet.'],
        },
        tokens: {
          status: 'partial',
          totals: null,
          byModel: {},
          notes: ['Job is still running; token totals are live and may increase.'],
        },
        cost: {
          status: 'unavailable',
          currency: 'USD',
          estimatedUsd: null,
          byModel: [],
          notes: ['No per-model token usage available.'],
        },
      }),
      statusWhy: {
        code: 'running',
        badge: 'running',
        what: 'Job is currently running.',
        why: 'Runner claimed this job and started execution.',
        next: 'Use pilot log <id> for live progress.',
      },
      retryWhy: {
        code: 'not-applicable',
        badge: 'n/a',
        what: 'Job is running.',
        why: 'Retry only applies to failed or cancelled jobs.',
        next: 'Wait for terminal state.',
      },
      undoWhy: {
        code: 'undo-unavailable',
        badge: 'undo:unavailable',
        what: 'Undo checkpoints are not actionable yet.',
        why: 'Undo is only safe to evaluate after terminal status.',
        next: 'Wait for completion/failure, then run pilot undo --dry-run.',
      },
    });

    expect(markdown).toContain('Actual models (`observed` = unavailable): unavailable');
    expect(markdown).toContain('Token status (`observed`): partial');
    expect(markdown).toContain('Token totals (`observed`): unavailable');
    expect(markdown).toContain('Cost estimate status (`estimated`): unavailable');
    expect(markdown).toContain('Estimated cost (`estimated`): unavailable');
    expect(markdown).toContain('No session titles are recorded for this job yet.');
    expect(markdown).toContain('No per-model token usage available.');
    expect(markdown).toContain('Commit delta: unknown');
  });
});

describe('exportCommand', () => {
  let stderrSpy: any;
  let exitSpy: any;
  let stdoutSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;

    mockGetJob.mockReturnValue(makeJob());
    mockGetJobSteps.mockReturnValue([makeStep()]);
    mockBuildJobObservability.mockReturnValue(makeObservability());
    mockBuildJobWhy.mockReturnValue(statusWhy);
    mockBuildRetryWhy.mockReturnValue(retryWhy);
    mockBuildUndoWhy.mockReturnValue(undoWhy);
    mockGetConfig.mockReturnValue({ pilotDir: '/tmp/pilot-home' });

    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('writes markdown export to the default output location', async () => {
    await exportCommand('ab12', {});

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/pilot-home/exports', { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(mockWriteFileSync.mock.calls[0][0]).toBe('/tmp/pilot-home/exports/job-ab12.md');
    expect(String(mockWriteFileSync.mock.calls[0][1])).toContain('# Pilot Job Export: ab12');
    expect(mockOutputHuman).toHaveBeenCalledWith(expect.stringContaining('Export written: /tmp/pilot-home/exports/job-ab12.md'));
  });

  it('supports explicit output path control via --output', async () => {
    await exportCommand('ab12', { output: '/tmp/custom/report.md' });

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/custom', { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/custom/report.md',
      expect.stringContaining('# Pilot Job Export: ab12'),
      'utf8',
    );
  });

  it('supports stdout mode without writing files', async () => {
    await exportCommand('ab12', { stdout: true });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('# Pilot Job Export: ab12'));
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('fails with clear error when the job does not exist', async () => {
    mockGetJob.mockReturnValue(null);

    await expect(exportCommand('zz99', {})).rejects.toThrow('exit:1');

    expect(stderrSpy).toHaveBeenCalledWith('Job not found: zz99\n');
  });

  it('fails with actionable error when writing export fails', async () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(exportCommand('ab12', {})).rejects.toThrow('exit:1');

    const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderr).toContain('Failed to write export artifact');
    expect(stderr).toContain('Try a different path with --output <path> or use --stdout');
  });
});
