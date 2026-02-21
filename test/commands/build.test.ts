import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all external dependencies ──────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/test-QUEUE.md',
    pilotDir: '/tmp/.pilot',
    queueJsonFile: '/tmp/.pilot/queue.json',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
    pollInterval: 3,
    defaultTimeout: 60,
    maxParallel: 2,
    logLevel: 'INFO',
  })),
}));

// Mock addCommand — build delegates to it
vi.mock('../../src/commands/add.js', () => ({
  addCommand: vi.fn(),
}));

// Mock queue-store
vi.mock('../../src/core/queue-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/queue-store.js')>();
  return {
    ...actual,
    getItemById: vi.fn(),
  };
});

// Mock runner — we don't want to actually start a runner
vi.mock('../../src/core/runner.js', () => ({
  createRunner: vi.fn(),
}));

// Mock runner-log
vi.mock('../../src/core/runner-log.js', () => ({
  createRunnerLogger: vi.fn(() => ({
    log: vi.fn(),
    close: vi.fn(),
  })),
  rotateRunnerLogs: vi.fn(),
}));

import { addCommand } from '../../src/commands/add.js';
import { createRunner } from '../../src/core/runner.js';
import { getItemById } from '../../src/core/queue-store.js';
import { setJsonMode } from '../../src/util/output.js';
import { buildCommand } from '../../src/commands/build.js';
import type { AddResult } from '../../src/commands/add.js';

const mockedAddCommand = vi.mocked(addCommand);
const mockedCreateRunner = vi.mocked(createRunner);
const mockedGetItemById = vi.mocked(getItemById);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildCommand', () => {
  let output: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as typeof process.exit);
    setJsonMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    setJsonMode(false);
  });

  function makeAddResult(overrides: Partial<AddResult> = {}): AddResult {
    return {
      id: 'ab12',
      project: 'test-proj',
      scope: 'phase',
      internalMode: 'add-and-build',
      description: 'add dark mode',
      requirementsPath: null,
      dryRun: false,
      ...overrides,
    };
  }

  it('calls addCommand with silent: true', async () => {
    mockedAddCommand.mockResolvedValue(makeAddResult());

    // Mock runner that resolves start() immediately
    const mockRunner = {
      on: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
    };
    mockedCreateRunner.mockReturnValue(mockRunner as never);
    mockedGetItemById.mockResolvedValue(null); // item moved to history

    await buildCommand('test-proj', 'add dark mode', {});

    // addCommand should be called with silent: true
    expect(mockedAddCommand).toHaveBeenCalledWith(
      'test-proj',
      'add dark mode',
      expect.objectContaining({ silent: true }),
    );
  });

  it('creates runner with once: true', async () => {
    mockedAddCommand.mockResolvedValue(makeAddResult());

    const mockRunner = {
      on: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
    };
    mockedCreateRunner.mockReturnValue(mockRunner as never);
    mockedGetItemById.mockResolvedValue(null);

    await buildCommand('test-proj', 'add dark mode', {});

    // createRunner should be called with once: true
    expect(mockedCreateRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        once: true,
        force: true,
      }),
    );
  });

  it('blocks until runner completes and reports result', async () => {
    mockedAddCommand.mockResolvedValue(makeAddResult());

    const listeners = new Map<string, Function>();
    const mockRunner = {
      on: vi.fn((event: string, cb: Function) => {
        listeners.set(event, cb);
      }),
      start: vi.fn(async () => {
        // Simulate runner completing our item
        const completeCb = listeners.get('complete');
        if (completeCb) {
          completeCb({ id: 'ab12', project: 'test-proj' }, 'success');
        }
      }),
    };
    mockedCreateRunner.mockReturnValue(mockRunner as never);

    await buildCommand('test-proj', 'add dark mode', {});

    // runner.start() was called (blocking)
    expect(mockRunner.start).toHaveBeenCalledTimes(1);
    // Output should indicate success
    expect(output).toContain('Build complete');
  });

  it('reports failure when item result is failed', async () => {
    mockedAddCommand.mockResolvedValue(makeAddResult());

    const listeners = new Map<string, Function>();
    const mockRunner = {
      on: vi.fn((event: string, cb: Function) => {
        listeners.set(event, cb);
      }),
      start: vi.fn(async () => {
        const completeCb = listeners.get('complete');
        if (completeCb) {
          completeCb({ id: 'ab12', project: 'test-proj' }, 'failed');
        }
      }),
    };
    mockedCreateRunner.mockReturnValue(mockRunner as never);

    await expect(buildCommand('test-proj', 'add dark mode', {})).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(output).toContain('Build failed');
  });

  it('exits 2 when no input provided', async () => {
    await expect(buildCommand('test-proj', undefined, {})).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('--no-run queues without starting runner', async () => {
    mockedAddCommand.mockResolvedValue(makeAddResult());

    await buildCommand('test-proj', 'add dark mode', { run: false });

    // createRunner should NOT be called
    expect(mockedCreateRunner).not.toHaveBeenCalled();
    expect(output).toContain('Queued');
  });
});
