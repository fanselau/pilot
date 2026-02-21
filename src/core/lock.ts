/**
 * @deprecated Use queue-store.ts withQueueJsonLock instead.
 * This module locks QUEUE.md for legacy markdown queue operations.
 * Will be removed after all consumers migrate to queue-store.
 *
 * Remaining consumers: src/commands/add.ts, src/commands/scope.ts
 * (will be migrated in Plan 03).
 *
 * Wraps any async callback with file locking on the QUEUE.md path.
 * Stale timeout: 30s. Retry with exponential backoff for contention.
 *
 * Pure core module — no UI dependencies.
 */

import { lock } from 'proper-lockfile';
import { getConfig } from './config.js';

/**
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

export { withQueueLock };
