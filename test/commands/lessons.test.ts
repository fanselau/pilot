/**
 * Tests for `pilot lessons` command.
 *
 * Mocks agents-md, fs/promises, and output to verify all branching logic:
 * no .planning/, success, timeout, JSON mode, --approve flag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock agents-md ──────────────────────────────────────────────────────

const mockCheckAgentsMdExists = vi.fn();
const mockSpawnAgentsMdSession = vi.fn();

vi.mock('../../src/core/agents-md.js', () => ({
  checkAgentsMdExists: (...args: unknown[]) => mockCheckAgentsMdExists(...args),
  spawnAgentsMdSession: (...args: unknown[]) => mockSpawnAgentsMdSession(...args),
}));

// ── Mock output.ts ──────────────────────────────────────────────────────

const outputLines: string[] = [];
let jsonCalls: Record<string, unknown>[] = [];
let jsonMode = false;

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (text: string) => { outputLines.push(text); },
  outputJson: (data: Record<string, unknown>) => { jsonCalls.push(data); },
  isJsonMode: () => jsonMode,
  setJsonMode: vi.fn(),
}));

// ── Mock colors as identity functions ───────────────────────────────────

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
}));

// ── Mock node:fs/promises ───────────────────────────────────────────────

const mockAccess = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
}));

// ── Import after mocks ─────────────────────────────────────────────────

import { lessonsCommand } from '../../src/commands/lessons.js';

// ── Setup / teardown ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  outputLines.length = 0;
  jsonCalls = [];
  jsonMode = false;

  // Default: .planning/ exists
  mockAccess.mockResolvedValue(undefined);
  // Default: AGENTS.md exists
  mockCheckAgentsMdExists.mockResolvedValue(true);
  // Default: session returns lesson content
  mockSpawnAgentsMdSession.mockResolvedValue('## Lesson 1\nAlways validate inputs.');
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('lessonsCommand', () => {
  it('no .planning/ directory — shows helpful message and returns early', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    await lessonsCommand('/tmp/project');

    const joined = outputLines.join('\n');
    expect(joined).toContain('No .planning/ directory found');
    expect(joined).toContain('Run some builds first');
    // Should NOT have tried to spawn a session
    expect(mockSpawnAgentsMdSession).not.toHaveBeenCalled();
  });

  it('no .planning/ directory in JSON mode — outputs structured error', async () => {
    jsonMode = true;
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    await lessonsCommand('/tmp/project');

    expect(jsonCalls.length).toBe(1);
    expect(jsonCalls[0]).toMatchObject({
      lessons: null,
      error: 'No .planning/ directory found',
    });
    expect(mockSpawnAgentsMdSession).not.toHaveBeenCalled();
  });

  it('.planning/ exists, session succeeds — prints lesson candidates', async () => {
    mockSpawnAgentsMdSession.mockResolvedValue('## Lesson 1\nAlways validate inputs.');

    await lessonsCommand('/tmp/project');

    const joined = outputLines.join('\n');
    expect(joined).toContain('Lesson candidates');
    expect(joined).toContain('Always validate inputs');
    expect(mockSpawnAgentsMdSession).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'lessons',
        timeoutMs: 120_000,
      }),
    );
  });

  it('.planning/ exists, session returns null — prints failure message', async () => {
    mockSpawnAgentsMdSession.mockResolvedValue(null);

    await lessonsCommand('/tmp/project');

    const joined = outputLines.join('\n');
    expect(joined).toContain('failed or timed out');
  });

  it('.planning/ exists, session returns empty string — prints failure message', async () => {
    mockSpawnAgentsMdSession.mockResolvedValue('');

    await lessonsCommand('/tmp/project');

    const joined = outputLines.join('\n');
    expect(joined).toContain('failed or timed out');
  });

  it('JSON mode — calls outputJson with result', async () => {
    jsonMode = true;
    mockSpawnAgentsMdSession.mockResolvedValue('## Lesson: test input validation');

    await lessonsCommand('/tmp/project');

    expect(jsonCalls.length).toBe(1);
    expect(jsonCalls[0]).toMatchObject({
      lessons: '## Lesson: test input validation',
    });
  });

  it('JSON mode with null result — outputs null', async () => {
    jsonMode = true;
    mockSpawnAgentsMdSession.mockResolvedValue(null);

    await lessonsCommand('/tmp/project');

    expect(jsonCalls.length).toBe(1);
    expect(jsonCalls[0]).toMatchObject({
      lessons: null,
    });
  });

  it('--approve flag — prints not-yet-supported message', async () => {
    await lessonsCommand('/tmp/project', { approve: true });

    const joined = outputLines.join('\n');
    expect(joined).toContain('--approve flag not yet supported');
  });

  it('--approve flag in JSON mode — no message, normal session', async () => {
    jsonMode = true;
    await lessonsCommand('/tmp/project', { approve: true });

    // Should not emit human --approve message
    expect(outputLines.join('\n')).not.toContain('--approve');
  });

  it('no AGENTS.md — shows informational suggestion but continues', async () => {
    mockCheckAgentsMdExists.mockResolvedValue(false);

    await lessonsCommand('/tmp/project');

    const joined = outputLines.join('\n');
    expect(joined).toContain('No AGENTS.md found');
    expect(joined).toContain('pilot setup');
    // Should still spawn the session
    expect(mockSpawnAgentsMdSession).toHaveBeenCalled();
  });

  it('defaults to cwd when no project argument given', async () => {
    await lessonsCommand(undefined);

    // Should use process.cwd()
    expect(mockAccess).toHaveBeenCalledWith(expect.stringContaining(process.cwd()));
    expect(mockSpawnAgentsMdSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: process.cwd() }),
    );
  });
});
