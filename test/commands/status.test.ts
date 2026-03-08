/**
 * Tests for `pilot status` command — human and JSON output paths.
 *
 * Mocks: db.ts (getQueue/getRecent), opencode-db.ts, output.ts.
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
    allowDirtyStart: false,
    startedDirty: false,
    skipGracePeriod: false,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockQueue: Job[] = [];
let mockRecent: Job[] = [];
let mockProjects: Record<string, { status: 'active' | 'blocked'; blockedReason: string | null }> = {};

vi.mock('../../src/core/db.js', () => ({
  getQueue: () => mockQueue,
  getRecent: (_limit: number) => mockRecent,
  getJob: (id: string) => [...mockQueue, ...mockRecent].find((job) => job.id === id) ?? null,
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

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockQueue = [];
  mockRecent = [];
  mockProjects = {};
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
    expect(output).toContain('[retryable]');
    expect(output).toContain('[needs-revision]');
    expect(output).toContain('Retry alone is unlikely to fix this failure.');
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

  it('shows undo:guarded-dirty-start tag when job started dirty', async () => {
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
    expect(output).toContain('undo:guarded-dirty-start');
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
});
