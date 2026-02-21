/**
 * Queue file locking utilities.
 *
 * - withQueueLock: Legacy QUEUE.md file locking (deprecated, no runtime consumers)
 * - cleanStaleLocks: Safety net — removes lock files older than 5 minutes
 *
 * Pure core module — no UI dependencies.
 */

import { lock } from 'proper-lockfile';
import { stat, unlink } from 'node:fs/promises';
import { getConfig } from './config.js';

/**
 * @deprecated — Legacy QUEUE.md file locking.
 * All queue operations now use queue-store.ts with its own locking.
 *
 * Execute an async function while holding an exclusive lock on QUEUE.md.
 *
 * - Stale timeout: 30 seconds (spec §8 — QUEUE.md locking)
 * - Retries: 5 attempts with 100ms–1000ms exponential backoff
 * - Lock is always released, even if fn throws
 */
async function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const config = getConfig();

  const release = await lock(config.queueFile, {
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

/**
 * Remove stale lock files that proper-lockfile's own stale detection missed.
 *
 * Safety net for production: if proper-lockfile crashes or its stale detection
 * fails, lock files can accumulate and block all queue operations. This function
 * checks the queue.json lock file and removes it if older than 5 minutes.
 *
 * Intended to be called on daemon startup.
 */
const STALE_LOCK_AGE_MS = 5 * 60 * 1000; // 5 minutes

async function cleanStaleLocks(): Promise<void> {
  const config = getConfig();
  const lockPath = config.queueJsonFile + '.lock';

  try {
    const info = await stat(lockPath);
    const ageMs = Date.now() - info.mtimeMs;

    if (ageMs > STALE_LOCK_AGE_MS) {
      await unlink(lockPath);
      process.stderr.write(`[lock] Removed stale lock file (age > 5min)\n`);
    }
  } catch (err: unknown) {
    // Lock file doesn't exist or can't be stat'd — nothing to clean
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(
        `[lock] Warning: Could not check lock file: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

export { withQueueLock, cleanStaleLocks };
