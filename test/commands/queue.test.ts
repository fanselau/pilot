import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock core modules used by queue command ─────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/QUEUE.md',
    pilotDir: '/tmp/.pilot',
    queueJsonFile: '/tmp/.pilot/queue.json',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/queue-store.js', () => ({
  getItems: vi.fn(),
  getHistory: vi.fn(),
  removeItem: vi.fn(),
}));

import { getItems, getHistory, removeItem } from '../../src/core/queue-store.js';
import { setJsonMode } from '../../src/util/output.js';
import { queueCommand, queueRemoveCommand } from '../../src/commands/queue.js';
import type { QueueJsonItem } from '../../src/core/types.js';

const mockedGetItems = vi.mocked(getItems);
const mockedGetHistory = vi.mocked(getHistory);
const mockedRemoveItem = vi.mocked(removeItem);

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<QueueJsonItem> = {}): QueueJsonItem {
  return {
    id: 'ab12',
    project: 'test-project',
    mode: 'continue',
    description: '',
    status: 'queued',
    addedAt: '2026-02-20T10:00:00Z',
    startedAt: null,
    completedAt: null,
    phase: null,
    attempts: 0,
    maxAttempts: 3,
    dependsOn: null,
    error: null,
    meta: {},
    ...overrides,
  };
}

describe('queueCommand', () => {
  let output: string;
  let stderrOutput: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    stderrOutput = '';
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderrOutput += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    stderrSpy.mockRestore();
    setJsonMode(false);
  });

  it('outputs entries with backward-compat fields in JSON mode', async () => {
    const items: QueueJsonItem[] = [
      makeItem({ id: 'aa11', project: 'resume-roast', mode: 'continue-all', status: 'running', description: 'Running Phase 3' }),
      makeItem({ id: 'bb22', project: 'hub', mode: 'continue', status: 'queued' }),
      makeItem({ id: 'cc33', project: 'registry', mode: 'add-and-build', status: 'queued', description: 'add caching per requirements/cache.md' }),
    ];
    mockedGetItems.mockResolvedValue(items);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);

    // Has timestamp
    expect(typeof parsed.timestamp).toBe('string');

    // Has queue array
    expect(Array.isArray(parsed.queue)).toBe(true);
    expect(parsed.queue).toHaveLength(3);

    // Each entry has backward-compat fields
    for (const item of parsed.queue) {
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('project');
      expect(item).toHaveProperty('mode');
      expect(item).toHaveProperty('args');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('line_num');
      expect(item).toHaveProperty('id');        // new field
      expect(item).toHaveProperty('addedAt');    // new field
      expect(typeof item.line_num).toBe('number');
    }

    // Backward compat: 'queued' maps to 'pending' in JSON
    const queuedItem = parsed.queue.find((i: Record<string, unknown>) => i.id === 'bb22');
    expect(queuedItem.status).toBe('pending');

    // Running stays as running
    const runningItem = parsed.queue.find((i: Record<string, unknown>) => i.id === 'aa11');
    expect(runningItem.status).toBe('running');

    // args maps to description
    expect(queuedItem.args).toBe('');
    expect(parsed.queue[2].args).toBe('add caching per requirements/cache.md');

    // line_num is always 0 (deprecated)
    expect(queuedItem.line_num).toBe(0);
  });

  it('calculates active_count as running + queued', async () => {
    const items: QueueJsonItem[] = [
      makeItem({ id: 'a1', status: 'running' }),
      makeItem({ id: 'a2', status: 'running' }),
      makeItem({ id: 'a3', status: 'queued' }),
    ];
    mockedGetItems.mockResolvedValue(items);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);
    expect(parsed.active_count).toBe(3);
  });

  it('handles empty queue gracefully', async () => {
    mockedGetItems.mockResolvedValue([]);

    setJsonMode(true);
    await queueCommand({ json: true });

    const parsed = JSON.parse(output);
    expect(parsed.queue).toEqual([]);
    expect(parsed.active_count).toBe(0);
  });

  it('--history shows completed and failed from history', async () => {
    mockedGetHistory.mockResolvedValue([
      {
        ...makeItem({ id: 'h1', project: 'proj-a', mode: 'build-full', status: 'completed' }),
        duration: 3600,
        completedAt: '2026-02-20T11:00:00Z',
      },
      {
        ...makeItem({ id: 'h2', project: 'proj-b', mode: 'continue', status: 'failed', error: 'OOM' }),
        duration: 1200,
        completedAt: '2026-02-20T11:30:00Z',
      },
    ]);

    setJsonMode(true);
    await queueCommand({ json: true, history: true });

    const parsed = JSON.parse(output);
    expect(parsed.history).toHaveLength(2);
    expect(parsed.history[0].id).toBe('h1');
    expect(parsed.history[0].status).toBe('completed');
    expect(parsed.history[1].error).toBe('OOM');
    expect(parsed.count).toBe(2);
  });

  it('queue remove removes a queued item', async () => {
    mockedRemoveItem.mockResolvedValue(undefined);

    setJsonMode(true);
    await queueRemoveCommand('ab12', {});

    const parsed = JSON.parse(output);
    expect(parsed.action).toBe('removed');
    expect(parsed.id).toBe('ab12');
    expect(mockedRemoveItem).toHaveBeenCalledWith('ab12');
  });
});
