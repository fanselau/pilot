/**
 * Tests for `pilot status` command — human and JSON output paths.
 *
 * Mocks: db.ts (getQueue/getRecent), opencode-db.ts, output.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job, JobObservabilitySnapshot } from '../../src/core/types.js';

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
    notifyRoute: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 3,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockQueue: Job[] = [];
let mockRecent: Job[] = [];
let mockProjects: Record<string, { status: 'active' | 'blocked'; blockedReason: string | null }> = {};
let mockJobSteps: Record<string, Array<{ command: string; args: string; stepIndex: number; status: string }>> = {};

vi.mock('../../src/core/db.js', () => ({
  getQueue: () => mockQueue,
  getRecent: (_limit: number) => mockRecent,
  getJob: (id: string) => [...mockQueue, ...mockRecent].find((job) => job.id === id) ?? null,
  getJobSteps: (id: string) => mockJobSteps[id] ?? [],
  getProject: (projectPath: string) => {
    const project = mockProjects[projectPath];
    if (!project) return null;
    return {
      path: projectPath,
      owner: null,
      status: project.status,
      blockedReason: project.blockedReason,
      blockedAt: null,
      createdAt: '2026-03-01T00:00:00',
    };
  },
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({
    pilotDir: '/tmp/pilot-test',
    queueGraceSeconds: 120,
  }),
}));

vi.mock('../../src/core/opencode-db.js', () => ({
  getLastMessage: () => null,
  findSessionByTitle: () => null,
  isSessionDone: () => false,
}));

const mockBuildJobObservability = vi.fn();

vi.mock('../../src/core/job-observability.js', () => ({
  buildJobObservability: (...args: unknown[]) => mockBuildJobObservability(...args),
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

vi.mock('../../src/util/format.js', () => ({
  formatRelativeTime: () => '5m ago',
}));

import { statusCommand } from '../../src/commands/status.js';

function makeObservability(job: Job, overrides: Partial<JobObservabilitySnapshot> = {}): JobObservabilitySnapshot {
  const running = job.status === 'running';
  const pending = job.status === 'pending';
  const terminal = !running && !pending;
  const defaultStatus = pending ? 'unavailable' : running ? 'partial' : 'available';

  return {
    jobId: job.id,
    jobStatus: job.status,
    terminal,
    requested: {
      modelProfile: job.modelProfile,
      providerMode: job.providerMode,
      scope: job.scope,
      intendedExecutorModel: 'anthropic/claude-sonnet-4-6',
      notes: [],
    },
    observed: {
      status: defaultStatus,
      models: pending ? [] : ['anthropic/claude-sonnet-4-6'],
      notes: [],
    },
    tokens: {
      status: defaultStatus,
      totals: pending
        ? null
        : {
          input: 8_000,
          output: 2_000,
          reasoning: 500,
          cacheRead: 0,
          cacheWrite: 0,
          total: 10_500,
        },
      byModel: pending
        ? {}
        : {
          'anthropic/claude-sonnet-4-6': {
            input: 8_000,
            output: 2_000,
            reasoning: 500,
            cacheRead: 0,
            cacheWrite: 0,
            total: 10_500,
          },
        },
      notes: [],
    },
    cost: {
      status: pending ? 'unavailable' : running ? 'partial' : 'estimated',
      currency: 'USD',
      estimatedUsd: pending ? null : 0.0525,
      byModel: [],
      notes: running ? ['Live running estimate.'] : [],
    },
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockQueue = [];
  mockRecent = [];
  mockProjects = {};
  mockJobSteps = {};
  mockBuildJobObservability.mockImplementation((job: Job) => makeObservability(job));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('statusCommand', () => {
  it('shows empty state message when no jobs at all', async () => {
    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No jobs');
    expect(output).toContain('pilot add');
  });

  it('displays active jobs', async () => {
    mockQueue = [
      makeJob({ id: 'aa11', status: 'running', startedAt: '2026-03-02T09:50:00', project: 'resume-roast', description: 'fix navbar' }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Active');
    expect(output).toContain('resume-roast');
    expect(output).toContain('fix navbar');
    expect(output).toContain('[obs model:claude-sonnet-4-6 tok:10.5k cost:~$0.0525 live/partial]');
  });

  it('displays pending jobs in queue section', async () => {
    mockQueue = [
      makeJob({ id: 'bb22', status: 'pending', project: 'hub', description: 'add caching' }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Queue');
    expect(output).toContain('hub');
    expect(output).toContain('pending');
    expect(output).toContain('undo:unavailable');
  });

  it('renders concise why line for grace-wait jobs with --why', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T00:00:30Z'));

    mockQueue = [
      makeJob({
        id: 'gw11',
        status: 'pending',
        project: 'grace-proj',
        createdAt: '2026-03-08 00:00:00',
      }),
    ];

    await statusCommand({ why: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('grace-wait:90s');
    expect(output).toContain('what: Job is waiting for the queue grace window.');
    expect(output).toContain('next: Wait for grace to elapse or queue with --start-immediately.');

    vi.useRealTimers();
  });

  it('shows retryability badges for failed jobs in recent section', async () => {
    mockRecent = [
      makeJob({
        id: 'rt11',
        status: 'failed',
        error: 'network timeout',
        completedAt: '2026-03-02T09:56:00',
      }),
      makeJob({
        id: 'nr11',
        status: 'failed',
        gitBaseCommit: 'abc',
        gitHeadCommit: 'abc',
        completedAt: '2026-03-02T09:57:00',
      }),
    ];

    await statusCommand({ why: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('[failed]');
    expect(output).toContain('[needs-revision]');
    expect(output).toContain('This failure suggests a requirement or outcome mismatch.');
  });

  it('shows undo:safe tag for checkpointed terminal jobs', async () => {
    mockRecent = [
      makeJob({
        id: 'sa11',
        status: 'completed',
        project: 'safe-proj',
        completedAt: '2026-03-02T09:55:00',
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
      }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('undo:safe');
  });

  it('shows undo:safe tag when job started dirty (dirty-start no longer guards)', async () => {
    mockRecent = [
      makeJob({
        id: 'gd11',
        status: 'completed',
        project: 'guarded-proj',
        completedAt: '2026-03-02T09:55:00',
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
        startedDirty: true,
      }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('undo:safe');
  });

  it('shows undo:guarded-newer-work tag when newer-work guard is known', async () => {
    mockRecent = [
      makeJob({
        id: 'gn11',
        status: 'failed',
        project: 'newer-work-proj',
        completedAt: '2026-03-02T09:56:00',
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
        error: 'Refusing undo: newer commits exist after this checkpoint',
      }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('undo:guarded-newer-work');
  });

  it('displays completed and failed in recent section', async () => {
    mockRecent = [
      makeJob({ id: 'cc33', status: 'completed', project: 'done-proj', description: 'done task', completedAt: '2026-03-02T09:55:00' }),
      makeJob({ id: 'dd44', status: 'failed', project: 'fail-proj', description: 'fail task', completedAt: '2026-03-02T09:56:00' }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Recent');
    expect(output).toContain('done-proj');
    expect(output).toContain('fail-proj');
    // Green check for completed, red cross for failed
    expect(output).toContain('✓');
    expect(output).toContain('✗');
  });

  it('shows explicit judge badges for completed phase rows and keeps operational badges', async () => {
    mockRecent = [
      makeJob({
        id: 'ph11',
        scope: 'phase',
        status: 'completed',
        project: 'phase-pass',
        description: 'pass verdict',
        completedAt: '2026-03-02T09:55:00',
        judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 92, reason: 'looks good' }),
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
      }),
      makeJob({
        id: 'ph12',
        scope: 'phase',
        status: 'completed',
        project: 'phase-inc',
        description: 'inconclusive verdict',
        completedAt: '2026-03-02T09:56:00',
        judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 0, reason: 'benefit of doubt' }),
        gitBaseCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        gitHeadCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
      makeJob({
        id: 'qk11',
        scope: 'quick',
        status: 'completed',
        project: 'quick-done',
        description: 'quick complete',
        completedAt: '2026-03-02T09:57:00',
      }),
    ];

    await statusCommand({});

    const lines = mockOutputHuman.mock.calls.map((c: unknown[]) => String(c[0]));
    const passLine = lines.find((line) => line.includes('ph11'));
    const inconclusiveLine = lines.find((line) => line.includes('ph12'));
    const quickLine = lines.find((line) => line.includes('qk11'));

    expect(passLine).toContain('[judge:pass 92%]');
    expect(passLine).toContain('[undo:safe]');
    expect(inconclusiveLine).toContain('[judge:inconclusive]');
    expect(inconclusiveLine).toContain('[no-op]');
    expect(inconclusiveLine).toContain('[undo:safe]');
    expect(quickLine).toBeDefined();
    expect(quickLine).not.toContain('judge:');
  });

  it('shows review pending label for completed_pending_review jobs in recent section', async () => {
    mockRecent = [
      makeJob({
        id: 'rv11',
        status: 'completed_pending_review',
        project: 'review-proj',
        description: 'review task',
        completedAt: '2026-03-21T10:00:00',
        resumeHint: '- Check output quality\n- Verify edge cases',
      }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('review-proj');
    expect(output).toContain('review pending');
    // Should NOT show failure icon — ✗ is reserved for failed jobs
    const lines = mockOutputHuman.mock.calls.map((c: unknown[]) => String(c[0]));
    const reviewLine = lines.find((line) => line.includes('rv11'));
    expect(reviewLine).toBeDefined();
    expect(reviewLine).not.toContain('✗');
  });

  it('shows review hold label for review_hold jobs', async () => {
    mockQueue = [
      makeJob({
        id: 'rh11',
        status: 'review_hold',
        project: 'hold-proj',
        description: 'hold task',
        startedAt: '2026-03-21T10:00:00',
        resumeHint: 'Security review required',
      }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('hold-proj');
    expect(output).toContain('review hold');
    // Should NOT show failure icon
    const lines = mockOutputHuman.mock.calls.map((c: unknown[]) => String(c[0]));
    const holdLine = lines.find((line) => line.includes('rh11'));
    expect(holdLine).toBeDefined();
    expect(holdLine).not.toContain('✗');
  });

  it('outputs JSON with correct structure', async () => {
    mockJsonMode = true;
    mockQueue = [
      makeJob({ id: 'aa11', status: 'running' }),
      makeJob({ id: 'bb22', status: 'pending' }),
    ];
    mockRecent = [
      makeJob({ id: 'cc33', status: 'completed' }),
    ];

    await statusCommand({});

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const jsonData = mockOutputJson.mock.calls[0][0];
    expect(jsonData).toHaveProperty('version', '2.0.0');
    expect(jsonData).toHaveProperty('daemon');
    expect(jsonData).toHaveProperty('active');
    expect(jsonData).toHaveProperty('queue');
    expect(jsonData).toHaveProperty('recent');
    expect(jsonData).toHaveProperty('recovery');
    expect(jsonData).toHaveProperty('why');
    expect(jsonData).toHaveProperty('observability');
    expect(jsonData.active).toHaveLength(1);
    expect(jsonData.queue).toHaveLength(1);
    expect(jsonData.recent).toHaveLength(1);
    expect(jsonData.recovery).toMatchObject({
      aa11: expect.objectContaining({ tag: 'undo:unavailable' }),
      bb22: expect.objectContaining({ tag: 'undo:unavailable' }),
      cc33: expect.objectContaining({ tag: 'undo:unavailable' }),
    });
    expect(jsonData.why).toMatchObject({
      aa11: expect.objectContaining({ code: 'running' }),
      bb22: expect.objectContaining({ code: 'project-serial' }),
      cc33: expect.objectContaining({ code: 'undo-unavailable' }),
    });
    expect(jsonData.observability).toMatchObject({
      aa11: expect.objectContaining({
        terminal: false,
        tokens: expect.objectContaining({ status: 'partial' }),
      }),
      bb22: expect.objectContaining({
        terminal: false,
        tokens: expect.objectContaining({ status: 'unavailable' }),
      }),
      cc33: expect.objectContaining({
        terminal: true,
        tokens: expect.objectContaining({ status: 'available' }),
      }),
    });
  });

  it('does not call outputHuman when in JSON mode', async () => {
    mockJsonMode = true;
    await statusCommand({});

    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('truncates long descriptions in human output', async () => {
    mockQueue = [
      makeJob({ id: 'xx11', status: 'running', startedAt: '2026-03-02T09:50:00', description: 'a'.repeat(100) }),
    ];

    await statusCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('…');
  });

  it('renders judge:pass badge for new-format pass verdict in completed phase row', async () => {
    mockRecent = [
      makeJob({
        id: 'np01',
        scope: 'phase',
        status: 'completed',
        project: 'new-format-pass',
        description: 'new pass verdict format',
        completedAt: '2026-03-02T09:58:00',
        judgeVerdict: JSON.stringify({ verdict: 'pass', confidence: 88, reason: 'all criteria met' }),
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '2222222222222222222222222222222222222222',
      }),
    ];

    await statusCommand({});

    const lines = mockOutputHuman.mock.calls.map((c: unknown[]) => String(c[0]));
    const passLine = lines.find((line) => line.includes('np01'));
    expect(passLine).toBeDefined();
    expect(passLine).toContain('[judge:pass 88%]');
  });
});
