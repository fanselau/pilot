/**
 * Tests for `pilot doctor` — system health check, service unit validation,
 * and binary resolution.
 *
 * Focuses on the Phase 52 additions:
 *   - Service unit health check (valid, stale, missing)
 *   - opencode binary check using resolveOpencodeBinary
 *
 * Mocks: node:fs, execa, config, delegate (resolveOpencodeBinary), output, colors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

// ── Mock state ─────────────────────────────────────────────────────────────

let mockResolvedBinary = '/home/user/.opencode/bin/opencode';
let mockUnitContent: string | null = null; // null = file doesn't exist (ENOENT)
let mockAccessiblePaths: Set<string> = new Set();
const mockHomedir = '/home/testuser';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/core/delegate.js', () => ({
  resolveOpencodeBinary: () => mockResolvedBinary,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    accessSync: vi.fn((filePath: string, _mode?: number) => {
      if (mockAccessiblePaths.has(filePath)) return undefined;
      const err = new Error(`EACCES: permission denied, access '${filePath}'`);
      (err as NodeJS.ErrnoException).code = 'EACCES';
      throw err;
    }),
    constants: actual.constants,
    readFileSync: vi.fn((filePath: string, _encoding?: string) => {
      // Service unit file
      if (typeof filePath === 'string' && filePath.includes('pilot-runner.service')) {
        if (mockUnitContent === null) {
          const err = new Error('ENOENT: no such file or directory');
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        return mockUnitContent;
      }
      // Config file check
      if (typeof filePath === 'string' && filePath.includes('config.json')) {
        return '{}';
      }
      return actual.readFileSync(filePath, _encoding as BufferEncoding);
    }),
    statSync: vi.fn((filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('config.json')) {
        return { mode: 0o100600 };
      }
      return actual.statSync(filePath);
    }),
  };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => mockHomedir,
      freemem: () => 8 * 1024 * 1024 * 1024, // 8GB
      userInfo: () => ({ username: 'testuser' }),
    },
    homedir: () => mockHomedir,
    freemem: () => 8 * 1024 * 1024 * 1024,
    userInfo: () => ({ username: 'testuser' }),
  };
});

vi.mock('execa', () => ({
  execa: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  execaSync: vi.fn((_cmd: string, _args?: string[]) => {
    // which opencode
    if (_cmd === 'which' && _args?.[0] === 'opencode') {
      return { stdout: '/usr/bin/opencode', exitCode: 0 };
    }
    // mount
    if (_cmd === 'mount') {
      return { stdout: 'cgroup2 on /sys/fs/cgroup type cgroup2', exitCode: 0 };
    }
    // loginctl
    if (_cmd === 'loginctl') {
      return { stdout: 'Linger=yes', exitCode: 0 };
    }
    return { stdout: '', exitCode: 0 };
  }),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({
    pilotDir: '/home/testuser/.local/share/pilot',
    gsdDir: '/home/testuser/pilot-gsd',
    projectDir: '/home/testuser/projects/myapp',
    sessionMemoryMaxMb: 4096,
    reservedMemoryMb: 1024,
    memoryKillThresholdMb: 512,
  }),
}));

const mockOutputHuman = vi.fn();
const mockOutputJson = vi.fn();
let mockJsonMode = false;

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  isJsonMode: () => mockJsonMode,
}));

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
}));

// ── Import after mocks ────────────────────────────────────────────────────

import { doctorCommand } from '../../src/commands/doctor.js';

// ── Setup ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockResolvedBinary = '/home/user/.opencode/bin/opencode';
  mockUnitContent = null;
  mockAccessiblePaths = new Set();
  mockJsonMode = true; // Use JSON mode for structured assertions
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called');
  }) as never);
});

afterEach(() => {
  exitSpy.mockRestore();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function getChecks(): Array<{ name: string; status: string; detail: string }> {
  if (mockOutputJson.mock.calls.length === 0) return [];
  const output = mockOutputJson.mock.calls[0][0] as { checks: Array<{ name: string; status: string; detail: string }> };
  return output.checks;
}

function findCheck(name: string): { name: string; status: string; detail: string } | undefined {
  return getChecks().find(c => c.name === name);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('doctor system health — service unit check', () => {
  it('reports pass when service file exists with valid ExecStart binary', async () => {
    const binaryPath = '/home/testuser/.bun/bin/pilot';
    mockUnitContent = `[Service]\nExecStart=/usr/bin/env bun ${binaryPath} run --daemon\n`;
    mockAccessiblePaths.add(binaryPath);

    // gsdDir and pilotDir accessible
    mockAccessiblePaths.add('/home/testuser/pilot-gsd');
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const check = findCheck('service unit');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
    expect(check!.detail).toContain(binaryPath);
  });

  it('reports fail when ExecStart points to missing binary', async () => {
    const stalePath = '/home/testuser/.bun/bin/pilot-old';
    mockUnitContent = `[Service]\nExecStart=/usr/bin/env bun ${stalePath} run --daemon\n`;
    // stalePath NOT in mockAccessiblePaths — accessSync will throw

    mockAccessiblePaths.add('/home/testuser/pilot-gsd');
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    try {
      await doctorCommand(undefined, false, true);
    } catch {
      // process.exit(1) throws in our mock — expected for fail checks
    }

    const check = findCheck('service unit');
    expect(check).toBeDefined();
    expect(check!.status).toBe('fail');
    expect(check!.detail).toContain('missing binary');
    expect(check!.detail).toContain('pilot service install');
  });

  it('reports warn when service file does not exist', async () => {
    mockUnitContent = null; // ENOENT

    mockAccessiblePaths.add('/home/testuser/pilot-gsd');
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const check = findCheck('service unit');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warn');
    expect(check!.detail).toContain('Service not installed');
  });
});

describe('doctor system health — opencode binary check', () => {
  it('reports pass with resolved binary path (not hardcoded)', async () => {
    mockResolvedBinary = '/usr/local/bin/opencode';

    mockAccessiblePaths.add('/home/testuser/pilot-gsd');
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const check = findCheck('opencode binary');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
    expect(check!.detail).toBe('/usr/local/bin/opencode');
  });

  it('reports fail when resolveOpencodeBinary returns bare "opencode" and which fails', async () => {
    mockResolvedBinary = 'opencode';

    // Override execaSync to make which fail
    const { execaSync } = await import('execa');
    (execaSync as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, _args?: string[]) => {
      if (_cmd === 'which' && _args?.[0] === 'opencode') {
        return { stdout: '', exitCode: 1 };
      }
      if (_cmd === 'mount') {
        return { stdout: 'cgroup2 on /sys/fs/cgroup type cgroup2', exitCode: 0 };
      }
      if (_cmd === 'loginctl') {
        return { stdout: 'Linger=yes', exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    });

    mockAccessiblePaths.add('/home/testuser/pilot-gsd');
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    try {
      await doctorCommand(undefined, false, true);
    } catch {
      // process.exit(1) throws in our mock — expected for fail checks
    }

    const check = findCheck('opencode binary');
    expect(check).toBeDefined();
    expect(check!.status).toBe('fail');
    expect(check!.detail).toContain('Not found');
  });
});
