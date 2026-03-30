import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Job, JobStep } from '../../src/core/types.js';
import type { JobExecutiveSummary } from '../../src/core/job-summary.js';

const mockGetJob = vi.fn();
const mockGetQueue = vi.fn();
const mockGetJobSteps = vi.fn();
const mockBuildJobExecutiveSummary = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  getJobSteps: (...args: unknown[]) => mockGetJobSteps(...args),
}));

vi.mock('../../src/core/job-summary.js', () => ({
  buildJobExecutiveSummary: (...args: unknown[]) => mockBuildJobExecutiveSummary(...args),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  isJsonMode: () => mockJsonMode,
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
}));

vi.mock('../../src/util/colors.js', () => ({
  bold: (s: string) => s,
  dim: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
  cyan: (s: string) => s,
}));

import { summaryCommand } from '../../src/commands/summary.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'my-project',
    scope: 'phase',
    description: 'test job',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-30T00:00:00Z',
    startedAt: '2026-03-30T00:01:00Z',
    completedAt: '2026-03-30T00:10:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 1,
    sessionTitles: '[]',
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    runtimeSkillSnapshot: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 2,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<JobStep> = {}): JobStep {
  return {
    id: 1,
    jobId: 'ab12',
    stepIndex: 0,
    command: 'execute-phase',
    args: '102 --auto',
    source: 'delegation',
    status: 'completed',
    sessionId: null,
    sessionTitle: 'session-1',
    reason: null,
    startedAt: '2026-03-30T00:01:00Z',
    completedAt: '2026-03-30T00:02:00Z',
    error: null,
    durationMs: 60000,
    verdictSource: null,
    verdictReason: null,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<JobExecutiveSummary> = {}): JobExecutiveSummary {
  return {
    what: 'Implemented shared executive summary builder',
    why: 'Phase 102 requires a reusable summary surface',
    next: 'Run pilot summary ab12 for the latest state',
    statusBadge: 'completed',
    outcome: 'success',
    currentOrFinalStep: {
      index: 2,
      total: 2,
      command: 'execute-phase',
      status: 'completed',
    },
    failureReason: null,
    judge: {
      verdict: 'passed',
      confidence: 92,
      reason: 'All checks passed',
      badge: 'judge:pass 92%',
    },
    verification: {
      status: 'passed',
      actionableGapCount: 0,
      humanVerificationCount: 0,
      routingDecision: 'complete',
      routingReason: 'No remaining gaps',
      artifactPath: 'artifacts/verify/ab12/report.md',
    },
    commitDelta: {
      state: 'changed',
      baseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    observability: {
      jobId: 'ab12',
      jobStatus: 'completed',
      terminal: true,
      requested: { modelProfile: 'balanced', providerMode: 'hybrid', scope: 'phase', intendedExecutorModel: 'model', notes: [] },
      observed: { status: 'available', models: ['model'], notes: [] },
      tokens: { status: 'available', totals: { input: 1, output: 2, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 3 }, byModel: {}, notes: [] },
      cost: { status: 'estimated', currency: 'USD', estimatedUsd: 0.02, byModel: [], notes: [] },
    },
    keyArtifacts: ['artifacts/verify/ab12/report.md', 'src/core/job-summary.ts'],
    lastAssistantMessages: [
      { stepIndex: 2, sessionTitle: 'session-2', text: 'Shared builder is now in place.' },
      { stepIndex: 1, sessionTitle: 'session-1', text: 'Tests are green.' },
    ],
    steps: [
      {
        stepIndex: 1,
        command: 'plan-phase',
        args: '102',
        status: 'completed',
        source: 'delegation',
        sessionTitle: 'session-1',
        verdictSource: null,
        verdictReason: null,
        error: null,
        durationMs: 1000,
        shortSummary: 'Planned summary work',
        evidence: [],
      },
    ],
    drilldown: {
      summaryCommand: 'pilot summary ab12',
      logCommand: 'pilot log ab12',
      unblockCommand: 'pilot unblock "my-project"',
    },
    ...overrides,
  };
}

describe('summaryCommand', () => {
  let exitSpy: any;
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonMode = false;
    mockGetQueue.mockReturnValue([]);
    mockGetJob.mockReturnValue(makeJob());
    mockGetJobSteps.mockReturnValue([makeStep()]);
    mockBuildJobExecutiveSummary.mockReturnValue(makeSummary());
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('renders compact human output with outcome summary, artifacts, assistant messages, and drilldown', async () => {
    await summaryCommand('ab12', {});

    const output = mockOutputHuman.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('my-project · phase · ab12 · success · completed');
    expect(output).toContain('what: Implemented shared executive summary builder');
    expect(output).toContain('why: Phase 102 requires a reusable summary surface');
    expect(output).toContain('next: Run pilot summary ab12 for the latest state');
    expect(output).toContain('step: 2/2 execute-phase [completed]');
    expect(output).toContain('judge: judge:pass 92%');
    expect(output).toContain('verification: passed · actionable=0 · human=0 · routing=complete');
    expect(output).toContain('key artifacts: artifacts/verify/ab12/report.md, src/core/job-summary.ts');
    expect(output).toContain('assistant messages:');
    expect(output).toContain('2. Shared builder is now in place.');
    expect(output).toContain('drilldown:');
    expect(output).toContain('pilot log ab12');
  });

  it('emits the same { job, summary } JSON structure', async () => {
    mockJsonMode = true;

    await summaryCommand('ab12', { json: true });

    expect(mockOutputJson).toHaveBeenCalledWith({
      job: {
        id: 'ab12',
        project: 'my-project',
        scope: 'phase',
        description: 'test job',
        status: 'completed',
        attempts: 1,
        currentStep: 1,
      },
      summary: makeSummary(),
    });
  });

  it('uses the latest running job when no id is provided', async () => {
    mockGetQueue.mockReturnValue([
      makeJob({ id: 'zz99', status: 'running' }),
      makeJob({ id: 'ab12', status: 'completed' }),
    ]);
    mockGetJob.mockImplementation((id: string) => makeJob({ id, status: 'running' }));

    await summaryCommand(undefined, {});

    expect(mockGetJob).toHaveBeenCalledWith('zz99');
    expect(mockGetJobSteps).toHaveBeenCalledWith('zz99');
  });

  it('errors when no running job exists and no id is provided', async () => {
    await expect(summaryCommand(undefined, {})).rejects.toThrow('process.exit:1');
    expect(stderrSpy).toHaveBeenCalledWith('No running jobs. Specify a job ID: pilot summary <id>\n');
  });

  it('errors when the job does not exist', async () => {
    mockGetJob.mockReturnValue(null);

    await expect(summaryCommand('missing', {})).rejects.toThrow('process.exit:1');
    expect(stderrSpy).toHaveBeenCalledWith('Job not found: missing\n');
  });

  it('documents the summary command and log summary help text in the CLI entrypoint', () => {
    const indexSource = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');

    expect(indexSource).toContain("command('summary [id]')");
    expect(indexSource).toContain('Executive summary for a job (shared with log --summary)');
    expect(indexSource).toContain('Show executive summary instead of full transcript stream');
  });
});
