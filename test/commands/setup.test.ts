/**
 * Tests for `pilot setup` — focused on the post-setup skill offer flow.
 *
 * Mocks core/setup.ts, core/default-skills.ts, core/db.ts, and output.ts
 * to verify branching logic without touching filesystem or subprocesses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock core/setup.ts ──────────────────────────────────────────────────

const mockSetupProject = vi.fn();
const mockVerifySetup = vi.fn();

vi.mock('../../src/core/setup.js', () => ({
  setupProject: (...args: unknown[]) => mockSetupProject(...args),
  verifySetup: (...args: unknown[]) => mockVerifySetup(...args),
}));

// ── Mock core/default-skills.ts ─────────────────────────────────────────

const mockRecommendDefaultSkills = vi.fn();
const mockBootstrapDefaultSkills = vi.fn();

vi.mock('../../src/core/default-skills.js', () => ({
  recommendDefaultSkills: (...args: unknown[]) => mockRecommendDefaultSkills(...args),
  bootstrapDefaultSkills: (...args: unknown[]) => mockBootstrapDefaultSkills(...args),
}));

// ── Mock output.ts ──────────────────────────────────────────────────────

const outputLines: string[] = [];
let jsonMode = false;

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (text: string) => { outputLines.push(text); },
  outputJson: vi.fn(),
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

// ── Mock db (for owner registration path) ───────────────────────────────

vi.mock('../../src/core/db.js', () => ({
  registerProject: vi.fn(),
  updateProjectOwner: vi.fn(),
  getProject: vi.fn(),
}));

// ── Mock node:readline for TTY prompt paths ─────────────────────────────

const mockReadlineQuestion = vi.fn((question: string, cb: (answer: string) => void) => {
  if (question.includes('Generate one?')) {
    cb('y');
    return;
  }
  cb('n');
});
const mockReadlineClose = vi.fn();

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockReadlineQuestion,
    close: mockReadlineClose,
  })),
}));

// ── Mock node:fs so existsSync returns true (skips config init trigger) ──

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: actual.readFileSync,
  };
});

// ── Mock agents-md (dynamic import from setup.ts) ──────────────────────

const mockCheckAgentsMdExists = vi.fn();
const mockSpawnAgentsMdSession = vi.fn();

vi.mock('../../src/core/agents-md.js', () => ({
  checkAgentsMdExists: (...args: unknown[]) => mockCheckAgentsMdExists(...args),
  spawnAgentsMdSession: (...args: unknown[]) => mockSpawnAgentsMdSession(...args),
}));

// ── Mock init command (dynamic import from setup.ts: import('./init.js')) ──

vi.mock('../../src/commands/init.js', () => ({
  initCommand: vi.fn().mockResolvedValue(undefined),
}));

// ── Import command after mocks ──────────────────────────────────────────

import { setupCommand } from '../../src/commands/setup.js';

// ── Setup/teardown ──────────────────────────────────────────────────────

let originalProcessExit: typeof process.exit;
let originalStdinIsTTY: boolean | undefined;
type StdinWithTTY = { isTTY?: boolean };

beforeEach(() => {
  outputLines.length = 0;
  jsonMode = false;
  vi.clearAllMocks();
  mockReadlineQuestion.mockClear();
  mockReadlineClose.mockClear();

  originalProcessExit = process.exit;
  process.exit = vi.fn(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as typeof process.exit);

  originalStdinIsTTY = process.stdin.isTTY;

  // Default: successful setup with no errors
  mockSetupProject.mockResolvedValue({
    created: ['opencode.json', '.opencode/'],
    skipped: [],
    errors: [],
  });

  // Default: some recommendations available
  mockRecommendDefaultSkills.mockReturnValue({
    skills: [
      { install: 'author/skill-1', categories: ['general'], tier: 1 },
      { install: 'author/skill-2', categories: ['general'], tier: 1 },
      { install: 'author/skill-3', categories: ['frontend'], tier: 2, stackKey: 'react' },
      { install: 'author/skill-4', categories: ['testing'], tier: 2, stackKey: 'testing' },
      { install: 'author/skill-5', categories: ['backend'], tier: 2, stackKey: 'hono' },
    ],
    detectedStack: {
      items: ['react', 'typescript', 'testing'],
      signals: { react: 'package.json dependency: react' },
    },
  });

  // Default: bootstrap succeeds
  mockBootstrapDefaultSkills.mockResolvedValue({
    attempted: 5,
    installed: 5,
    skipped: 0,
    failed: 0,
    tagged: 3,
    detectedStack: { items: ['react'], signals: {} },
    errors: [],
  });

  // Default: AGENTS.md exists (skip the prompt)
  mockCheckAgentsMdExists.mockResolvedValue(true);
  mockSpawnAgentsMdSession.mockResolvedValue(null);
});

afterEach(() => {
  process.exit = originalProcessExit;
  (process.stdin as StdinWithTTY).isTTY = originalStdinIsTTY;
});

// ── Tests: setup skill offer ────────────────────────────────────────────

describe('setup skill offer (removed — skills bootstrap no longer in setup)', () => {
  it('does NOT call recommendDefaultSkills after setup (bootstrap removed)', async () => {
    (process.stdin as StdinWithTTY).isTTY = false;

    await setupCommand('/tmp/my-project', {});

    // Setup no longer calls recommendDefaultSkills — skill management is separate
    expect(mockRecommendDefaultSkills).not.toHaveBeenCalled();
    expect(mockBootstrapDefaultSkills).not.toHaveBeenCalled();
  });

  it('skips skill offer when setup has errors', async () => {
    mockSetupProject.mockResolvedValue({
      created: ['opencode.json'],
      skipped: [],
      errors: ['Failed to create .opencode/'],
    });

    await expect(setupCommand('/tmp/my-project', {})).rejects.toThrow('process.exit(1)');
    expect(mockRecommendDefaultSkills).not.toHaveBeenCalled();
  });

  it('no skill recommendation or bootstrap output in non-TTY mode', async () => {
    (process.stdin as StdinWithTTY).isTTY = false;

    await setupCommand('/tmp/my-project', {});

    const joined = outputLines.join('\n');
    expect(joined).not.toContain('pilot skills bootstrap');
    expect(joined).not.toContain('Detected stack:');
    expect(joined).not.toContain('recommended skills available');
    expect(mockBootstrapDefaultSkills).not.toHaveBeenCalled();
  });

  it('skips skill offer in verify mode', async () => {
    mockVerifySetup.mockResolvedValue({
      findings: [],
      passed: 3,
      failed: 0,
      warnings: 0,
    });

    await setupCommand('/tmp/my-project', { verify: true });

    expect(mockRecommendDefaultSkills).not.toHaveBeenCalled();
  });

  it('skips skill offer in JSON mode', async () => {
    jsonMode = true;

    await setupCommand('/tmp/my-project', {});

    expect(mockRecommendDefaultSkills).not.toHaveBeenCalled();
  });
});

// ── Tests: setup AGENTS.md prompt ───────────────────────────────────────

describe('setup AGENTS.md prompt', () => {
  it('when AGENTS.md exists, no AGENTS.md prompt shown', async () => {
    (process.stdin as StdinWithTTY).isTTY = false;
    mockCheckAgentsMdExists.mockResolvedValue(true);

    await setupCommand('/tmp/my-project', {});

    // Should NOT have spawned an AGENTS.md session
    expect(mockSpawnAgentsMdSession).not.toHaveBeenCalled();
    // No AGENTS.md prompt text
    const joined = outputLines.join('\n');
    expect(joined).not.toContain('No AGENTS.md found');
  });

  it('when AGENTS.md missing and non-TTY, shows hint without prompting', async () => {
    (process.stdin as StdinWithTTY).isTTY = false;
    mockCheckAgentsMdExists.mockResolvedValue(false);

    await setupCommand('/tmp/my-project', {});

    const joined = outputLines.join('\n');
    expect(joined).toContain('No AGENTS.md found');
    // Should NOT have tried to spawn (no TTY for prompt)
    expect(mockSpawnAgentsMdSession).not.toHaveBeenCalled();
  });

  it('in JSON mode, no AGENTS.md prompt shown', async () => {
    jsonMode = true;
    mockCheckAgentsMdExists.mockResolvedValue(false);

    await setupCommand('/tmp/my-project', {});

    // No AGENTS.md prompt in JSON mode
    expect(mockSpawnAgentsMdSession).not.toHaveBeenCalled();
    const joined = outputLines.join('\n');
    expect(joined).not.toContain('No AGENTS.md found');
  });

  it('when spawn fails, setup still succeeds', async () => {
    (process.stdin as StdinWithTTY).isTTY = false;
    // agents-md check throws to simulate import failure
    mockCheckAgentsMdExists.mockRejectedValue(new Error('Module load error'));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Should NOT throw — setup already succeeded
    await setupCommand('/tmp/my-project', {});
    expect(process.exit).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it('when AGENTS.md missing in TTY mode, invokes setup operation without legacy command args', async () => {
    (process.stdin as StdinWithTTY).isTTY = true;
    mockCheckAgentsMdExists.mockResolvedValue(false);
    mockSpawnAgentsMdSession.mockResolvedValue('Generated AGENTS.md content');
    mockRecommendDefaultSkills.mockReturnValue({
      skills: [],
      detectedStack: { items: [], signals: {} },
    });

    await setupCommand('/tmp/my-project', {});

    expect(mockSpawnAgentsMdSession).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'setup',
      }),
    );
    const sessionArg = mockSpawnAgentsMdSession.mock.calls[0]?.[0] as { command?: string };
    expect(sessionArg.command).toBeUndefined();
  });
});
