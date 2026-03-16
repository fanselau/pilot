/**
 * Tests for src/core/agents-md.ts — checkAgentsMdExists and spawnAgentsMdSession.
 *
 * Mocks execa, opencode-db, delegate, models, and fs access/read calls to
 * exercise all code paths without spawning real processes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockExeca = vi.fn();

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

const mockFindSessionByTitle = vi.fn();
const mockIsSessionDone = vi.fn();
const mockExportSessionFromDb = vi.fn();

vi.mock('../../src/core/opencode-db.js', () => ({
  findSessionByTitle: (...args: unknown[]) => mockFindSessionByTitle(...args),
  isSessionDone: (...args: unknown[]) => mockIsSessionDone(...args),
  exportSessionFromDb: (...args: unknown[]) => mockExportSessionFromDb(...args),
}));

vi.mock('../../src/core/delegate.js', () => ({
  resolveOpencodeBinary: () => '/usr/local/bin/opencode',
}));

vi.mock('../../src/core/models.js', () => ({
  resolveTopLevelModel: () => ({ model: 'anthropic/claude-haiku-4-5', variant: undefined }),
}));

const mockAccess = vi.fn();
const mockReadFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import { checkAgentsMdExists, spawnAgentsMdSession } from '../../src/core/agents-md.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  mockReadFile.mockResolvedValue('# prompt body');
});

afterEach(() => {
  stderrSpy.mockRestore();
});

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

describe('spawnAgentsMdSession', () => {
  function makeMockProcess(pid = 12345) {
    return {
      pid,
      catch: vi.fn().mockReturnThis(),
      unref: vi.fn(),
    };
  }

  it.each([
    { operation: 'setup', promptFile: 'agents-setup.md', command: 'generate agents' },
    { operation: 'health', promptFile: 'agents-health.md', command: 'agents check' },
    { operation: 'lessons', promptFile: 'lessons.md', command: 'extract lessons' },
  ] as const)('maps $operation to $promptFile and invokes inline prompt shape', async ({ operation, promptFile, command }) => {
    const proc = makeMockProcess(5001);
    mockExeca.mockReturnValue(proc);
    mockReadFile.mockResolvedValue(`# ${operation} prompt`);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    mockFindSessionByTitle.mockReturnValue(null);

    const opResult = await spawnAgentsMdSession({ projectDir: '/tmp/project', operation, timeoutMs: 10_000 });
    const legacyResult = await spawnAgentsMdSession({ projectDir: '/tmp/project', command, timeoutMs: 10_000 });

    expect(opResult).toBeNull();
    expect(legacyResult).toBeNull();
    expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining(promptFile), 'utf8');

    const latestArgs = mockExeca.mock.calls.at(-1)?.[1] as string[];
    expect(latestArgs).toContain('run');
    expect(latestArgs).not.toContain('--command');
    expect(latestArgs.join(' ')).not.toMatch(/--command\s+gsd-/);
    const inlinePrompt = latestArgs.at(-1);
    expect(inlinePrompt).toContain(`# ${operation} prompt`);
    expect(inlinePrompt).toContain(`Operation: ${operation}`);

    killSpy.mockRestore();
  });

  it('returns last assistant content on successful session', async () => {
    const proc = makeMockProcess(9999);
    mockExeca.mockReturnValue(proc);
    mockReadFile.mockResolvedValue('# setup prompt');

    let pollCount = 0;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0 || signal === undefined) {
        pollCount += 1;
        if (pollCount >= 2) throw new Error('ESRCH');
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
      operation: 'setup',
      timeoutMs: 10_000,
    });

    expect(result).toBe('All references valid');
    expect(mockExeca).toHaveBeenCalledWith(
      '/usr/local/bin/opencode',
      expect.arrayContaining(['run', '--title']),
      expect.objectContaining({ cwd: '/tmp/project', detached: true }),
    );
    const args = mockExeca.mock.calls[0]?.[1] as string[];
    expect(args).not.toContain('--command');
    expect(args.at(-1)).toContain('Operation: setup');
    expect(args.at(-1)).toContain('Allow file edits: true');

    killSpy.mockRestore();
  });

  it('returns null on timeout', async () => {
    const proc = makeMockProcess(8888);
    mockExeca.mockReturnValue(proc);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0 || signal === undefined) return true;
      return true;
    });
    mockFindSessionByTitle.mockReturnValue(null);

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      operation: 'health',
      timeoutMs: 200,
    });

    expect(result).toBeNull();
    const args = mockExeca.mock.calls[0]?.[1] as string[];
    expect(args.at(-1)).toContain('Operation: health');
    expect(args.at(-1)).toContain('Allow file edits: false');
    killSpy.mockRestore();
  });

  it('returns null when process dies before completing', async () => {
    const proc = makeMockProcess(7777);
    mockExeca.mockReturnValue(proc);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    mockFindSessionByTitle.mockReturnValue(null);

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      operation: 'setup',
      timeoutMs: 10_000,
    });

    expect(result).toBeNull();
    killSpy.mockRestore();
  });

  it('returns content when process dies but session completed before death', async () => {
    const proc = makeMockProcess(6666);
    mockExeca.mockReturnValue(proc);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

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
      operation: 'setup',
      timeoutMs: 10_000,
    });

    expect(result).toBe('Generated successfully');
    killSpy.mockRestore();
  });

  it('never throws and returns null on errors', async () => {
    mockReadFile.mockResolvedValue('# setup prompt');
    mockExeca.mockImplementation(() => {
      throw new Error('Binary not found');
    });

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      operation: 'setup',
      timeoutMs: 10_000,
    });

    expect(result).toBeNull();
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
      messages: [{ role: 'user', content: 'Check AGENTS.md' }],
    });

    const result = await spawnAgentsMdSession({
      projectDir: '/tmp/project',
      operation: 'setup',
      timeoutMs: 10_000,
    });

    expect(result).toBeNull();
    killSpy.mockRestore();
  });
});
