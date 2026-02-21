/**
 * JSON queue storage — CRUD operations over ~/.pilot/queue.json.
 *
 * Replaces queue-parser.ts for all new queue operations. Provides typed
 * CRUD with proper file locking (proper-lockfile), short human-typeable IDs, circular
 * dependency detection, and history capping.
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, mkdir } from 'node:fs/promises';
import {
  writeFileSync,
  renameSync,
  copyFileSync,
  openSync,
  fsyncSync,
  closeSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { lock } from 'proper-lockfile';
/**
 * Generate a short human-typeable ID: 4 lowercase alphanumeric chars.
 * ~1.6M combinations — plenty for a queue that rarely exceeds 100 items.
 */
function shortId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    id += alphabet[b % alphabet.length];
  }
  return id;
}
import { getConfig } from './config.js';
import type { QueueJsonFile, QueueJsonItem, QueueHistoryItem } from './types.js';

const MAX_HISTORY = 200;

// ── File I/O ───────────────────────────────────────────────────────────────

/**
 * Ensure the ~/.pilot/ directory exists. Idempotent.
 */
async function ensurePilotDir(): Promise<void> {
  const config = getConfig();
  await mkdir(config.pilotDir, { recursive: true });
}

/**
 * Try to parse JSON, with fallback to trimming trailing garbage
 * from a truncated write (strip everything after last `}`).
 */
function tryParseJson(raw: string): QueueJsonFile | null {
  try {
    return JSON.parse(raw) as QueueJsonFile;
  } catch {
    // Try trimming trailing garbage (truncated write)
    const lastBrace = raw.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        return JSON.parse(raw.slice(0, lastBrace + 1)) as QueueJsonFile;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Load queue from ~/.pilot/queue.json.
 * Returns empty queue if file doesn't exist.
 *
 * Recovery chain on corrupt data:
 * 1. Try parsing normally
 * 2. Try trimming trailing garbage (truncated write)
 * 3. Try reading queue.json.bak
 * 4. Return empty queue
 */
async function loadQueue(): Promise<QueueJsonFile> {
  const config = getConfig();
  let raw: string;

  try {
    raw = await readFile(config.queueJsonFile, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, items: [], history: [], completedIds: [] };
    }
    throw err;
  }

  // Step 1+2: Try parsing (with truncation fallback)
  const data = tryParseJson(raw);
  if (data !== null) {
    // Backward compat: old queue.json files may lack completedIds
    if (!Array.isArray(data.completedIds)) {
      data.completedIds = [];
    }
    return data;
  }

  // Step 3: Try reading backup
  process.stderr.write('[queue-store] Recovered from corrupt queue.json — trying backup\n');
  const bakPath = config.queueJsonFile + '.bak';
  try {
    const bakRaw = await readFile(bakPath, 'utf8');
    const bakData = tryParseJson(bakRaw);
    if (bakData !== null) {
      process.stderr.write('[queue-store] Using backup queue.json.bak\n');
      if (!Array.isArray(bakData.completedIds)) {
        bakData.completedIds = [];
      }
      return bakData;
    }
  } catch {
    // Backup doesn't exist or unreadable — fall through
  }

  // Step 4: Return empty queue
  process.stderr.write('[queue-store] Backup also corrupt or missing — starting with empty queue\n');
  return { version: 1, items: [], history: [], completedIds: [] };
}

/**
 * Save queue to ~/.pilot/queue.json with 2-space indent.
 * Creates ~/.pilot/ directory if needed.
 *
 * Crash-safe write sequence:
 * 1. Backup current queue.json to queue.json.bak (sync)
 * 2. Write to queue.json.tmp (sync)
 * 3. fsync the temp file to flush to disk
 * 4. Atomic rename tmp → queue.json (rename is atomic on Linux same-filesystem)
 */
async function saveQueue(data: QueueJsonFile): Promise<void> {
  const config = getConfig();
  // Ensure directory exists (sync to avoid race with writeFileSync)
  mkdirSync(config.pilotDir, { recursive: true });

  const filePath = config.queueJsonFile;
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  // Step 1: Backup current file (skip if it doesn't exist yet)
  if (existsSync(filePath)) {
    copyFileSync(filePath, bakPath);
  }

  // Step 2: Write to temp file
  const content = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(tmpPath, content, 'utf8');

  // Step 3: fsync to flush to disk
  const fd = openSync(tmpPath, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  // Step 4: Atomic rename
  renameSync(tmpPath, filePath);
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
      await saveQueue({ version: 1, items: [], history: [], completedIds: [] });
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
    const existingIds = new Set([
      ...data.items.map((i) => i.id),
      ...data.history.map((i) => i.id),
    ]);
    let id = shortId();
    let attempts = 0;
    while (existingIds.has(id) && attempts < 10) {
      id = shortId();
      attempts++;
    }
    if (existingIds.has(id)) {
      throw new Error('Failed to generate unique queue ID after 10 attempts');
    }

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
 * @deprecated Use `findLaunchableAtomic` instead — it holds the lock during
 * read + mark to prevent TOCTOU race where two runners launch the same item.
 *
 * Find the first launchable item in the queue (non-atomic, read-only).
 *
 * An item is launchable when:
 * - status === 'queued' (blocked items are implicitly excluded)
 * - project not in runningProjects set (same-project sequential)
 * - dependsOn is null OR the dependency is in completedIds
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
    if (item.status !== 'queued') continue;  // blocked/running/completed/failed all skip
    if (runningProjects.has(item.project)) continue;

    if (item.dependsOn !== null) {
      // Use completedIds (never pruned) instead of history (capped at 200)
      if (!data.completedIds.includes(item.dependsOn)) continue;
    }

    return item;
  }

  return null;
}

/**
 * Find and atomically mark the first launchable item as running.
 *
 * Holds the queue lock during read + mark to prevent TOCTOU race where two
 * runners could both find the same item launchable and launch it twice.
 *
 * An item is launchable when:
 * - status === 'queued' (blocked items are implicitly excluded)
 * - project not in runningProjects set (same-project sequential)
 * - dependsOn is null OR the dependency is in completedIds
 * - activeCount < maxParallel
 *
 * Returns the item (already marked running with attempts incremented) or null.
 */
async function findLaunchableAtomic(
  runningProjects: Set<string>,
  maxParallel: number,
  activeCount: number,
): Promise<QueueJsonItem | null> {
  return withQueueJsonLock(async () => {
    if (activeCount >= maxParallel) return null;

    const data = await loadQueue();

    for (const item of data.items) {
      if (item.status !== 'queued') continue;  // blocked/running/completed/failed all skip
      if (runningProjects.has(item.project)) continue;

      if (item.dependsOn !== null) {
        // Use completedIds (never pruned) instead of history (capped at 200)
        if (!data.completedIds.includes(item.dependsOn)) continue;
      }

      // Found launchable — mark running atomically within the same lock
      item.status = 'running';
      item.startedAt = new Date().toISOString();
      item.attempts++;
      await saveQueue(data);
      return item;
    }

    return null;
  });
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

    // Track in completedIds — never pruned (unlike history which caps at 200).
    // This is the source of truth for dependency resolution.
    if (!data.completedIds.includes(id)) {
      data.completedIds.push(id);
    }

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
 * Mark an item as blocked with an error reason.
 * Blocked items are not launchable and are not retried.
 */
async function markBlocked(id: string, reason: string): Promise<void> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`Item not found: ${id}`);
    item.status = 'blocked';
    item.error = reason;
    await saveQueue(data);
  });
}

/**
 * When a job permanently fails, block all transitive dependents.
 *
 * Walks the dependency graph starting from failedId. Any item (direct or
 * transitive) that depends on the failed item and is still queued gets
 * marked as 'blocked' with an error indicating which dependency failed.
 *
 * Returns the list of item IDs that were blocked.
 */
async function cascadeFailure(failedId: string): Promise<string[]> {
  return withQueueJsonLock(async () => {
    const data = await loadQueue();
    const blockedIds: string[] = [];

    // BFS: find all items that directly or transitively depend on failedId
    const toBlock = new Set<string>();
    const queue = [failedId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const item of data.items) {
        if (item.dependsOn === currentId && item.status === 'queued' && !toBlock.has(item.id)) {
          toBlock.add(item.id);
          queue.push(item.id);  // Check for transitive deps
        }
      }
    }

    for (const id of toBlock) {
      const item = data.items.find((i) => i.id === id);
      if (item) {
        item.status = 'blocked';
        item.error = `dependency ${failedId} failed`;
        blockedIds.push(id);
      }
    }

    if (blockedIds.length > 0) {
      await saveQueue(data);
    }
    return blockedIds;
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
};
