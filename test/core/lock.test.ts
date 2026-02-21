import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { writeFileSync, existsSync, utimesSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock config to use temp directory
vi.mock('../../src/core/config.js', () => {
  return {
    getConfig: () => ({
      pilotDir: (globalThis as Record<string, unknown>).__TEST_LOCK_PILOT_DIR__ as string,
      queueJsonFile: (globalThis as Record<string, unknown>).__TEST_LOCK_QUEUE_JSON__ as string,
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

import { cleanStaleLocks } from '../../src/core/lock.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-lock-test-'));
  (globalThis as Record<string, unknown>).__TEST_LOCK_PILOT_DIR__ = tmpDir;
  (globalThis as Record<string, unknown>).__TEST_LOCK_QUEUE_JSON__ = path.join(tmpDir, 'queue.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── cleanStaleLocks ────────────────────────────────────────────────────────

describe('cleanStaleLocks', () => {
  it('removes lock file older than 5 minutes', async () => {
    const lockPath = path.join(tmpDir, 'queue.json.lock');

    // Create the lock file
    writeFileSync(lockPath, 'lock', 'utf8');

    // Backdate the mtime to 10 minutes ago
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lockPath, tenMinAgo, tenMinAgo);

    // Suppress stderr output
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await cleanStaleLocks();

    stderrSpy.mockRestore();

    // Lock file should be deleted
    expect(existsSync(lockPath)).toBe(false);
  });

  it('preserves fresh lock file', async () => {
    const lockPath = path.join(tmpDir, 'queue.json.lock');

    // Create a fresh lock file (current mtime)
    writeFileSync(lockPath, 'lock', 'utf8');

    await cleanStaleLocks();

    // Lock file should still exist
    expect(existsSync(lockPath)).toBe(true);
  });

  it('handles missing lock file gracefully', async () => {
    // No lock file exists — should not throw
    await expect(cleanStaleLocks()).resolves.not.toThrow();
  });
});
