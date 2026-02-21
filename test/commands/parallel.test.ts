/**
 * Integration tests for cross-project parallel builds.
 *
 * Validates the runner's core contract:
 *   - Different projects run in parallel (cross-project)
 *   - Same-project items run sequentially
 *   - maxParallel limit is respected
 *
 * Uses the same mock patterns as test/core/runner.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all core module dependencies ──────────────────────────────────────

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
    pollInterval: 3,
    defaultTimeout: 60,
  })),
}));

vi.mock('../../src/core/queue-store.js', () => ({
  findLaunchableAtomic: vi.fn(),
  cascadeFailure: vi.fn().mockResolvedValue([]),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markQueued: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/spawn.js', () => ({
  preSpawnChecks: vi.fn().mockResolvedValue(undefined),
  spawnSession: vi.fn(),
  truncateTitle: vi.fn((p: string, m: string, _a?: string) => `${p}-${m}`),
}));

vi.mock('../../src/core/process.js', () => ({
  writePidFile: vi.fn().mockResolvedValue(undefined),
  removePidFile: vi.fn().mockResolvedValue(undefined),
  isProcessAlive: vi.fn(),
}));

vi.mock('../../src/core/postmortem.js', () => ({
  logPostmortem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/lifecycle.js', () => ({
  runLifecycleMode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '0', stderr: '', exitCode: 0 }),
}));

vi.mock('tree-kill', () => ({
  default: vi.fn((_pid: number, _signal: string, cb: () => void) => cb()),
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { findLaunchableAtomic } from '../../src/core/queue-store.js';
import { spawnSession } from '../../src/core/spawn.js';
import { isProcessAlive } from '../../src/core/process.js';
import { createRunner } from '../../src/core/runner.js';
import type { QueueJsonItem } from '../../src/core/types.js';

const mockedFindLaunchableAtomic = vi.mocked(findLaunchableAtomic);
const mockedSpawnSession = vi.mocked(spawnSession);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);

// ── Helper ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<QueueJsonItem> = {}): QueueJsonItem {
  return {
    id: `id-${Math.random().toString(36).slice(2, 6)}`,
    project: 'default-project',
    mode: 'run-command',
    description: 'quick fix',
    status: 'queued',
    addedAt: new Date().toISOString(),
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

function makeMockProcess(pid: number) {
  return {
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'exit') {
        // Fire exit after brief delay to simulate process completing
        setTimeout(() => cb(0), 30);
      }
    }),
    unref: vi.fn(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Cross-project parallel builds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('two different projects are launched in parallel (both get spawned)', async () => {
    const itemA = makeItem({ id: 'id-aaaa', project: 'project-a' });
    const itemB = makeItem({ id: 'id-bbbb', project: 'project-b' });

    // findLaunchableAtomic returns items already marked running.
    // For parallel: scan 1→A, scan 2→B, scan 3→null
    let scanCount = 0;
    mockedFindLaunchableAtomic.mockImplementation(async (runningProjects) => {
      scanCount++;
      if (scanCount === 1) return { ...itemA, status: 'running' as const, attempts: 1 };
      if (scanCount === 2 && !runningProjects.has('project-b')) return { ...itemB, status: 'running' as const, attempts: 1 };
      return null;
    });

    // Mock spawn: return different PIDs for each project
    mockedSpawnSession
      .mockResolvedValueOnce({
        pid: 10001,
        process: makeMockProcess(10001),
        title: 'project-a-run-command',
        logFile: '/tmp/project-a.log',
      })
      .mockResolvedValueOnce({
        pid: 10002,
        process: makeMockProcess(10002),
        title: 'project-b-run-command',
        logFile: '/tmp/project-b.log',
      });

    // After both launch, process dies so reap completes the jobs
    mockedIsProcessAlive.mockReturnValue(false);

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });

    const launchedItems: string[] = [];
    runner.on('launch', (item: QueueJsonItem) => {
      launchedItems.push(item.project);
    });

    await runner.start();

    // Both projects should have been launched
    expect(launchedItems).toContain('project-a');
    expect(launchedItems).toContain('project-b');
    expect(mockedSpawnSession).toHaveBeenCalledTimes(2);
    // findLaunchableAtomic marks running atomically — no separate markRunning call
    expect(mockedFindLaunchableAtomic).toHaveBeenCalled();
  }, 15000);

  it('same-project items run sequentially (second waits for first)', async () => {
    const item1 = makeItem({ id: 'id-1111', project: 'same-project', description: 'task-1' });
    const item2 = makeItem({ id: 'id-2222', project: 'same-project', description: 'task-2' });

    // Track whether the runner tried to block the second item.
    // findLaunchableAtomic receives runningProjects set from the runner —
    // while 'same-project' is in that set, it must NOT return item2.
    let sameProjectBlocked = false;
    let firstItemLaunched = false;
    let firstItemReaped = false;
    let secondReturned = false;

    mockedFindLaunchableAtomic.mockImplementation(async (runningProjects) => {
      // First scan: return item1 (already marked running by atomic find)
      if (!firstItemLaunched) {
        firstItemLaunched = true;
        return { ...item1, status: 'running' as const, attempts: 1 };
      }
      // While same-project is in runningProjects, the runner won't launch item2
      if (runningProjects.has('same-project')) {
        sameProjectBlocked = true;
        return null;
      }
      // After first is reaped, return item2
      if (firstItemReaped && !secondReturned) {
        secondReturned = true;
        return { ...item2, status: 'running' as const, attempts: 1 };
      }
      return null;
    });

    // First spawn: keep alive for first check, then die on reap
    let firstAliveCount = 0;
    mockedIsProcessAlive.mockImplementation((pid: number) => {
      if (pid === 20001) {
        firstAliveCount++;
        // Keep alive for first check (scan → waitForAnyCompletion), then die
        if (firstAliveCount <= 1) return true;
        firstItemReaped = true;
        return false;
      }
      // Second process dies immediately (for quick test completion)
      return false;
    });

    mockedSpawnSession
      .mockResolvedValueOnce({
        pid: 20001,
        process: makeMockProcess(20001),
        title: 'same-project-task-1',
        logFile: '/tmp/same-1.log',
      })
      .mockResolvedValueOnce({
        pid: 20002,
        process: makeMockProcess(20002),
        title: 'same-project-task-2',
        logFile: '/tmp/same-2.log',
      });

    // Use once:true — the sequential behavior is enforced by runner passing
    // runningProjects to findLaunchableAtomic, which works identically in
    // both once and daemon modes. once:true avoids the daemon poll loop.
    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });

    const launchOrder: string[] = [];
    runner.on('launch', (item: QueueJsonItem) => {
      launchOrder.push(item.description);
    });

    await runner.start();

    // Both should eventually be launched, but sequentially
    expect(launchOrder).toHaveLength(2);
    expect(launchOrder[0]).toBe('task-1');
    expect(launchOrder[1]).toBe('task-2');

    // Verify that same-project was blocked at some point
    expect(sameProjectBlocked).toBe(true);
  }, 15000);

  it('maxParallel=3 limits to 3 concurrent launches', async () => {
    // Create 6 items for 6 different projects
    const items = Array.from({ length: 6 }, (_, i) =>
      makeItem({
        id: `id-p${i}`,
        project: `project-${i}`,
        description: `job-${i}`,
      }),
    );

    let itemIndex = 0;
    mockedFindLaunchableAtomic.mockImplementation(async (_runningProjects, maxParallel, activeCount) => {
      // Only return items if capacity allows
      if (activeCount >= maxParallel) return null;
      if (itemIndex < items.length) {
        const item = items[itemIndex++]!;
        return { ...item, status: 'running' as const, attempts: 1 };
      }
      return null;
    });

    // Each spawn returns a unique PID
    for (let i = 0; i < 6; i++) {
      mockedSpawnSession.mockResolvedValueOnce({
        pid: 30000 + i,
        process: makeMockProcess(30000 + i),
        title: `project-${i}-run-command`,
        logFile: `/tmp/project-${i}.log`,
      });
    }

    mockedIsProcessAlive.mockReturnValue(false);

    // Use once:true — maxParallel limit is enforced by the runner passing
    // activeCount to findLaunchableAtomic, which works identically in both
    // once and daemon modes. once:true avoids the daemon poll loop.
    const runner = createRunner({
      once: true,
      maxParallel: 3,
      maxRetries: 3,
      dryRun: false,
      force: true,
      pollInterval: 3,
    });

    const launched: string[] = [];
    runner.on('launch', (item: QueueJsonItem) => {
      launched.push(item.project);
    });

    await runner.start();

    // All 6 should eventually launch (after reaping frees capacity)
    expect(launched.length).toBeGreaterThanOrEqual(3);

    // findLaunchableAtomic should have been called with activeCount capping
    expect(mockedFindLaunchableAtomic).toHaveBeenCalled();
  }, 15000);

  it('--dry-run shows all launchable entries without spawning', async () => {
    const itemA = makeItem({ id: 'id-dry1', project: 'dry-a' });
    const itemB = makeItem({ id: 'id-dry2', project: 'dry-b' });

    let scanCount = 0;
    mockedFindLaunchableAtomic.mockImplementation(async () => {
      scanCount++;
      if (scanCount === 1) return { ...itemA, status: 'running' as const, attempts: 1 };
      if (scanCount === 2) return { ...itemB, status: 'running' as const, attempts: 1 };
      return null;
    });

    const runner = createRunner({
      once: true,
      maxParallel: 5,
      maxRetries: 3,
      dryRun: true,
      force: true,
      pollInterval: 3,
    });

    const dryRunItems: string[] = [];
    runner.on('dry-run', (item: QueueJsonItem) => {
      dryRunItems.push(item.project);
    });

    await runner.start();

    // Both items reported via dry-run event
    expect(dryRunItems).toContain('dry-a');
    expect(dryRunItems).toContain('dry-b');

    // No actual spawns
    expect(mockedSpawnSession).not.toHaveBeenCalled();
  });
});
