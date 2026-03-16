/**
 * Tests for core/setup.ts — upstream installer-based setup behavior.
 *
 * Tests use real temp directories with mocked execa to simulate the
 * get-shit-done-cc installer. Covers: fresh install, refresh, migration
 * cleanup, no-package.json skip, installer failure, installer timeout,
 * and verifySetup with real directories.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink, lstat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ── Mock execa ──────────────────────────────────────────────────────────────
// Default: installer succeeds, git init succeeds

const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

// ── Mock shell-exposure (best-effort in setup — don't pollute test env) ──

vi.mock('../../src/core/shell-exposure.js', () => ({
  ensureShellExposure: vi.fn(async () => ({
    findings: [
      { tool: 'pilot', status: 'pass', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/usr/bin/pilot', detail: 'OK' },
    ],
    fnmNote: 'fnm is not exposed in plain shells.',
  })),
}));

// Must import AFTER vi.mock
import { setupProject, verifySetup } from '../../src/core/setup.js';
import { resolveProjectDir } from '../../src/core/config.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create the sentinel files that the installer would normally create.
 * Used to simulate a successful installer run.
 */
async function createInstallerSentinels(projectDir: string): Promise<void> {
  const opencodeDir = path.join(projectDir, '.opencode');
  await mkdir(path.join(opencodeDir, 'command'), { recursive: true });
  await mkdir(path.join(opencodeDir, 'agents'), { recursive: true });
  await mkdir(path.join(opencodeDir, 'get-shit-done', 'bin'), { recursive: true });
  await writeFile(path.join(opencodeDir, 'command', 'gsd-help.md'), '# GSD Help\n', 'utf8');
  await writeFile(path.join(opencodeDir, 'get-shit-done', 'bin', 'gsd-tools.cjs'), '// tools\n', 'utf8');
}

/**
 * Default execa mock implementation that simulates installer + git success.
 * Installer side-effect: creates sentinel files in cwd.
 */
function makeSuccessfulExecaMock(extraSentinels?: (cwd: string) => Promise<void>) {
  return vi.fn(async (cmd: string, args: string[], opts?: { cwd?: string }) => {
    if (args?.includes('--opencode')) {
      // GSD installer call — create sentinels in cwd
      const cwd = opts?.cwd ?? process.cwd();
      await createInstallerSentinels(cwd);
      if (extraSentinels) await extraSentinels(cwd);
      return { exitCode: 0, stdout: 'GSD installed', stderr: '' };
    }
    // git init
    return { exitCode: 0, stdout: '', stderr: '' };
  });
}

// ── Tests: Fresh setup (happy path) ────────────────────────────────────────

describe('setupProject — fresh setup (happy path)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-fresh-'));
    mockExeca.mockImplementation(makeSuccessfulExecaMock());
    // Create package.json so installer runs
    await writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs the GSD installer with --opencode --local flags', async () => {
    await setupProject(tmpDir);

    const execaCalls = mockExeca.mock.calls;
    const installerCall = execaCalls.find(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCall).toBeDefined();
    expect(installerCall![1]).toEqual(['--opencode', '--local']);
  });

  it('runs installer with correct cwd (project directory)', async () => {
    await setupProject(tmpDir);

    const execaCalls = mockExeca.mock.calls;
    const installerCall = execaCalls.find(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCall).toBeDefined();
    const opts = installerCall![2] as { cwd?: string };
    expect(opts.cwd).toBe(tmpDir);
  });

  it('creates opencode.json with permissive permissions', async () => {
    const result = await setupProject(tmpDir);

    const configPath = path.join(tmpDir, 'opencode.json');
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.permission).toBeDefined();
    expect(result.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);
  });

  it('creates .gitignore with .opencode/ entry', async () => {
    await setupProject(tmpDir);

    const gitignorePath = path.join(tmpDir, '.gitignore');
    const content = await readFile(gitignorePath, 'utf8');
    expect(content).toContain('.opencode/');
  });

  it('inits git repository', async () => {
    await setupProject(tmpDir);

    const gitCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('init'));
    expect(gitCalls.length).toBeGreaterThan(0);
  });

  it('reports GSD installation in created list', async () => {
    const result = await setupProject(tmpDir);

    expect(result.created.some(c => c.includes('get-shit-done-cc'))).toBe(true);
  });
});

// ── Tests: Refresh mode ────────────────────────────────────────────────────

describe('setupProject — refresh mode', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-refresh-'));
    mockExeca.mockImplementation(makeSuccessfulExecaMock());
    await writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('re-runs installer even when .opencode/ already exists', async () => {
    // First setup
    await setupProject(tmpDir);
    const firstCallCount = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode')).length;
    expect(firstCallCount).toBe(1);

    // Refresh
    mockExeca.mockClear();
    mockExeca.mockImplementation(makeSuccessfulExecaMock());
    await setupProject(tmpDir, { refresh: true });

    const refreshCallCount = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode')).length;
    expect(refreshCallCount).toBe(1);
  });

  it('deep-merges missing fields into existing opencode.json', async () => {
    // First setup creates opencode.json
    await setupProject(tmpDir);

    // Overwrite opencode.json with custom content (missing permission fields)
    const configPath = path.join(tmpDir, 'opencode.json');
    await writeFile(configPath, JSON.stringify({ custom: 'value' }, null, 2) + '\n', 'utf8');

    mockExeca.mockClear();
    mockExeca.mockImplementation(makeSuccessfulExecaMock());

    const refreshResult = await setupProject(tmpDir, { refresh: true });
    expect(refreshResult.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);

    // Read opencode.json and verify merge
    const content = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    // User value preserved
    expect(content.custom).toBe('value');
    // Template fields added
    const perm = content.permission as Record<string, unknown>;
    expect(perm).toBeDefined();
    expect((perm.read as Record<string, string>)['**']).toBe('allow');

    expect(refreshResult.created.some(c => c.includes('Merged'))).toBe(true);
  });

  it('force-overwrites opencode.json when refresh + force', async () => {
    // First setup
    await setupProject(tmpDir);

    const configPath = path.join(tmpDir, 'opencode.json');
    await writeFile(configPath, JSON.stringify({ custom: 'value', permission: { read: { '**': 'allow' } } }, null, 2) + '\n', 'utf8');

    mockExeca.mockClear();
    mockExeca.mockImplementation(makeSuccessfulExecaMock());

    const refreshResult = await setupProject(tmpDir, { refresh: true, force: true });
    expect(refreshResult.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);

    const content = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    expect(content).not.toHaveProperty('custom');
    expect(content).toHaveProperty('permission');
    expect(refreshResult.created.some(c => c.includes('force-overwritten'))).toBe(true);
  });
});

// ── Tests: Autonomous .planning/config.json enforcement ────────────────────

describe('setupProject — autonomous planning config enforcement', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-planning-config-'));
    mockExeca.mockImplementation(makeSuccessfulExecaMock());
    await writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates .planning/config.json with required autonomous keys on fresh setup', async () => {
    const result = await setupProject(tmpDir);
    expect(result.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);

    const planningConfigPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(await readFile(planningConfigPath, 'utf8')) as Record<string, unknown>;
    const workflow = config.workflow as Record<string, unknown>;

    expect(config.mode).toBe('yolo');
    expect(config.model_profile).toBe('balanced');
    expect(workflow.auto_advance).toBe(true);
    expect(workflow.node_repair).toBe(true);
    expect(workflow.ui_safety_gate).toBe(false);
    expect(result.created.some(c => c.includes('.planning/config.json'))).toBe(true);
  });

  it('preserves non-critical custom planning keys during setup refresh', async () => {
    await mkdir(path.join(tmpDir, '.planning'), { recursive: true });
    await writeFile(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify(
        {
          custom_top_level: 'keep-me',
          planning: {
            custom_planning_key: 'keep-me-too',
          },
          workflow: {
            research: false,
            custom_workflow_key: 'keep-me-three',
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const result = await setupProject(tmpDir, { refresh: true });
    expect(result.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);

    const config = JSON.parse(await readFile(path.join(tmpDir, '.planning', 'config.json'), 'utf8')) as Record<string, unknown>;
    const planning = config.planning as Record<string, unknown>;
    const workflow = config.workflow as Record<string, unknown>;

    expect(config.custom_top_level).toBe('keep-me');
    expect(planning.custom_planning_key).toBe('keep-me-too');
    expect(workflow.custom_workflow_key).toBe('keep-me-three');
    expect(workflow.research).toBe(false);
  });

  it('repairs drifted PILOT_WINS keys back to safe values during setup', async () => {
    await mkdir(path.join(tmpDir, '.planning'), { recursive: true });
    await writeFile(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify(
        {
          mode: 'interactive',
          workflow: {
            auto_advance: false,
            node_repair: false,
            ui_safety_gate: true,
            custom_workflow_key: 'still-preserved',
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const result = await setupProject(tmpDir);
    expect(result.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);

    const config = JSON.parse(await readFile(path.join(tmpDir, '.planning', 'config.json'), 'utf8')) as Record<string, unknown>;
    const workflow = config.workflow as Record<string, unknown>;

    expect(config.mode).toBe('yolo');
    expect(workflow.auto_advance).toBe(true);
    expect(workflow.node_repair).toBe(true);
    expect(workflow.ui_safety_gate).toBe(false);
    expect(workflow.custom_workflow_key).toBe('still-preserved');
  });
});

// ── Tests: Migration cleanup ───────────────────────────────────────────────

describe('setupProject — migration cleanup', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-migrate-'));
    mockExeca.mockImplementation(makeSuccessfulExecaMock());
    await writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes old pilot-gsd symlinks in .opencode/ before running installer', async () => {
    // Create .opencode/ with old-style pilot-gsd directory symlinks
    const opencodeDir = path.join(tmpDir, '.opencode');
    await mkdir(opencodeDir, { recursive: true });

    // Create fake pilot-gsd target directories
    const fakePilotGsd = await mkdtemp(path.join(os.tmpdir(), 'fake-pilot-gsd-'));
    await mkdir(path.join(fakePilotGsd, 'commands'), { recursive: true });
    await mkdir(path.join(fakePilotGsd, 'agents'), { recursive: true });

    // Create symlinks pointing to pilot-gsd
    const commandLink = path.join(opencodeDir, 'command');
    const agentsLink = path.join(opencodeDir, 'agents');
    const gsdLink = path.join(opencodeDir, 'get-shit-done');

    // Create fake targets in pilot-gsd dir
    await mkdir(path.join(fakePilotGsd, 'get-shit-done'), { recursive: true });

    await symlink(path.join(fakePilotGsd, 'commands'), commandLink);
    await symlink(path.join(fakePilotGsd, 'agents'), agentsLink);
    await symlink(path.join(fakePilotGsd, 'get-shit-done'), gsdLink);

    // Verify symlinks exist before setup
    const commandStatBefore = await lstat(commandLink);
    expect(commandStatBefore.isSymbolicLink()).toBe(true);

    // Run setup — should remove the old pilot-gsd symlinks
    await setupProject(tmpDir);

    // After installer ran (mock created real dirs), verify pilot-gsd symlinks are gone
    // The installer mock creates real directories, replacing the symlinks
    // We verify setup reported the cleanup
    const result = await setupProject(tmpDir, { refresh: true });
    // Installer should have been able to run (no errors about symlinks blocking it)
    expect(result.errors.filter(e => e.includes('symlink'))).toHaveLength(0);

    await rm(fakePilotGsd, { recursive: true, force: true });
  });

  it('reports cleanup of old pilot-gsd symlinks in result.created', async () => {
    const opencodeDir = path.join(tmpDir, '.opencode');
    await mkdir(opencodeDir, { recursive: true });

    // Create a fake pilot-gsd-like target
    const fakeTarget = await mkdtemp(path.join(os.tmpdir(), 'fake-pilot-gsd-target-'));
    await mkdir(path.join(fakeTarget, 'commands'), { recursive: true });
    const commandLink = path.join(opencodeDir, 'command');
    await symlink(path.join(fakeTarget, 'commands'), commandLink);

    const result = await setupProject(tmpDir);

    // Should report removal of a legacy symlink in installer-owned paths
    expect(result.created.some(c => c.includes('Removed legacy symlink'))).toBe(true);

    await rm(fakeTarget, { recursive: true, force: true });
  });
});

// ── Tests: No package.json — GSD installation skipped ─────────────────────

describe('setupProject — no package.json', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-nopkg-'));
    mockExeca.mockImplementation(makeSuccessfulExecaMock());
    // Do NOT create package.json
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('skips GSD installation with warning when no package.json', async () => {
    const result = await setupProject(tmpDir);

    // Should have an error/warning about missing package.json
    expect(result.errors.some(e => e.includes('package.json') || e.includes('GSD installation'))).toBe(true);
  });

  it('installer is NOT called when no package.json', async () => {
    await setupProject(tmpDir);

    const installerCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('--opencode'));
    expect(installerCalls).toHaveLength(0);
  });

  it('still creates opencode.json even without package.json', async () => {
    const result = await setupProject(tmpDir);

    const configPath = path.join(tmpDir, 'opencode.json');
    // opencode.json should be created (setup continues even without installer)
    expect(result.created.some(c => c.includes('opencode.json'))).toBe(true);

    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.permission).toBeDefined();
  });

  it('still creates .gitignore even without package.json', async () => {
    await setupProject(tmpDir);

    const gitignorePath = path.join(tmpDir, '.gitignore');
    const content = await readFile(gitignorePath, 'utf8');
    expect(content).toContain('.opencode/');
  });

  it('still inits git even without package.json', async () => {
    await setupProject(tmpDir);

    const gitCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('init'));
    expect(gitCalls.length).toBeGreaterThan(0);
  });
});

// ── Tests: Installer failure ───────────────────────────────────────────────

describe('setupProject — installer failure', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-fail-'));
    // Create package.json
    await writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('surfaces installer error in result.errors when exitCode !== 0', async () => {
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('--opencode')) {
        return { exitCode: 1, stdout: '', stderr: 'Error: something broke' };
      }
      // git init
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await setupProject(tmpDir);

    expect(result.errors.some(e => e.includes('GSD installer failed') || e.includes('something broke'))).toBe(true);
  });

  it('continues setup (creates opencode.json) even when installer fails', async () => {
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('--opencode')) {
        return { exitCode: 1, stdout: '', stderr: 'Error: something broke' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await setupProject(tmpDir);

    // opencode.json should still be created
    expect(result.created.some(c => c.includes('opencode.json'))).toBe(true);
  });

  it('continues setup (inits git) even when installer fails', async () => {
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('--opencode')) {
        return { exitCode: 1, stdout: '', stderr: 'Error: something broke' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await setupProject(tmpDir);

    const gitCalls = mockExeca.mock.calls.filter(([, args]) => Array.isArray(args) && args.includes('init'));
    expect(gitCalls.length).toBeGreaterThan(0);
  });
});

// ── Tests: Installer timeout ───────────────────────────────────────────────

describe('setupProject — installer timeout', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-timeout-'));
    await writeFile(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('surfaces timeout error in result.errors', async () => {
    // With reject: false, execa returns an error result (non-zero exitCode) rather than throwing.
    // We simulate this by returning exitCode: null (what execa does on timeout with reject: false)
    // which satisfies the exitCode !== 0 check.
    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      if (Array.isArray(args) && args.includes('--opencode')) {
        // Simulate timeout: exitCode is null, stderr has timeout message
        return { exitCode: null, stdout: '', stderr: 'Command timed out after 60000 milliseconds' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await setupProject(tmpDir);

    // exitCode !== 0 (null !== 0) triggers the error path
    expect(result.errors.some(e => e.includes('GSD installer failed') || e.includes('timed out'))).toBe(true);
  });
});

// ── Tests: verifySetup ─────────────────────────────────────────────────────

describe('verifySetup', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-verify-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('passes when project has real directories (not symlinks)', async () => {
    // Create a properly set up project with real directories
    const opencodeDir = path.join(tmpDir, '.opencode');
    await mkdir(path.join(opencodeDir, 'command'), { recursive: true });
    await mkdir(path.join(opencodeDir, 'agents'), { recursive: true });
    await mkdir(path.join(opencodeDir, 'get-shit-done'), { recursive: true });
    await writeFile(path.join(opencodeDir, 'command', 'gsd-help.md'), '# GSD\n', 'utf8');
    await writeFile(path.join(tmpDir, 'opencode.json'), JSON.stringify({ permission: {} }), 'utf8');

    const result = await verifySetup(tmpDir);

    // Config directory should pass
    expect(result.findings.some(f => f.label === 'Config directory' && f.status === 'pass')).toBe(true);
    // gsd-help.md should pass
    expect(result.findings.some(f => f.label === 'gsd-help.md' && f.status === 'pass')).toBe(true);
  });

  it('checks gsd-help.md sentinel for upstream installer confirmation', async () => {
    const opencodeDir = path.join(tmpDir, '.opencode');
    await mkdir(path.join(opencodeDir, 'command'), { recursive: true });
    await mkdir(path.join(opencodeDir, 'agents'), { recursive: true });
    await mkdir(path.join(opencodeDir, 'get-shit-done'), { recursive: true });
    await writeFile(path.join(tmpDir, 'opencode.json'), JSON.stringify({ permission: {} }), 'utf8');
    // Note: NO gsd-help.md

    const result = await verifySetup(tmpDir);

    const helpCheck = result.findings.find(f => f.label === 'gsd-help.md');
    expect(helpCheck).toBeDefined();
    expect(helpCheck!.status).toBe('fail');
    expect(helpCheck!.detail).toContain('not found');
  });

  it('fails when .opencode/ directory is missing entirely', async () => {
    await writeFile(path.join(tmpDir, 'opencode.json'), JSON.stringify({ permission: {} }), 'utf8');

    const result = await verifySetup(tmpDir);

    const configDirCheck = result.findings.find(f => f.label === 'Config directory');
    expect(configDirCheck).toBeDefined();
    expect(configDirCheck!.status).toBe('fail');
  });

  it('reports broken symlinks as fail (not just missing)', async () => {
    const opencodeDir = path.join(tmpDir, '.opencode');
    await mkdir(opencodeDir, { recursive: true });
    // Create a broken symlink for command/
    const commandLink = path.join(opencodeDir, 'command');
    await symlink('/nonexistent/path/to/pilot-gsd/commands', commandLink);

    await writeFile(path.join(tmpDir, 'opencode.json'), JSON.stringify({ permission: {} }), 'utf8');

    const result = await verifySetup(tmpDir);

    // .opencode/command should fail (broken symlink)
    const commandCheck = result.findings.find(f => f.label === '.opencode/command');
    expect(commandCheck).toBeDefined();
    expect(commandCheck!.status).toBe('fail');
    expect(commandCheck!.detail).toContain('broken symlink');
  });

  it('accepts symlinks that resolve correctly (valid symlink setup)', async () => {
    const opencodeDir = path.join(tmpDir, '.opencode');
    await mkdir(opencodeDir, { recursive: true });

    // Create real target directory
    const realCommandsDir = await mkdtemp(path.join(os.tmpdir(), 'real-commands-'));
    await writeFile(path.join(realCommandsDir, 'gsd-help.md'), '# GSD\n', 'utf8');

    // Create valid symlink pointing to real directory
    const commandLink = path.join(opencodeDir, 'command');
    await symlink(realCommandsDir, commandLink);

    await mkdir(path.join(opencodeDir, 'agents'), { recursive: true });
    await mkdir(path.join(opencodeDir, 'get-shit-done'), { recursive: true });
    await writeFile(path.join(tmpDir, 'opencode.json'), JSON.stringify({ permission: {} }), 'utf8');

    const result = await verifySetup(tmpDir);

    const commandCheck = result.findings.find(f => f.label === '.opencode/command');
    expect(commandCheck).toBeDefined();
    expect(commandCheck!.status).toBe('pass');

    await rm(realCommandsDir, { recursive: true, force: true });
  });

  it('failed count reflects actual failures', async () => {
    // Empty directory — nothing set up
    const result = await verifySetup(tmpDir);

    expect(result.failed).toBeGreaterThan(0);
    expect(result.passed).toBeLessThan(result.failed + result.passed);
  });
});

// ── Tests: path normalization ──────────────────────────────────────────────

describe('path normalization — trailing slash stripping', () => {
  it('resolveProjectDir strips trailing slash from absolute path', () => {
    const result = resolveProjectDir('/tmp/myproject/');
    expect(result).toBe('/tmp/myproject');
    expect(result.endsWith('/')).toBe(false);
  });

  it('path.resolve strips trailing slash (Node built-in behavior)', () => {
    expect(path.resolve('/tmp/myproject/')).toBe('/tmp/myproject');
    expect(path.resolve('/tmp/myproject')).toBe('/tmp/myproject');
  });

  it('setupProject normalizes dir with trailing slash via path.resolve', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-setup-slash-'));
    await writeFile(path.join(testDir, 'package.json'), '{"name":"test"}', 'utf8');
    mockExeca.mockImplementation(makeSuccessfulExecaMock());

    // Pass directory with trailing slash
    const result = await setupProject(testDir + '/');

    // Should succeed (path.resolve in setupProject strips trailing slash)
    expect(result.errors.filter(e => !e.includes('Shell exposure'))).toHaveLength(0);

    await rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });
});
