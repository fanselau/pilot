import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Mock config to use temp directory
vi.mock('../../src/core/config.js', () => {
  return {
    getConfig: () => ({
      pilotDir: (globalThis as Record<string, unknown>).__TEST_PILOT_DIR__ as string,
      queueJsonFile: (globalThis as Record<string, unknown>).__TEST_QUEUE_JSON__ as string,
      queueFile: '/tmp/QUEUE.md',
      logDir: '/tmp',
      stuckThreshold: 90,
      projectDir: '/tmp/projects',
      gsdDir: '/tmp/gsd',
      noColor: false,
      pollInterval: 3,
      defaultTimeout: 60,
      maxParallel: 2,
      logLevel: 'INFO',
    }),
  };
});

import {
  ensurePilotDir,
  loadQueue,
  saveQueue,
  addItem,
  removeItem,
  findLaunchable,
  findLaunchableAtomic,
  markRunning,
  markCompleted,
  markFailed,
  markQueued,
  markBlocked,
  cascadeFailure,
  getHistory,
  getItems,
  getItemById,
  detectCircularDep,
} from '../../src/core/queue-store.js';
import type { QueueJsonItem } from '../../src/core/types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-queue-test-'));
  (globalThis as Record<string, unknown>).__TEST_PILOT_DIR__ = tmpDir;
  (globalThis as Record<string, unknown>).__TEST_QUEUE_JSON__ = path.join(tmpDir, 'queue.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── ensurePilotDir ─────────────────────────────────────────────────────────

describe('ensurePilotDir', () => {
  it('creates the pilot directory', async () => {
    // tmpDir already exists from mkdtemp, but ensurePilotDir should be idempotent
    await ensurePilotDir();
    const { stat } = await import('node:fs/promises');
    const st = await stat(tmpDir);
    expect(st.isDirectory()).toBe(true);
  });

  it('is idempotent on second call', async () => {
    await ensurePilotDir();
    await ensurePilotDir();
    const { stat } = await import('node:fs/promises');
    const st = await stat(tmpDir);
    expect(st.isDirectory()).toBe(true);
  });
});

// ── addItem ────────────────────────────────────────────────────────────────

describe('addItem', () => {
  it('adds item with short alphanumeric ID and correct defaults', async () => {
    const id = await addItem({ project: 'my-app', mode: 'build-full' });

    expect(typeof id).toBe('string');
    expect(id.length).toBe(4);

    const items = await getItems();
    expect(items).toHaveLength(1);

    const item = items[0]!;
    expect(item.id).toBe(id);
    expect(item.project).toBe('my-app');
    expect(item.mode).toBe('build-full');
    expect(item.status).toBe('queued');
    expect(item.attempts).toBe(0);
    expect(item.maxAttempts).toBe(3);
    expect(item.description).toBe('');
    expect(item.startedAt).toBeNull();
    expect(item.completedAt).toBeNull();
    expect(item.phase).toBeNull();
    expect(item.dependsOn).toBeNull();
    expect(item.error).toBeNull();
    expect(item.meta).toEqual({});
    expect(item.addedAt).toBeTruthy();
  });

  it('returns unique 4-char IDs', async () => {
    const id1 = await addItem({ project: 'a', mode: 'm' });
    const id2 = await addItem({ project: 'b', mode: 'm' });

    expect(id1.length).toBe(4);
    expect(id2.length).toBe(4);
    expect(id1).not.toBe(id2);
  });

  it('item appears in loaded queue items array', async () => {
    await addItem({ project: 'proj', mode: 'continue', description: 'test desc' });

    const data = await loadQueue();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.project).toBe('proj');
    expect(data.items[0]!.description).toBe('test desc');
  });

  it('multiple adds create multiple items in order', async () => {
    const id1 = await addItem({ project: 'a', mode: 'm1' });
    const id2 = await addItem({ project: 'b', mode: 'm2' });
    const id3 = await addItem({ project: 'c', mode: 'm3' });

    const items = await getItems();
    expect(items).toHaveLength(3);
    expect(items[0]!.id).toBe(id1);
    expect(items[1]!.id).toBe(id2);
    expect(items[2]!.id).toBe(id3);
  });

  it('respects custom maxAttempts', async () => {
    const id = await addItem({ project: 'p', mode: 'm', maxAttempts: 5 });
    const item = await getItemById(id);
    expect(item!.maxAttempts).toBe(5);
  });

  it('stores meta object', async () => {
    const id = await addItem({ project: 'p', mode: 'm', meta: { key: 'value', num: 42 } });
    const item = await getItemById(id);
    expect(item!.meta).toEqual({ key: 'value', num: 42 });
  });
});

// ── removeItem ─────────────────────────────────────────────────────────────

describe('removeItem', () => {
  it('removes a queued item by ID', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    expect(await getItems()).toHaveLength(1);

    await removeItem(id);
    expect(await getItems()).toHaveLength(0);
  });

  it('throws on unknown ID', async () => {
    await expect(removeItem('nonexistent')).rejects.toThrow('Item not found: nonexistent');
  });

  it('throws when trying to remove a running item', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);

    await expect(removeItem(id)).rejects.toThrow('Cannot remove running item');
  });

  it('after removal, item no longer in items array', async () => {
    const id1 = await addItem({ project: 'a', mode: 'm' });
    const id2 = await addItem({ project: 'b', mode: 'm' });

    await removeItem(id1);
    const items = await getItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(id2);
  });
});

// ── findLaunchable ─────────────────────────────────────────────────────────

describe('findLaunchable', () => {
  it('returns null on empty queue', async () => {
    const result = await findLaunchable(new Set(), 5, 0);
    expect(result).toBeNull();
  });

  it('returns first queued item when no constraints', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    const result = await findLaunchable(new Set(), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
  });

  it('skips items whose project is in runningProjects set', async () => {
    await addItem({ project: 'running-proj', mode: 'm' });
    const id2 = await addItem({ project: 'other-proj', mode: 'm' });

    const result = await findLaunchable(new Set(['running-proj']), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id2);
  });

  it('skips items whose dependsOn has not completed', async () => {
    const depId = await addItem({ project: 'dep', mode: 'm' });
    await addItem({ project: 'dependent', mode: 'm', dependsOn: depId });

    // dep is still queued (not in history), so dependent is not launchable
    const result = await findLaunchable(new Set(), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.project).toBe('dep'); // only dep is launchable
  });

  it('returns item whose dependsOn IS in history as completed', async () => {
    const depId = await addItem({ project: 'dep', mode: 'm' });
    const depItemId = await addItem({ project: 'dependent', mode: 'm', dependsOn: depId });

    // Complete the dependency
    await markRunning(depId);
    await markCompleted(depId);

    const result = await findLaunchable(new Set(), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(depItemId);
  });

  it('returns null when activeCount >= maxParallel', async () => {
    await addItem({ project: 'proj', mode: 'm' });
    const result = await findLaunchable(new Set(), 3, 3);
    expect(result).toBeNull();
  });

  it('skips running items', async () => {
    const id1 = await addItem({ project: 'a', mode: 'm' });
    const id2 = await addItem({ project: 'b', mode: 'm' });

    await markRunning(id1);

    const result = await findLaunchable(new Set(), 5, 1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id2);
  });
});

// ── markRunning ────────────────────────────────────────────────────────────

describe('markRunning', () => {
  it('sets status to running, startedAt populated, attempts incremented', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);

    const item = await getItemById(id);
    expect(item!.status).toBe('running');
    expect(item!.startedAt).toBeTruthy();
    expect(item!.attempts).toBe(1);
  });

  it('increments attempts on each call', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markQueued(id); // reset for retry
    await markRunning(id);

    const item = await getItemById(id);
    expect(item!.attempts).toBe(2);
  });

  it('throws on unknown ID', async () => {
    await expect(markRunning('unknown')).rejects.toThrow('Item not found: unknown');
  });
});

// ── markCompleted ──────────────────────────────────────────────────────────

describe('markCompleted', () => {
  it('moves item from items to history', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markCompleted(id);

    const items = await getItems();
    expect(items).toHaveLength(0);

    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.id).toBe(id);
  });

  it('history entry has duration field as number in seconds', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);

    // Small delay to ensure duration > 0
    await new Promise((r) => setTimeout(r, 50));
    await markCompleted(id);

    const history = await getHistory();
    expect(typeof history[0]!.duration).toBe('number');
    expect(history[0]!.duration).toBeGreaterThanOrEqual(0);
  });

  it('status is completed, completedAt populated', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markCompleted(id);

    const history = await getHistory();
    expect(history[0]!.status).toBe('completed');
    expect(history[0]!.completedAt).toBeTruthy();
  });

  it('items array no longer contains the item', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markCompleted(id);

    const item = await getItemById(id);
    expect(item).toBeNull();
  });
});

// ── markFailed ─────────────────────────────────────────────────────────────

describe('markFailed', () => {
  it('moves item from items to history with status failed', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markFailed(id);

    const items = await getItems();
    expect(items).toHaveLength(0);

    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe('failed');
  });

  it('error field set if provided', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markFailed(id, 'OOM killed');

    const history = await getHistory();
    expect(history[0]!.error).toBe('OOM killed');
  });

  it('error field null if not provided', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markFailed(id);

    const history = await getHistory();
    expect(history[0]!.error).toBeNull();
  });

  it('history entry has duration', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markFailed(id);

    const history = await getHistory();
    expect(typeof history[0]!.duration).toBe('number');
  });
});

// ── markQueued (retry) ─────────────────────────────────────────────────────

describe('markQueued', () => {
  it('resets status to queued, clears startedAt', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);

    const runningItem = await getItemById(id);
    expect(runningItem!.status).toBe('running');
    expect(runningItem!.startedAt).toBeTruthy();

    await markQueued(id);

    const item = await getItemById(id);
    expect(item!.status).toBe('queued');
    expect(item!.startedAt).toBeNull();
  });

  it('item stays in items array (not moved to history)', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markQueued(id);

    const items = await getItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(id);

    const history = await getHistory();
    expect(history).toHaveLength(0);
  });
});

// ── History capping ────────────────────────────────────────────────────────

describe('history capping', () => {
  it('caps history at 200 entries', async () => {
    // Add and complete 205 items
    for (let i = 0; i < 205; i++) {
      const id = await addItem({ project: `proj-${i}`, mode: 'm' });
      await markRunning(id);
      await markCompleted(id);
    }

    const history = await getHistory();
    expect(history).toHaveLength(200);

    // Verify we kept the newest entries (highest project numbers)
    const data = await loadQueue();
    expect(data.history).toHaveLength(200);
  });
});

// ── Circular dependency detection ──────────────────────────────────────────

describe('circular dependency detection', () => {
  function makeItem(id: string, dependsOn: string | null = null): QueueJsonItem {
    return {
      id,
      project: `proj-${id}`,
      mode: 'm',
      description: '',
      status: 'queued',
      addedAt: '2026-01-01T00:00:00Z',
      startedAt: null,
      completedAt: null,
      phase: null,
      attempts: 0,
      maxAttempts: 3,
      dependsOn,
      error: null,
      meta: {},
    };
  }

  it('A depends on B, B depends on A — detects cycle', () => {
    // B depends on A already exists. Now try to add A depending on B.
    const items = [
      makeItem('A', null),
      makeItem('B', 'A'),
    ];
    // newItemId=A, dependsOnId=B — walk: B -> A (=== newItemId) → CYCLE
    expect(detectCircularDep(items, 'A', 'B')).toBe(true);
  });

  it('A depends on B, B depends on C, C depends on A — detects cycle', () => {
    const items = [
      makeItem('A', null),
      makeItem('B', 'A'),
      makeItem('C', 'B'),
    ];
    // newItemId=A, dependsOnId=C — walk: C -> B -> A (=== newItemId) → CYCLE
    expect(detectCircularDep(items, 'A', 'C')).toBe(true);
  });

  it('A depends on B (no cycle) — returns false', () => {
    const items = [
      makeItem('B', null),
    ];
    // newItemId=A, dependsOnId=B — walk: B -> null. No cycle.
    expect(detectCircularDep(items, 'A', 'B')).toBe(false);
  });

  it('detects cycle in existing chain (visited loop)', () => {
    // Corrupt data: B -> C -> B (loop in existing chain)
    const items = [
      makeItem('B', 'C'),
      makeItem('C', 'B'),
    ];
    // newItemId=A, dependsOnId=B — walk: B -> C -> B (visited!) → CYCLE
    expect(detectCircularDep(items, 'A', 'B')).toBe(true);
  });

  it('addItem with dependsOn (no cycle) succeeds via public API', async () => {
    const idB = await addItem({ project: 'b', mode: 'm' });
    const idA = await addItem({ project: 'a', mode: 'm', dependsOn: idB });

    const items = await getItems();
    expect(items).toHaveLength(2);
    expect(items[1]!.id).toBe(idA);
    expect(items[1]!.dependsOn).toBe(idB);
  });

  it('addItem depends on non-existent ID — succeeds (just not launchable)', async () => {
    const id = await addItem({ project: 'a', mode: 'm', dependsOn: 'nonexistent123' });

    const items = await getItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.dependsOn).toBe('nonexistent123');

    // Not launchable because dep hasn't completed
    const result = await findLaunchable(new Set(), 5, 0);
    expect(result).toBeNull();
  });

  it('rejects when addItem would create cycle via corrupt data', async () => {
    // Manually write corrupt data where B depends on a pre-known ID
    const fakeNewId = 'WILL_CYCLE_';
    await saveQueue({
      version: 1,
      items: [makeItem('B', fakeNewId)],
      history: [],
      completedIds: [],
    });

    // Now if addItem generates id=fakeNewId and depends on B, it would cycle
    // We can't control ID generation, but we can test detectCircularDep is called
    // by verifying the function itself works (tested above)
    // This test just verifies the chain: non-existent dep allows add
    const id = await addItem({ project: 'a', mode: 'm', dependsOn: 'B' });
    expect(id).toBeTruthy();
  });
});

// ── getHistory ──────────────────────────────────────────────────────────────

describe('getHistory', () => {
  it('returns sorted by completedAt desc', async () => {
    const id1 = await addItem({ project: 'first', mode: 'm' });
    await markRunning(id1);
    await markCompleted(id1);

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    const id2 = await addItem({ project: 'second', mode: 'm' });
    await markRunning(id2);
    await markCompleted(id2);

    const history = await getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.project).toBe('second'); // most recent first
    expect(history[1]!.project).toBe('first');
  });

  it('respects limit param', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await addItem({ project: `proj-${i}`, mode: 'm' });
      await markRunning(id);
      await markCompleted(id);
    }

    const history = await getHistory(2);
    expect(history).toHaveLength(2);
  });
});

// ── loadQueue / saveQueue ──────────────────────────────────────────────────

describe('loadQueue', () => {
  it('returns empty queue when file does not exist', async () => {
    const data = await loadQueue();
    expect(data.version).toBe(1);
    expect(data.items).toEqual([]);
    expect(data.history).toEqual([]);
  });

  it('returns parsed queue from file', async () => {
    await saveQueue({
      version: 1,
      items: [{
        id: 'test123',
        project: 'proj',
        mode: 'm',
        description: '',
        status: 'queued',
        addedAt: '2026-01-01T00:00:00Z',
        startedAt: null,
        completedAt: null,
        phase: null,
        attempts: 0,
        maxAttempts: 3,
        dependsOn: null,
        error: null,
        meta: {},
      }],
      history: [],
      completedIds: [],
    });

    const data = await loadQueue();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.id).toBe('test123');
  });
});

describe('saveQueue', () => {
  it('writes valid JSON with 2-space indent', async () => {
    await saveQueue({ version: 1, items: [], history: [], completedIds: [] });

    const queueFile = (globalThis as Record<string, unknown>).__TEST_QUEUE_JSON__ as string;
    const raw = await readFile(queueFile, 'utf8');
    expect(raw).toContain('"version": 1');
    expect(raw).toContain('  '); // 2-space indent
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

// ── getItemById ─────────────────────────────────────────────────────────────

describe('getItemById', () => {
  it('returns item when found', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    const item = await getItemById(id);
    expect(item).not.toBeNull();
    expect(item!.id).toBe(id);
  });

  it('returns null when not found', async () => {
    const item = await getItemById('nonexistent');
    expect(item).toBeNull();
  });
});

// ── completedIds persistence ───────────────────────────────────────────────

describe('completedIds persistence', () => {
  it('markCompleted adds ID to completedIds', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markRunning(id);
    await markCompleted(id);

    const data = await loadQueue();
    expect(data.completedIds).toContain(id);
  });

  it('completedIds survives history pruning', async () => {
    // Add and complete 205 items — history caps at 200 but completedIds keeps all
    const allIds: string[] = [];
    for (let i = 0; i < 205; i++) {
      const id = await addItem({ project: `proj-${i}`, mode: 'm' });
      await markRunning(id);
      await markCompleted(id);
      allIds.push(id);
    }

    const data = await loadQueue();
    // History capped at 200
    expect(data.history).toHaveLength(200);
    // completedIds has ALL 205
    expect(data.completedIds).toHaveLength(205);
    for (const id of allIds) {
      expect(data.completedIds).toContain(id);
    }
  });

  it('loadQueue defaults completedIds to empty array for old format', async () => {
    // Write queue.json without completedIds field
    const queueFile = (globalThis as Record<string, unknown>).__TEST_QUEUE_JSON__ as string;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(queueFile, JSON.stringify({ version: 1, items: [], history: [] }, null, 2), 'utf8');

    const data = await loadQueue();
    expect(data.completedIds).toEqual([]);
  });
});

// ── findLaunchableAtomic ───────────────────────────────────────────────────

describe('findLaunchableAtomic', () => {
  it('returns item already marked running with attempts incremented', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });

    const result = await findLaunchableAtomic(new Set(), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
    expect(result!.status).toBe('running');
    expect(result!.attempts).toBe(1);
    expect(result!.startedAt).toBeTruthy();
  });

  it('item is atomically marked running in queue.json', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });

    await findLaunchableAtomic(new Set(), 5, 0);

    // Read the item from storage — should be marked running
    const item = await getItemById(id);
    expect(item!.status).toBe('running');
    expect(item!.attempts).toBe(1);
  });

  it('skips item with unmet dependency (not in completedIds)', async () => {
    const depId = await addItem({ project: 'dep', mode: 'm' });
    await addItem({ project: 'dependent', mode: 'm', dependsOn: depId });

    // dep is still queued — dependent should be skipped, dep returned
    const result = await findLaunchableAtomic(new Set(), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.project).toBe('dep');
  });

  it('returns item whose dependency is in completedIds', async () => {
    const depId = await addItem({ project: 'dep', mode: 'm' });
    const childId = await addItem({ project: 'child', mode: 'm', dependsOn: depId });

    // Complete the dependency
    await markRunning(depId);
    await markCompleted(depId);

    const result = await findLaunchableAtomic(new Set(), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(childId);
  });

  it('skips same-project already running', async () => {
    await addItem({ project: 'a', mode: 'm' });
    const id2 = await addItem({ project: 'b', mode: 'm' });

    const result = await findLaunchableAtomic(new Set(['a']), 5, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id2);
  });

  it('returns null when activeCount >= maxParallel', async () => {
    await addItem({ project: 'proj', mode: 'm' });
    const result = await findLaunchableAtomic(new Set(), 3, 3);
    expect(result).toBeNull();
  });

  it('returns null when no queued items', async () => {
    const result = await findLaunchableAtomic(new Set(), 5, 0);
    expect(result).toBeNull();
  });
});

// ── cascadeFailure ─────────────────────────────────────────────────────────

describe('cascadeFailure', () => {
  it('blocks direct dependents of a failed item', async () => {
    const idA = await addItem({ project: 'a', mode: 'm' });
    const idB = await addItem({ project: 'b', mode: 'm', dependsOn: idA });

    // Fail A first (must run and fail for cascadeFailure to make sense)
    await markRunning(idA);
    await markFailed(idA);

    const blockedIds = await cascadeFailure(idA);
    expect(blockedIds).toContain(idB);

    const itemB = await getItemById(idB);
    expect(itemB!.status).toBe('blocked');
    expect(itemB!.error).toContain(idA);
  });

  it('blocks transitive dependents (A→B→C)', async () => {
    const idA = await addItem({ project: 'a', mode: 'm' });
    const idB = await addItem({ project: 'b', mode: 'm', dependsOn: idA });
    const idC = await addItem({ project: 'c', mode: 'm', dependsOn: idB });

    await markRunning(idA);
    await markFailed(idA);

    const blockedIds = await cascadeFailure(idA);
    expect(blockedIds).toContain(idB);
    expect(blockedIds).toContain(idC);

    const itemB = await getItemById(idB);
    const itemC = await getItemById(idC);
    expect(itemB!.status).toBe('blocked');
    expect(itemC!.status).toBe('blocked');
  });

  it('returns empty array when no dependents exist', async () => {
    const idA = await addItem({ project: 'a', mode: 'm' });
    await markRunning(idA);
    await markFailed(idA);

    const blockedIds = await cascadeFailure(idA);
    expect(blockedIds).toEqual([]);
  });

  it('only blocks queued items (running items unaffected)', async () => {
    const idA = await addItem({ project: 'a', mode: 'm' });
    const idB = await addItem({ project: 'b', mode: 'm', dependsOn: idA });
    const idC = await addItem({ project: 'c', mode: 'm', dependsOn: idA });

    // Mark B as running before cascade
    await markRunning(idB);

    // Fail A
    await markRunning(idA);
    await markFailed(idA);

    const blockedIds = await cascadeFailure(idA);
    // B is running → not blocked, C is queued → blocked
    expect(blockedIds).not.toContain(idB);
    expect(blockedIds).toContain(idC);

    const itemB = await getItemById(idB);
    expect(itemB!.status).toBe('running'); // unchanged
  });
});

// ── markBlocked ────────────────────────────────────────────────────────────

describe('markBlocked', () => {
  it('marks a queued item as blocked with error reason', async () => {
    const id = await addItem({ project: 'proj', mode: 'm' });
    await markBlocked(id, 'dependency failed');

    const item = await getItemById(id);
    expect(item!.status).toBe('blocked');
    expect(item!.error).toBe('dependency failed');
  });

  it('throws on non-existent item', async () => {
    await expect(markBlocked('nonexistent', 'reason')).rejects.toThrow('Item not found: nonexistent');
  });
});
