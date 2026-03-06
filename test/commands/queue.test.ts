/**
 * Tests for `pilot queue` command — queue display, history mode, JSON output.
 *
 * Mocks: db.ts (getQueue/getRecent), output.ts, colors.ts, format.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockQueue: Job[] = [];
let mockRecent: Job[] = [];

vi.mock('../../src/core/db.js', () => ({
  getQueue: () => mockQueue,
  getRecent: (_limit: number) => mockRecent,
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

import { queueCommand } from '../../src/commands/queue.js';

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockQueue = [];
  mockRecent = [];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('queueCommand', () => {
  it('shows empty queue message when no jobs', async () => {
    await queueCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Queue empty');
  });

  it('renders mixed pending and running jobs', async () => {
    mockQueue = [
      makeJob({ id: 'aa11', status: 'running', project: 'proj-a', description: 'running task', startedAt: '2026-03-02T09:50:00' }),
      makeJob({ id: 'bb22', status: 'pending', project: 'proj-b', description: 'pending task' }),
    ];

    await queueCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('proj-a');
    expect(output).toContain('proj-b');
    expect(output).toContain('running');
    expect(output).toContain('pending');
    expect(output).toContain('aa11');
    expect(output).toContain('bb22');
  });

  it('outputs JSON with queue array', async () => {
    mockJsonMode = true;
    mockQueue = [
      makeJob({ id: 'aa11', status: 'pending' }),
    ];

    await queueCommand({});

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const jsonData = mockOutputJson.mock.calls[0][0];
    expect(jsonData).toHaveProperty('queue');
    expect(jsonData.queue).toHaveLength(1);
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('shows history when --history flag is set', async () => {
    mockRecent = [
      makeJob({ id: 'cc33', status: 'completed', project: 'done-proj', description: 'completed work', completedAt: '2026-03-02T09:55:00' }),
      makeJob({ id: 'dd44', status: 'failed', project: 'fail-proj', description: 'failed work', completedAt: '2026-03-02T09:56:00' }),
    ];

    await queueCommand({ history: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('History');
    expect(output).toContain('done-proj');
    expect(output).toContain('fail-proj');
    expect(output).toContain('✓');
    expect(output).toContain('✗');
  });

  it('shows empty history message when no completed jobs', async () => {
    mockRecent = [];

    await queueCommand({ history: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No completed jobs');
  });

  it('outputs history JSON when --history + --json', async () => {
    mockJsonMode = true;
    mockRecent = [
      makeJob({ id: 'cc33', status: 'completed' }),
    ];

    await queueCommand({ history: true });

    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    const jsonData = mockOutputJson.mock.calls[0][0];
    expect(jsonData).toHaveProperty('history');
    expect(jsonData.history).toHaveLength(1);
  });

  it('truncates long descriptions', async () => {
    mockQueue = [
      makeJob({ id: 'xx11', status: 'pending', description: 'x'.repeat(100) }),
    ];

    await queueCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('…');
  });

  it('shows table header when queue has items', async () => {
    mockQueue = [
      makeJob({ id: 'aa11', status: 'pending' }),
    ];

    await queueCommand({});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('id');
    expect(output).toContain('project');
    expect(output).toContain('scope');
    expect(output).toContain('description');
    expect(output).toContain('status');
  });
});
