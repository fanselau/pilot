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

// Shell exposure mock state
let mockShellExposureResult: {
  findings: Array<{ tool: string; status: string; stablePath: string; resolvedTarget: string; detail: string }>;
  fnmNote: string;
} = {
  findings: [
    { tool: 'pilot', status: 'pass', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'OK' },
    { tool: 'node', status: 'pass', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/home/testuser/.local/share/fnm/node-versions/v22.0.0/installation/bin/node', detail: 'OK' },
    { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/home/testuser/.local/share/fnm/node-versions/v22.0.0/installation/bin/pnpm', detail: 'OK' },
  ],
  fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
};
let mockEnsureShellExposureResult: typeof mockShellExposureResult = {
  findings: [
    { tool: 'pilot', status: 'created', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'Created: ...' },
    { tool: 'node', status: 'created', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/usr/bin/node', detail: 'Created: ...' },
    { tool: 'pnpm', status: 'created', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'Created: ...' },
  ],
  fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
};
let mockShellExposureError: Error | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/core/delegate.js', () => ({
  resolveOpencodeBinary: () => mockResolvedBinary,
}));

vi.mock('../../src/core/shell-exposure.js', () => ({
  verifyShellExposure: async () => {
    if (mockShellExposureError) throw mockShellExposureError;
    return mockShellExposureResult;
  },
  ensureShellExposure: async () => {
    if (mockShellExposureError) throw mockShellExposureError;
    return mockEnsureShellExposureResult;
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    default: actual,
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
    existsSync: actual.existsSync,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
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

// Computed once: the path doctor.ts uses for the get-shit-done-cc binary check.
// doctor.ts: path.resolve(import.meta.dirname, '..', '..') + '/node_modules/.bin/get-shit-done-cc'
// In test builds, import.meta.dirname is the src/commands directory.
// We add this to mockAccessiblePaths by default so the check passes unless explicitly removed.
const GSD_BIN_PATH = new URL('../../node_modules/.bin/get-shit-done-cc', import.meta.url).pathname;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockResolvedBinary = '/home/user/.opencode/bin/opencode';
  mockUnitContent = null;
  mockAccessiblePaths = new Set();
  // Always make the get-shit-done-cc binary accessible by default
  mockAccessiblePaths.add(GSD_BIN_PATH);
  mockJsonMode = true; // Use JSON mode for structured assertions
  mockShellExposureError = null;
  mockShellExposureResult = {
    findings: [
      { tool: 'pilot', status: 'pass', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'OK' },
      { tool: 'node', status: 'pass', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/home/testuser/.local/share/fnm/node-versions/v22.0.0/installation/bin/node', detail: 'OK' },
      { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/home/testuser/.local/share/fnm/node-versions/v22.0.0/installation/bin/pnpm', detail: 'OK' },
    ],
    fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
  };
  mockEnsureShellExposureResult = {
    findings: [
      { tool: 'pilot', status: 'created', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'Created: ...' },
      { tool: 'node', status: 'created', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/usr/bin/node', detail: 'Created: ...' },
      { tool: 'pnpm', status: 'created', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'Created: ...' },
    ],
    fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
  };
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

    // pilotDir accessible; get-shit-done-cc binary accessible
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

// ── get-shit-done-cc binary check ─────────────────────────────────────────

describe('doctor system health — get-shit-done-cc binary check', () => {
  it('reports pass when get-shit-done-cc binary is accessible', async () => {
    // GSD_BIN_PATH is already in mockAccessiblePaths (added in beforeEach)
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const check = findCheck('get-shit-done-cc');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
    expect(check!.detail).toContain('get-shit-done-cc');
  });

  it('reports fail when get-shit-done-cc binary is not accessible', async () => {
    // Remove the gsd binary from accessible paths
    mockAccessiblePaths.delete(GSD_BIN_PATH);
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    try {
      await doctorCommand(undefined, false, true);
    } catch {
      // process.exit(1) throws in our mock — expected for fail checks
    }

    const check = findCheck('get-shit-done-cc');
    expect(check).toBeDefined();
    expect(check!.status).toBe('fail');
    expect(check!.detail).toContain('bun install');
  });
});

// ── Shell exposure health checks ──────────────────────────────────────────

describe('doctor system health — shell exposure checks', () => {
  it('includes shell: pilot, shell: node, shell: pnpm, shell: fnm checks when all pass', async () => {
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const pilotCheck = findCheck('shell: pilot');
    expect(pilotCheck).toBeDefined();
    expect(pilotCheck!.status).toBe('pass');
    expect(pilotCheck!.detail).toContain('/home/testuser/.local/bin/pilot');
    expect(pilotCheck!.detail).toContain('/home/testuser/dev/pilot/dist/index.js');

    const nodeCheck = findCheck('shell: node');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('pass');
    expect(nodeCheck!.detail).toContain('/home/testuser/.local/bin/node');

    const pnpmCheck = findCheck('shell: pnpm');
    expect(pnpmCheck).toBeDefined();
    expect(pnpmCheck!.status).toBe('pass');
    expect(pnpmCheck!.detail).toContain('/home/testuser/.local/bin/pnpm');

    const fnmCheck = findCheck('shell: fnm');
    expect(fnmCheck).toBeDefined();
    expect(fnmCheck!.status).toBe('pass');
    expect(fnmCheck!.detail).toContain('fnm is not exposed');
  });

  it('shows warn with "pilot doctor --fix" hint when a tool fails', async () => {
    mockShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'pass', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'OK' },
        { tool: 'node', status: 'fail', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '', detail: 'Not found — run: pilot doctor --fix' },
        { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'OK' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };

    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const nodeCheck = findCheck('shell: node');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('warn');
    expect(nodeCheck!.detail).toContain('pilot doctor --fix');
  });

  it('shows warn for all tools when multiple fail', async () => {
    mockShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'fail', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '', detail: 'Broken symlink — target does not exist' },
        { tool: 'node', status: 'fail', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '', detail: 'Not found' },
        { tool: 'pnpm', status: 'fail', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '', detail: 'Not found' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };

    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const pilotCheck = findCheck('shell: pilot');
    expect(pilotCheck!.status).toBe('warn');
    expect(pilotCheck!.detail).toContain('pilot doctor --fix');

    const nodeCheck = findCheck('shell: node');
    expect(nodeCheck!.status).toBe('warn');

    const pnpmCheck = findCheck('shell: pnpm');
    expect(pnpmCheck!.status).toBe('warn');

    // fnm note still shown
    const fnmCheck = findCheck('shell: fnm');
    expect(fnmCheck).toBeDefined();
    expect(fnmCheck!.status).toBe('pass');
  });

  it('shows single warn when shell-exposure module throws', async () => {
    mockShellExposureError = new Error('Module not available');

    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    // Individual shell: checks should NOT be present
    expect(findCheck('shell: pilot')).toBeUndefined();
    expect(findCheck('shell: node')).toBeUndefined();
    expect(findCheck('shell: pnpm')).toBeUndefined();
    expect(findCheck('shell: fnm')).toBeUndefined();

    // Instead we get a single fallback warn
    const exposureCheck = findCheck('shell exposure');
    expect(exposureCheck).toBeDefined();
    expect(exposureCheck!.status).toBe('warn');
    expect(exposureCheck!.detail).toContain('Check failed');
    expect(exposureCheck!.detail).toContain('Module not available');
  });

  it('fnm exclusion note is surfaced as pass with correct message', async () => {
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true);

    const fnmCheck = findCheck('shell: fnm');
    expect(fnmCheck).toBeDefined();
    expect(fnmCheck!.status).toBe('pass');
    expect(fnmCheck!.detail).toBe('fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.');
  });
});

// ── --fix shell exposure repair ───────────────────────────────────────────

describe('doctor system health — --fix shell exposure repair', () => {
  it('calls ensureShellExposure and shows Fixed status when --fix and issues exist', async () => {
    // Verify returns failures
    mockShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'fail', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '', detail: 'Not found' },
        { tool: 'node', status: 'fail', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '', detail: 'Not found' },
        { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'OK' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };
    // Ensure returns created
    mockEnsureShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'created', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'Created' },
        { tool: 'node', status: 'created', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/usr/bin/node', detail: 'Created' },
        { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'Already correct' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true, true); // fix=true

    const pilotCheck = findCheck('shell: pilot');
    expect(pilotCheck).toBeDefined();
    expect(pilotCheck!.status).toBe('pass');
    expect(pilotCheck!.detail).toContain('Fixed');

    const nodeCheck = findCheck('shell: node');
    expect(nodeCheck!.status).toBe('pass');
    expect(nodeCheck!.detail).toContain('Fixed');

    // pnpm was already pass in ensure result
    const pnpmCheck = findCheck('shell: pnpm');
    expect(pnpmCheck!.status).toBe('pass');
    expect(pnpmCheck!.detail).toContain('OK');
  });

  it('does not call ensureShellExposure when --fix but no issues exist', async () => {
    // All pass — no fix needed
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true, true); // fix=true

    // Should show normal pass status (not Fixed)
    const pilotCheck = findCheck('shell: pilot');
    expect(pilotCheck!.status).toBe('pass');
    expect(pilotCheck!.detail).not.toContain('Fixed');
  });

  it('shows warn when --fix but ensureShellExposure still fails for a tool', async () => {
    mockShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'fail', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '', detail: 'Not found' },
        { tool: 'node', status: 'pass', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/usr/bin/node', detail: 'OK' },
        { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'OK' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };
    mockEnsureShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'fail', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '', detail: 'Cannot resolve pilot' },
        { tool: 'node', status: 'pass', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/usr/bin/node', detail: 'Already correct' },
        { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'Already correct' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true, true);

    const pilotCheck = findCheck('shell: pilot');
    expect(pilotCheck!.status).toBe('warn');
    expect(pilotCheck!.detail).toContain('Failed to fix');
  });

  it('without --fix, shows "pilot doctor --fix" as repair hint', async () => {
    mockShellExposureResult = {
      findings: [
        { tool: 'pilot', status: 'pass', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/home/testuser/dev/pilot/dist/index.js', detail: 'OK' },
        { tool: 'node', status: 'fail', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '', detail: 'Not found — run: pilot doctor --fix' },
        { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'OK' },
      ],
      fnmNote: 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.',
    };
    mockAccessiblePaths.add('/home/testuser/.local/share/pilot');

    await doctorCommand(undefined, false, true); // no fix

    const nodeCheck = findCheck('shell: node');
    expect(nodeCheck!.status).toBe('warn');
    expect(nodeCheck!.detail).toContain('pilot doctor --fix');
  });
});
