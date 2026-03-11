/**
 * Tests for `pilot service install` — service unit generation.
 *
 * Verifies:
 *   - ExecStart uses /usr/bin/env bun (not absolute interpreter)
 *   - Pilot binary path is realpathSync'd
 *   - PATH is minimal and stable
 *   - Service subcommands pass through to systemctl
 *
 * Mocks: node:fs, node:fs/promises, execa, config, output, colors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock state ─────────────────────────────────────────────────────────────

let capturedUnitContent = '';
let mockRealpathResult = '/home/user/.bun/bin/pilot';
const mockExecaCalls: Array<{ cmd: string; args: string[] }> = [];
const mockHomedir = '/home/testuser';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    realpathSync: vi.fn((_p: string) => mockRealpathResult),
  };
});

vi.mock('node:fs/promises', async () => {
  return {
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async (_path: string, content: string) => {
      capturedUnitContent = content;
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
    },
    homedir: () => mockHomedir,
  };
});

vi.mock('execa', () => ({
  execa: vi.fn(async (cmd: string, args: string[]) => {
    mockExecaCalls.push({ cmd, args });
    return { stdout: '', stderr: '', exitCode: 0 };
  }),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({
    projectDir: '/home/testuser/projects/myapp',
  }),
}));

const mockOutputHuman = vi.fn();
vi.mock('../../src/util/output.js', () => ({
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  outputJson: vi.fn(),
  isJsonMode: () => false,
}));

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
}));

// ── Import after mocks ────────────────────────────────────────────────────

import { serviceCommand } from '../../src/commands/service.js';

// ── Setup ──────────────────────────────────────────────────────────────────

let originalArgv1: string;

beforeEach(() => {
  vi.clearAllMocks();
  capturedUnitContent = '';
  mockExecaCalls.length = 0;
  mockRealpathResult = '/home/testuser/.bun/bin/pilot';
  originalArgv1 = process.argv[1];
  process.argv[1] = '/home/testuser/.bun/bin/pilot';
});

afterEach(() => {
  process.argv[1] = originalArgv1;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('serviceCommand install', () => {
  it('ExecStart uses /usr/bin/env bun, not absolute interpreter path', async () => {
    await serviceCommand('install');

    expect(capturedUnitContent).toContain('ExecStart=/usr/bin/env bun');
    // Must NOT contain an absolute path to bun executable like /home/.../bun
    expect(capturedUnitContent).not.toMatch(/ExecStart=\/home\/.*\/bun\s/);
    expect(capturedUnitContent).not.toMatch(/ExecStart=\/usr\/local\/bin\/bun\s/);
  });

  it('pilot binary path is realpathSync\'d, not raw argv', async () => {
    mockRealpathResult = '/opt/pilot/bin/pilot';
    process.argv[1] = '/usr/local/bin/pilot';

    await serviceCommand('install');

    // The unit file should use the realpathSync result, not raw argv
    expect(capturedUnitContent).toContain('/opt/pilot/bin/pilot');
    expect(capturedUnitContent).not.toContain('/usr/local/bin/pilot run --daemon');
  });

  it('PATH is minimal and stable, not full current PATH', async () => {
    // Set a current PATH that should NOT leak entirely into the unit
    const savePath = process.env.PATH;
    process.env.PATH = '/long/custom/path:/another/weird/path:/usr/local/bin';

    await serviceCommand('install');

    process.env.PATH = savePath;

    // Should contain standard stable paths
    expect(capturedUnitContent).toContain(`${mockHomedir}/.local/bin`);
    expect(capturedUnitContent).toContain(`${mockHomedir}/.bun/bin`);
    expect(capturedUnitContent).toContain(`${mockHomedir}/.opencode/bin`);
    expect(capturedUnitContent).toContain('/usr/local/bin');
    expect(capturedUnitContent).toContain('/usr/bin');

    // Should NOT contain random custom paths
    expect(capturedUnitContent).not.toContain('/long/custom/path');
    expect(capturedUnitContent).not.toContain('/another/weird/path');
  });

  it('includes fnm/nvm/cargo paths from current PATH if present', async () => {
    const savePath = process.env.PATH;
    process.env.PATH = '/home/testuser/.nvm/versions/node/v20/bin:/home/testuser/.cargo/bin:/usr/bin';

    await serviceCommand('install');

    process.env.PATH = savePath;

    expect(capturedUnitContent).toContain('.nvm/versions');
    expect(capturedUnitContent).toContain('.cargo/bin');
  });

  it('unit file contains proper systemd sections', async () => {
    await serviceCommand('install');

    expect(capturedUnitContent).toContain('[Unit]');
    expect(capturedUnitContent).toContain('[Service]');
    expect(capturedUnitContent).toContain('[Install]');
    expect(capturedUnitContent).toContain('Type=simple');
    expect(capturedUnitContent).toContain('Restart=always');
  });

  it('calls systemctl daemon-reload and enable after writing unit', async () => {
    await serviceCommand('install');

    expect(mockExecaCalls).toEqual(
      expect.arrayContaining([
        { cmd: 'systemctl', args: ['--user', 'daemon-reload'] },
        { cmd: 'systemctl', args: ['--user', 'enable', 'pilot-runner'] },
      ]),
    );
  });
});

describe('serviceCommand subcommands', () => {
  it('start calls systemctl --user start pilot-runner', async () => {
    await serviceCommand('start');
    expect(mockExecaCalls).toContainEqual({ cmd: 'systemctl', args: ['--user', 'start', 'pilot-runner'] });
  });

  it('stop calls systemctl --user stop pilot-runner', async () => {
    await serviceCommand('stop');
    expect(mockExecaCalls).toContainEqual({ cmd: 'systemctl', args: ['--user', 'stop', 'pilot-runner'] });
  });

  it('status calls systemctl --user status pilot-runner', async () => {
    await serviceCommand('status');
    expect(mockExecaCalls).toContainEqual({ cmd: 'systemctl', args: ['--user', 'status', 'pilot-runner'] });
  });
});
