/**
 * Tests for doctor's AGENTS.md health check behavior.
 *
 * Focuses exclusively on the AGENTS.md integration in `pilot doctor --project`.
 * Uses JSON mode + extensive filesystem/execa mocks to isolate AGENTS.md checks
 * from other doctor checks (config, commands, planning, git).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock agents-md (dynamic import from doctor.ts) ──────────────────────

const mockCheckAgentsMdExists = vi.fn();
const mockSpawnAgentsMdSession = vi.fn();

vi.mock('../../src/core/agents-md.js', () => ({
  checkAgentsMdExists: (...args: unknown[]) => mockCheckAgentsMdExists(...args),
  spawnAgentsMdSession: (...args: unknown[]) => mockSpawnAgentsMdSession(...args),
}));

// ── Mock output.ts ──────────────────────────────────────────────────────

let jsonOutput: Record<string, unknown> | null = null;
const outputLines: string[] = [];

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (text: string) => { outputLines.push(text); },
  outputJson: (data: Record<string, unknown>) => { jsonOutput = data; },
  isJsonMode: () => true, // Always use JSON mode for structured assertion
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

// ── Mock config ─────────────────────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({
    pilotDir: '/tmp/.pilot',
    sessionMemoryMaxMb: 4096,
    reservedMemoryMb: 2048,
    memoryKillThresholdMb: 512,
  }),
}));

// ── Mock node:fs (sync) — prevent real filesystem access ────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    accessSync: vi.fn(() => { /* pass */ }),
    readFileSync: vi.fn(() => '{}'),
    statSync: vi.fn(() => ({ mode: 0o600, isDirectory: () => false })),
  };
});

// ── Mock node:fs/promises — make all file checks succeed by default ─────

const mockFsAccess = vi.fn();
const mockFsReadFile = vi.fn();
const mockFsReaddir = vi.fn();
const mockFsLstat = vi.fn();
const mockFsStat = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockFsAccess(...args),
  readFile: (...args: unknown[]) => mockFsReadFile(...args),
  readdir: (...args: unknown[]) => mockFsReaddir(...args),
  lstat: (...args: unknown[]) => mockFsLstat(...args),
  stat: (...args: unknown[]) => mockFsStat(...args),
}));

// ── Mock execa — prevent real subprocess spawning ───────────────────────

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '0', stderr: '' }),
  execaSync: vi.fn(() => ({ exitCode: 0, stdout: 'cgroup2', stderr: '' })),
}));

// ── Import after mocks ─────────────────────────────────────────────────

import { doctorCommand } from '../../src/commands/doctor.js';

// ── Setup / teardown ────────────────────────────────────────────────────

let originalProcessExit: typeof process.exit;

beforeEach(() => {
  vi.clearAllMocks();
  jsonOutput = null;
  outputLines.length = 0;

  originalProcessExit = process.exit;
  process.exit = vi.fn(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as typeof process.exit);

  // Default: all file/dir checks pass (don't fail on unrelated doctor checks)
  mockFsAccess.mockResolvedValue(undefined);
  mockFsReadFile.mockResolvedValue('{}');
  mockFsReaddir.mockResolvedValue([]);
  mockFsLstat.mockResolvedValue({ isDirectory: () => false, isSymbolicLink: () => false });
  mockFsStat.mockResolvedValue({ isDirectory: () => true });

  // Default agents-md behavior
  mockCheckAgentsMdExists.mockResolvedValue(true);
  mockSpawnAgentsMdSession.mockResolvedValue('All references valid');
});

afterEach(() => {
  process.exit = originalProcessExit;
});

// ── Helpers ─────────────────────────────────────────────────────────────

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

function getChecks(): Check[] {
  if (!jsonOutput || !Array.isArray((jsonOutput as { checks: Check[] }).checks)) return [];
  return (jsonOutput as { checks: Check[] }).checks;
}

function findCheck(name: string): Check | undefined {
  return getChecks().find(c => c.name.includes(name));
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('doctor AGENTS.md check (project mode)', () => {
  it('shows warn when AGENTS.md does not exist', async () => {
    mockCheckAgentsMdExists.mockResolvedValue(false);

    await doctorCommand('/tmp/project', false, false);

    const check = findCheck('AGENTS.md');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warn');
    expect(check!.detail).toContain('Not found');
  });

  it('shows pass when AGENTS.md exists and AI check succeeds (no drift)', async () => {
    mockCheckAgentsMdExists.mockResolvedValue(true);
    mockSpawnAgentsMdSession.mockResolvedValue('All references are valid and up to date.');

    await doctorCommand('/tmp/project', false, false);

    const check = findCheck('AGENTS.md health');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
    expect(check!.detail).toContain('All references are valid');
  });

  it('shows warn when AGENTS.md exists and AI check detects drift', async () => {
    mockCheckAgentsMdExists.mockResolvedValue(true);
    mockSpawnAgentsMdSession.mockResolvedValue('Found stale references to deleted files in AGENTS.md');

    await doctorCommand('/tmp/project', false, false);

    const check = findCheck('AGENTS.md health');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warn');
    expect(check!.detail).toContain('stale');
  });

  it('shows warn when AI check times out (returns null)', async () => {
    mockCheckAgentsMdExists.mockResolvedValue(true);
    mockSpawnAgentsMdSession.mockResolvedValue(null);

    await doctorCommand('/tmp/project', false, false);

    const check = findCheck('AGENTS.md health');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warn');
    expect(check!.detail).toContain('timed out');
  });

  it('--skip-agents skips the AGENTS.md check entirely', async () => {
    await doctorCommand('/tmp/project', false, true);

    const check = findCheck('AGENTS.md');
    expect(check).toBeUndefined();
    const healthCheck = findCheck('AGENTS.md health');
    expect(healthCheck).toBeUndefined();

    // Should not have called agents-md functions at all
    expect(mockCheckAgentsMdExists).not.toHaveBeenCalled();
    expect(mockSpawnAgentsMdSession).not.toHaveBeenCalled();
  });

  it('AI check failure does not crash doctor', async () => {
    mockCheckAgentsMdExists.mockResolvedValue(true);
    mockSpawnAgentsMdSession.mockRejectedValue(new Error('Session spawn error'));

    await doctorCommand('/tmp/project', false, false);

    const check = findCheck('AGENTS.md health');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warn');
    expect(check!.detail).toContain('failed');
  });

  it('import failure does not crash doctor', async () => {
    // Simulate agents-md module completely unavailable
    mockCheckAgentsMdExists.mockRejectedValue(new Error('Cannot find module'));

    await doctorCommand('/tmp/project', false, false);

    const check = findCheck('AGENTS.md');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warn');
    // Doctor should still complete with remaining checks
    expect(getChecks().length).toBeGreaterThan(0);
  });
});
