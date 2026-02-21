import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all core modules used by status command ────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/QUEUE.md',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/sessions.js', () => ({
  listSessions: vi.fn(),
}));

vi.mock('../../src/core/process.js', () => ({
  scanPidFiles: vi.fn(),
  readPidFile: vi.fn(),
  isProcessAlive: vi.fn(),
  getProcessRuntime: vi.fn(),
}));

vi.mock('../../src/core/stuck.js', () => ({
  computeStuckScoreFast: vi.fn(),
}));

vi.mock('../../src/core/queue-parser.js', () => ({
  parseQueueFile: vi.fn(),
}));

// Must mock cli-table3 to avoid rendering issues in tests
vi.mock('cli-table3', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      push: vi.fn(),
      toString: vi.fn(() => 'mocked-table'),
    })),
  };
});

import { listSessions } from '../../src/core/sessions.js';
import { scanPidFiles, readPidFile, isProcessAlive, getProcessRuntime } from '../../src/core/process.js';
import { computeStuckScoreFast } from '../../src/core/stuck.js';
import { parseQueueFile } from '../../src/core/queue-parser.js';
import { setJsonMode } from '../../src/util/output.js';
import { statusCommand } from '../../src/commands/status.js';
import type { SessionInfo, StuckAssessment, QueueEntry } from '../../src/core/types.js';

const mockedListSessions = vi.mocked(listSessions);
const mockedScanPidFiles = vi.mocked(scanPidFiles);
const mockedReadPidFile = vi.mocked(readPidFile);
const mockedIsProcessAlive = vi.mocked(isProcessAlive);
const mockedGetProcessRuntime = vi.mocked(getProcessRuntime);
const mockedComputeStuckScoreFast = vi.mocked(computeStuckScoreFast);
const mockedParseQueueFile = vi.mocked(parseQueueFile);

describe('statusCommand', () => {
  let output: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    // Default: runner PID file doesn't exist
    mockedReadPidFile.mockResolvedValue(null);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    setJsonMode(false);
  });

  it('outputs valid PilotStatusJson shape with --json', async () => {
    // Setup mocks with known data
    const sessions: SessionInfo[] = [
      { id: 'sess-001', title: 'resume-roast-execute-phase-3', updated: 1708436400000, created: 1708432800000, message_count: 42 },
      { id: 'sess-002', title: 'pet-portraits-plan-phase-2', updated: 1708435500000, created: 1708432200000, message_count: 15 },
      { id: 'sess-003', title: 'baby-predictor-verify-auto-1', updated: 1708434000000, created: 1708431600000, message_count: 8 },
    ];
    mockedListSessions.mockResolvedValue(sessions);

    mockedScanPidFiles.mockResolvedValue([
      { session: 'resume-roast-execute', pid: 12345 },
    ]);

    const queueEntries: QueueEntry[] = [
      { lineNum: 1, project: 'hub', mode: 'continue', args: '', status: 'pending' },
      { lineNum: 2, project: 'registry', mode: 'add-and-build', args: 'add caching', status: 'pending' },
    ];
    mockedParseQueueFile.mockResolvedValue(queueEntries);

    mockedComputeStuckScoreFast.mockResolvedValue({
      pid: 12345,
      session: 'resume-roast-execute',
      score: 15,
      verdict: 'healthy',
      signals: [],
      runtime_seconds: 300,
      log_staleness_seconds: 10,
    } satisfies StuckAssessment);

    setJsonMode(true);
    await statusCommand({ json: true });

    const parsed = JSON.parse(output);

    // Verify top-level shape
    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.summary).toBeDefined();
    expect(typeof parsed.summary.running).toBe('number');
    expect(typeof parsed.summary.stuck).toBe('number');
    expect(typeof parsed.summary.suspect).toBe('number');
    expect(typeof parsed.summary.queued).toBe('number');
    expect(typeof parsed.summary.completed).toBe('number');

    // Verify sessions structure
    expect(Array.isArray(parsed.sessions.running)).toBe(true);
    expect(Array.isArray(parsed.sessions.stuck)).toBe(true);
    expect(Array.isArray(parsed.sessions.suspect)).toBe(true);

    // Verify queue is array
    expect(Array.isArray(parsed.queue)).toBe(true);

    // Verify completed is array
    expect(Array.isArray(parsed.completed)).toBe(true);

    // Verify runner object
    expect(parsed.runner).toBeDefined();
    expect(typeof parsed.runner.active).toBe('boolean');

    // Verify counts
    expect(parsed.summary.running).toBe(1);
    expect(parsed.summary.queued).toBe(2);
    expect(parsed.summary.stuck).toBe(0);
    expect(parsed.summary.suspect).toBe(0);
  });

  it('outputs all zeros when no sessions, PIDs, or queue entries', async () => {
    mockedListSessions.mockResolvedValue([]);
    mockedScanPidFiles.mockResolvedValue([]);
    mockedParseQueueFile.mockResolvedValue([]);

    setJsonMode(true);
    await statusCommand({ json: true });

    const parsed = JSON.parse(output);

    expect(parsed.summary.running).toBe(0);
    expect(parsed.summary.stuck).toBe(0);
    expect(parsed.summary.suspect).toBe(0);
    expect(parsed.summary.queued).toBe(0);
    expect(parsed.summary.completed).toBe(0);
    expect(parsed.sessions.running).toEqual([]);
    expect(parsed.sessions.stuck).toEqual([]);
    expect(parsed.sessions.suspect).toEqual([]);
    expect(parsed.queue).toEqual([]);
    expect(parsed.completed).toEqual([]);
    expect(parsed.runner.active).toBe(false);
    expect(parsed.runner.pid).toBeNull();
    expect(parsed.runner.uptime_seconds).toBeNull();
  });

  it('cross-references sessions with PIDs correctly', async () => {
    const sessions: SessionInfo[] = [
      { id: 'sess-001', title: 'resume-roast-execute-phase-3', updated: 1708436400000, created: 1708432800000, message_count: 42 },
      { id: 'sess-002', title: 'pet-portraits-plan-phase-2', updated: 1708435500000, created: 1708432200000, message_count: 15 },
    ];
    mockedListSessions.mockResolvedValue(sessions);

    // Only one PID file matches
    mockedScanPidFiles.mockResolvedValue([
      { session: 'resume-roast-execute', pid: 12345 },
    ]);

    mockedParseQueueFile.mockResolvedValue([]);

    mockedComputeStuckScoreFast.mockResolvedValue({
      pid: 12345,
      session: 'resume-roast-execute',
      score: 10,
      verdict: 'healthy',
      signals: [],
      runtime_seconds: 600,
      log_staleness_seconds: 5,
    } satisfies StuckAssessment);

    setJsonMode(true);
    await statusCommand({ json: true });

    const parsed = JSON.parse(output);

    // resume-roast-execute-phase-3 matched PID → should be in running
    expect(parsed.sessions.running).toHaveLength(1);
    expect(parsed.sessions.running[0].id).toBe('sess-001');

    // pet-portraits-plan-phase-2 did NOT match PID → should be in completed
    expect(parsed.completed).toHaveLength(1);
    expect(parsed.completed[0].id).toBe('sess-002');

    // Summary counts should reflect
    expect(parsed.summary.running).toBe(1);
    expect(parsed.summary.completed).toBe(1);
  });

  it('includes queue entries with correct fields in JSON output', async () => {
    mockedListSessions.mockResolvedValue([]);
    mockedScanPidFiles.mockResolvedValue([]);

    const queueEntries: QueueEntry[] = [
      { lineNum: 5, project: 'hub', mode: 'continue', args: '', status: 'pending', description: 'A pending entry' },
      { lineNum: 10, project: 'registry', mode: 'add-and-build', args: 'add caching', status: 'running' },
    ];
    mockedParseQueueFile.mockResolvedValue(queueEntries);

    setJsonMode(true);
    await statusCommand({ json: true });

    const parsed = JSON.parse(output);

    expect(parsed.queue).toHaveLength(2);
    expect(parsed.queue[0]).toEqual({
      status: 'pending',
      project: 'hub',
      mode: 'continue',
      args: '',
      description: 'A pending entry',
      line_num: 5,
    });
    expect(parsed.queue[1]).toEqual({
      status: 'running',
      project: 'registry',
      mode: 'add-and-build',
      args: 'add caching',
      description: '',
      line_num: 10,
    });
  });

  it('handles queue file not found gracefully', async () => {
    mockedListSessions.mockResolvedValue([]);
    mockedScanPidFiles.mockResolvedValue([]);
    mockedParseQueueFile.mockRejectedValue(new Error('ENOENT'));

    setJsonMode(true);
    await statusCommand({ json: true });

    const parsed = JSON.parse(output);

    // Queue should be empty when file not found (not an error for status)
    expect(parsed.queue).toEqual([]);
    expect(parsed.summary.queued).toBe(0);
  });
});
