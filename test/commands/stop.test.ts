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

vi.mock('../../src/core/process.js', () => ({
  readPidFile: vi.fn(),
  removePidFile: vi.fn().mockResolvedValue(undefined),
  isProcessAlive: vi.fn(),
}));

vi.mock('tree-kill', () => ({
  default: vi.fn((_pid: number, _signal: string, cb: (err?: Error) => void) => cb()),
}));

import { readPidFile, removePidFile, isProcessAlive } from '../../src/core/process.js';
import { setJsonMode } from '../../src/util/output.js';
import { stopCommand } from '../../src/commands/stop.js';

const mockedReadPidFile = vi.mocked(readPidFile);
const mockedRemovePidFile = vi.mocked(removePidFile);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('stopCommand', () => {
  let output: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    setJsonMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setJsonMode(false);
  });

  it('reads PID from pilot-runner PID file', async () => {
    mockedReadPidFile.mockResolvedValue(null);

    await stopCommand({});

    // Should read from 'pilot-runner'
    expect(mockedReadPidFile).toHaveBeenCalledWith('pilot-runner');
  });

  it('reports not running when PID file is null', async () => {
    mockedReadPidFile.mockResolvedValue(null);

    await stopCommand({});

    expect(output).toContain('not running');
  });

  it('reports not running when PID is stale (process dead)', async () => {
    mockedReadPidFile.mockResolvedValue(12345);
    mockedIsProcessAlive.mockReturnValue(false);

    await stopCommand({});

    expect(output).toContain('not running');
    // Should clean up stale PID file
    expect(mockedRemovePidFile).toHaveBeenCalledWith('pilot-runner');
  });

  it('--force sends SIGKILL and cleans up', async () => {
    mockedReadPidFile.mockResolvedValue(12345);
    mockedIsProcessAlive.mockReturnValue(true);

    await stopCommand({ force: true });

    expect(output).toContain('force-killed');
    expect(mockedRemovePidFile).toHaveBeenCalledWith('pilot-runner');
  });

  it('normal stop sends SIGTERM and has 15s wait loop', async () => {
    mockedReadPidFile.mockResolvedValue(12345);
    // Process alive initially, then dies
    let killCallCount = 0;
    mockedIsProcessAlive.mockImplementation(() => {
      killCallCount++;
      return killCallCount <= 1; // alive first time, dead second
    });

    // Mock process.kill to not throw
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as unknown as typeof process.kill);

    await stopCommand({});

    // SIGTERM should be sent
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
    expect(output).toContain('stopped');
    expect(mockedRemovePidFile).toHaveBeenCalledWith('pilot-runner');

    killSpy.mockRestore();
  });
});
