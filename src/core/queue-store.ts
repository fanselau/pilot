/**
 * JSON queue storage — CRUD operations over ~/.pilot/queue.json.
 *
 * Replaces queue-parser.ts for all new queue operations. Provides typed
 * CRUD with proper file locking (proper-lockfile), nanoid IDs, circular
 * dependency detection, and history capping.
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { lock } from 'proper-lockfile';
import { nanoid } from 'nanoid';
import { getConfig } from './config.js';
import type { QueueJsonFile, QueueJsonItem, QueueHistoryItem } from './types.js';

const MAX_HISTORY = 100;

// ── File I/O ───────────────────────────────────────────────────────────────

/**
 * Ensure the ~/.pilot/ directory exists. Idempotent.
 */
async function ensurePilotDir(): Promise<void> {
  const config = getConfig();
  await mkdir(config.pilotDir, { recursive: true });
}

/**
 * Load queue from ~/.pilot/queue.json.
 * Returns empty queue if file doesn't exist.
 */
async function loadQueue(): Promise<QueueJsonFile> {
  const config = getConfig();
  try {
    const raw = await readFile(config.queueJsonFile, 'utf8');
    return JSON.parse(raw) as QueueJsonFile;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, items: [], history: [] };
    }
    throw err;
  }
}

/**
 * Save queue to ~/.pilot/queue.json with 2-space indent.
 * Creates ~/.pilot/ directory if needed.
 */
async function saveQueue(data: QueueJsonFile): Promise<void> {
  const config = getConfig();
  await ensurePilotDir();
  await writeFile(config.queueJsonFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── File Locking ───────────────────────────────────────────────────────────

/**
 * Execute an async function while holding an exclusive lock on the queue file.
 *
 * Locks on the pilotDir when queue.json doesn't exist yet (proper-lockfile
 * needs an existing target). Creates the empty queue file first if needed.
 *
 * - Stale timeout: 30 seconds
 * - Retries: 5 with 100ms-1000ms exponential backoff
 */
async function withQueueJsonLock<T>(fn: () => Promise<T>): Promise<T> {
  const config = getConfig();
  await ensurePilotDir();

  // Ensure queue.json exists so proper-lockfile can lock on it
  try {
    await readFile(config.queueJsonFile, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveQueue({ version: 1, items: [], history: [] });
    } else {
      throw err;
    }
  }

  const release = await lock(config.queueJsonFile, {
    stale: 30_000,
    retries: {
      retries: 5,
      minTimeout: 100,
      maxTimeout: 1000,
    },
  });

  try {
    return await fn();
  } finally {
    await release();
  }
}

// ── Circular Dependency Detection ──────────────────────────────────────────

/**
 * Detect if adding a dependency from newItemId -> dependsOnId would create
 * a circular chain in the existing items.
 *
 * Walks the dependsOn chain starting from dependsOnId. If any item in the
 * chain has a dependsOn pointing back to newItemId, it's circular.
 */
function detectCircularDep(
  items: QueueJsonItem[],
  newItemId: string,
  dependsOnId: string,
): boolean {
  const visited = new Set<string>();
  let current: string | null = dependsOnId;

  while (current !== null) {
    if (current === newItemId) return true;
    if (visited.has(current)) return true; // cycle in existing chain
    visited.add(current);
    const item = items.find((i) => i.id === current);
    if (!item) break;
    current = item.dependsOn;
  }

  return false;
}

// ── History Capping ────────────────────────────────────────────────────────

function capHistory(history: QueueHistoryItem[]): QueueHistoryItem[] {
  if (history.length <= MAX_HISTORY) return history;
  // Sort by completedAt desc, keep newest MAX_HISTORY
  const sorted = [...history].sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bTime - aTime;
  });
  return sorted.slice(0, MAX_HISTORY);
}

// ── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Add a new item to the queue. Returns the generated nanoid.
 *
 * If dependsOn is provided, validates:
 * - The referenced item exists
 * - Adding this dependency won't create a circular chain
 */
async function addItem(opts: {
  project: string;
  mode: string;
  description?: string;
  dependsOn?: string;
  maxAttempts?: number;
  meta?: Record<string, unknown>;
}): Promise<string> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const id = nanoid(12);

    if (opts.dependsOn !== undefined) {
      const depItem = data.items.find((i) => i.id === opts.dependsOn);
      if (!depItem) {
        // Dependency references non-existent item — allow it (it just won't
        // be launchable until the dep completes and appears in history)
      }

      if (detectCircularDep(data.items, id, opts.dependsOn)) {
        throw new Error(`Circular dependency detected: adding dependsOn ${opts.dependsOn} would create a cycle`);
      }
    }

    const item: QueueJsonItem = {
      id,
      project: opts.project,
      mode: opts.mode,
      description: opts.description ?? '',
      status: 'queued',
      addedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      phase: null,
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 3,
      dependsOn: opts.dependsOn ?? null,
      error: null,
      meta: opts.meta ?? {},
    };

    data.items.push(item);
    await saveQueue(data);
    return id;
  });
}

/**
 * Remove a queued item by ID.
 * Throws if item not found or if item is currently running.
 */
async function removeItem(id: string): Promise<void> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const idx = data.items.findIndex((i) => i.id === id);

    if (idx === -1) {
      throw new Error(`Item not found: ${id}`);
    }

    const item = data.items[idx]!;
    if (item.status === 'running') {
      throw new Error(`Cannot remove running item: ${id}`);
    }

    data.items.splice(idx, 1);
    await saveQueue(data);
  });
}

/**
 * Find the first launchable item in the queue.
 *
 * An item is launchable when:
 * - status === 'queued'
 * - project not in runningProjects set (same-project sequential)
 * - dependsOn is null OR the dependency is in history as 'completed'
 * - activeCount < maxParallel
 *
 * Returns null if no item is launchable.
 */
async function findLaunchable(
  runningProjects: Set<string>,
  maxParallel: number,
  activeCount: number,
): Promise<QueueJsonItem | null> {
  if (activeCount >= maxParallel) return null;

  const data = await loadQueue();

  for (const item of data.items) {
    if (item.status !== 'queued') continue;
    if (runningProjects.has(item.project)) continue;

    if (item.dependsOn !== null) {
      const depCompleted = data.history.some(
        (h) => h.id === item.dependsOn && h.status === 'completed',
      );
      if (!depCompleted) continue;
    }

    return item;
  }

  return null;
}

/**
 * Mark an item as running. Increments attempts and sets startedAt.
 */
async function markRunning(id: string): Promise<void> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const item = data.items.find((i) => i.id === id);

    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    item.status = 'running';
    item.startedAt = new Date().toISOString();
    item.attempts++;
    await saveQueue(data);
  });
}

/**
 * Mark an item as completed. Moves it from items to history with duration.
 */
async function markCompleted(id: string): Promise<void> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const idx = data.items.findIndex((i) => i.id === id);

    if (idx === -1) {
      throw new Error(`Item not found: ${id}`);
    }

    const item = data.items[idx]!;
    const now = new Date().toISOString();
    item.status = 'completed';
    item.completedAt = now;

    const startMs = item.startedAt ? new Date(item.startedAt).getTime() : Date.now();
    const endMs = new Date(now).getTime();
    const duration = Math.round((endMs - startMs) / 1000);

    const historyItem: QueueHistoryItem = { ...item, duration };
    data.history.push(historyItem);
    data.history = capHistory(data.history);

    data.items.splice(idx, 1);
    await saveQueue(data);
  });
}

/**
 * Mark an item as failed. Moves it from items to history with duration and error.
 */
async function markFailed(id: string, error?: string): Promise<void> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const idx = data.items.findIndex((i) => i.id === id);

    if (idx === -1) {
      throw new Error(`Item not found: ${id}`);
    }

    const item = data.items[idx]!;
    const now = new Date().toISOString();
    item.status = 'failed';
    item.completedAt = now;
    item.error = error ?? null;

    const startMs = item.startedAt ? new Date(item.startedAt).getTime() : Date.now();
    const endMs = new Date(now).getTime();
    const duration = Math.round((endMs - startMs) / 1000);

    const historyItem: QueueHistoryItem = { ...item, duration };
    data.history.push(historyItem);
    data.history = capHistory(data.history);

    data.items.splice(idx, 1);
    await saveQueue(data);
  });
}

/**
 * Mark an item back to queued (for retry). Clears startedAt.
 * Item stays in items array.
 */
async function markQueued(id: string): Promise<void> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const item = data.items.find((i) => i.id === id);

    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    item.status = 'queued';
    item.startedAt = null;
    await saveQueue(data);
  });
}

/**
 * Get history entries sorted by completedAt desc.
 */
async function getHistory(limit?: number): Promise<QueueHistoryItem[]> {
  const data = await loadQueue();
  const sorted = [...data.history].sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bTime - aTime;
  });
  return sorted.slice(0, limit ?? MAX_HISTORY);
}

/**
 * Get all active items (not in history).
 */
async function getItems(): Promise<QueueJsonItem[]> {
  const data = await loadQueue();
  return data.items;
}

/**
 * Get a single item by ID from the active items array.
 */
async function getItemById(id: string): Promise<QueueJsonItem | null> {
  const data = await loadQueue();
  return data.items.find((i) => i.id === id) ?? null;
}

export {
  ensurePilotDir,
  loadQueue,
  saveQueue,
  withQueueJsonLock,
  addItem,
  removeItem,
  findLaunchable,
  markRunning,
  markCompleted,
  markFailed,
  markQueued,
  getHistory,
  getItems,
  getItemById,
  detectCircularDep,
};
