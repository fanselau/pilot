/**
 * Tests for src/core/agents-md.ts — checkAgentsMdExists and spawnAgentsMdSession.
 *
 * Mocks execa, opencode-db, delegate, and models to exercise all code paths
 * without spawning real processes or querying real databases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock execa ──────────────────────────────────────────────────────────────

const mockExeca = vi.fn();

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

// ── Mock opencode-db ────────────────────────────────────────────────────────

const mockFindSessionByTitle = vi.fn();
const mockIsSessionDone = vi.fn();
const mockExportSessionFromDb = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  isSessionDone: (...args: unknown[]) => mockIsSessionDone(...args),
  exportSessionFromDb: (...args: unknown[]) => mockExportSessionFromDb(...args),
}));

// ── Mock delegate ───────────────────────────────────────────────────────────

vi.mock('../../src/core/delegate.js', () => ({
  resolveOpencodeBinary: () => '/usr/local/bin/opencode',
}));

// ── Mock models ─────────────────────────────────────────────────────────────

vi.mock('../../src/core/models.js', () => ({
  resolveTopLevelModel: () => ({ model: 'anthropic/claude-haiku-4-5', variant: undefined }),
}));

// ── Mock fs/promises (for checkAgentsMdExists) ──────────────────────────────

const mockAccess = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { checkAgentsMdExists, spawnAgentsMdSession } from '../../src/core/agents-md.js';

// ── Setup / teardown ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stderrSpy.mockRestore();
});

// ── checkAgentsMdExists ─────────────────────────────────────────────────────

describe('checkAgentsMdExists', () => {
  it('returns true when AGENTS.md exists', async () => {
    mockAccess.mockResolvedValue(undefined);
    const result = await checkAgentsMdExists('/tmp/my-project');
    expect(result).toBe(true);
    expect(mockAccess).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
  });

  it('returns false when AGENTS.md does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const result = await checkAgentsMdExists('/tmp/my-project');
    expect(result).toBe(false);
  });
});

// ── spawnAgentsMdSession ────────────────────────────────────────────────────

describe('spawnAgentsMdSession', () => {
  /**
   * Helper to create a mock execa process object.
   */
  function makeMockProcess(pid = 12345) {
    const proc = {
      pid,
      catch: vi.fn().mockReturnThis(),
      unref: vi.fn(),
    };
    return proc;
  }

  it('returns last assistant content on successful session', async () => {
    const proc = makeMockProcess(9999);
    mockExeca.mockReturnValue(proc);

    // After first poll: process alive → session found → session done → extract content
    let pollCount = 0;
    const processKillOrig = process.kill;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0 || signal === undefined) {
        // PID liveness check — say process is alive for first poll, then dead
        pollCount++;
        if (pollCount >= 2) {
          throw new Error('ESRCH'); // process dead after second poll
        }
        return true;
      }
      return true;
    });

    mockFindSessionByTitle.mockReturnValue('session-123');
    mockIsSessionDone.mockReturnValue(true);
    mockExportSessionFromDb.mockReturnValue({
      messages: [
        { role: 'user', content: 'Check AGENTS.md' },
        { role: 'assistant', content: 'All references valid' },
      ],
    });

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      command: 'gsd-setup-agents',
      timeoutMs: 10_000,
    });

    expect(result).toBe('All references valid');
    expect(mockExeca).toHaveBeenCalledWith(
      '/usr/local/bin/opencode',
      expect.arrayContaining(['run', '--command', 'gsd-setup-agents']),
      expect.objectContaining({ cwd: '/tmp/project', detached: true }),
    );

    killSpy.mockRestore();
  });

  it('returns null on timeout', async () => {
    const proc = makeMockProcess(8888);
    mockExeca.mockReturnValue(proc);

    // Process is always alive, session never found
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0 || signal === undefined) return true; // Alive
      return true; // SIGTERM accepted
    });
    mockFindSessionByTitle.mockReturnValue(null);

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      command: 'gsd-setup-agents',
      timeoutMs: 200, // Very short timeout
    });

    expect(result).toBeNull();
    killSpy.mockRestore();
  });

  it('returns null when process dies before completing', async () => {
    const proc = makeMockProcess(7777);
    mockExeca.mockReturnValue(proc);

    // Process is dead immediately (PID check throws)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    // Session not found in DB
    mockFindSessionByTitle.mockReturnValue(null);

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      command: 'gsd-setup-agents',
      timeoutMs: 10_000,
    });

    expect(result).toBeNull();
    killSpy.mockRestore();
  });

  it('returns content when process dies but session completed before death', async () => {
    const proc = makeMockProcess(6666);
    mockExeca.mockReturnValue(proc);

    // Process dead
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    // But session completed before it died
    mockFindSessionByTitle.mockReturnValue('session-456');
    mockIsSessionDone.mockReturnValue(true);
    mockExportSessionFromDb.mockReturnValue({
      messages: [
        { role: 'user', content: 'Generate AGENTS.md' },
        { role: 'assistant', content: 'Generated successfully' },
      ],
    });

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      command: 'gsd-setup-agents',
      timeoutMs: 10_000,
    });

    expect(result).toBe('Generated successfully');
    killSpy.mockRestore();
  });

  it('never throws — returns null on errors', async () => {
    // Make execa throw to test the outer try/catch
    mockExeca.mockImplementation(() => {
      throw new Error('Binary not found');
    });

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      command: 'gsd-setup-agents',
      timeoutMs: 10_000,
    });

    expect(result).toBeNull();
    // Should have logged to stderr
    const stderrCalls = stderrSpy.mock.calls.map(c => c[0] as string).join('');
    expect(stderrCalls).toContain('spawnAgentsMdSession failed');
  });

  it('returns null when export has no assistant messages', async () => {
    const proc = makeMockProcess(5555);
    mockExeca.mockReturnValue(proc);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    mockFindSessionByTitle.mockReturnValue('session-789');
    mockIsSessionDone.mockReturnValue(true);
    mockExportSessionFromDb.mockReturnValue({
      messages: [
        { role: 'user', content: 'Check AGENTS.md' },
      ],
    });

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      command: 'gsd-setup-agents',
      timeoutMs: 10_000,
    });

    expect(result).toBeNull();
    killSpy.mockRestore();
  });
});
