/**
 * Tests for `pilot status` command — human and JSON output paths.
 *
 * Mocks: db.ts (getQueue/getRecent), opencode-db.ts, output.ts.
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
    createdAt: '2026-03-02T10:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
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

vi.mock('../../src/core/opencode-db.js', () => ({
  getLastMessage: () => null,
  findSessionByTitle: () => null,
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
    expect(jsonData.active).toHaveLength(1);
    expect(jsonData.queue).toHaveLength(1);
    expect(jsonData.recent).toHaveLength(1);
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
