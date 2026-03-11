/**
 * Tests for core/setup.ts — setupProject() command layout validation
 * and path normalization regression tests.
 *
 * Uses real temp directories with mock getConfig() pointing gsdDir
 * at a controlled test directory to exercise gsd-delegate.md validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readlink, symlink, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Mock config ─────────────────────────────────────────────────────────

let mockGsdDir: string;

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    getConfig: () => ({
      pilotDir: '/tmp/pilot-test-pilotdir',
      pilotDbPath: '/tmp/pilot-test-pilotdir/pilot.db',
      projectDir: '/tmp/pilot-test-projectdir',
      gsdDir: mockGsdDir,
      maxParallel: 1,
      queueGraceSeconds: 0,
      sessionMemoryMaxMb: 8192,
      reservedMemoryMb: 4096,
      memoryKillThresholdMb: 2048,
      logLevel: 'INFO',
      noColor: false,
      telegramBotToken: null,
      telegramChatId: null,
      openclawHooksUrl: null,
      openclawHooksToken: null,
      defaultNotifySessionKey: null,
    }),
  };
});

// ── Mock execa (used by setupProject for git init) ──────────────────────

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

// ── Mock shell-exposure (best-effort in setup — don't pollute test env) ──

vi.mock('../../src/core/shell-exposure.js', () => ({
  ensureShellExposure: vi.fn(async () => ({
    findings: [
      { tool: 'pilot', status: 'pass', stablePath: '/home/testuser/.local/bin/pilot', resolvedTarget: '/usr/bin/pilot', detail: 'OK' },
      { tool: 'node', status: 'pass', stablePath: '/home/testuser/.local/bin/node', resolvedTarget: '/usr/bin/node', detail: 'OK' },
      { tool: 'pnpm', status: 'pass', stablePath: '/home/testuser/.local/bin/pnpm', resolvedTarget: '/usr/bin/pnpm', detail: 'OK' },
    ],
    fnmNote: 'fnm is not exposed in plain shells.',
  })),
}));

// Must import AFTER vi.mock
import { setupProject } from '../../src/core/setup.js';
import { resolveProjectDir } from '../../src/core/config.js';

// ── Tests: command layout validation ────────────────────────────────────

describe('setupProject — command layout validation', () => {
  let tmpDir: string;
  let gsdDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-test-'));
    gsdDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-gsd-'));
    mockGsdDir = gsdDir;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(gsdDir, { recursive: true, force: true });
  });

  it('returns error when gsd-delegate.md is missing from commands dir', async () => {
    // Create a gsdDir with commands/ directory but WITHOUT gsd-delegate.md
    const commandsDir = path.join(gsdDir, 'commands');
    await mkdir(commandsDir, { recursive: true });
    await mkdir(path.join(gsdDir, 'agents'), { recursive: true });
    await mkdir(path.join(gsdDir, 'get-shit-done'), { recursive: true });

    const result = await setupProject(tmpDir);

    // Should have an error about missing gsd-delegate.md
    expect(result.errors.some(e => e.includes('gsd-delegate.md') || e.includes('GSD delegate command not found'))).toBe(true);
  });

  it('succeeds and reports verification when gsd-delegate.md exists', async () => {
    // Create a gsdDir with correct flat layout including gsd-delegate.md
    const commandsDir = path.join(gsdDir, 'commands');
    await mkdir(commandsDir, { recursive: true });
    await mkdir(path.join(gsdDir, 'agents'), { recursive: true });
    await mkdir(path.join(gsdDir, 'get-shit-done'), { recursive: true });
    await writeFile(path.join(commandsDir, 'gsd-delegate.md'), '# gsd-delegate\n', 'utf8');

    const result = await setupProject(tmpDir);

    // Should have NO errors about gsd-delegate
    expect(result.errors.some(e => e.includes('gsd-delegate'))).toBe(false);
    // Should include a verification message
    expect(result.created.some(c => c.includes('Verified GSD command layout'))).toBe(true);
  });

  it('stops setup early when gsd-delegate.md is missing (no opencode.json created)', async () => {
    // Create a gsdDir with commands/ directory but WITHOUT gsd-delegate.md
    const commandsDir = path.join(gsdDir, 'commands');
    await mkdir(commandsDir, { recursive: true });
    await mkdir(path.join(gsdDir, 'agents'), { recursive: true });
    await mkdir(path.join(gsdDir, 'get-shit-done'), { recursive: true });

    const result = await setupProject(tmpDir);

    // The function should return early with errors — no opencode.json should be created
    expect(result.errors.length).toBeGreaterThan(0);
    // opencode.json should NOT be in created list (setup returns early after delegate check fails)
    expect(result.created.some(c => c === 'opencode.json')).toBe(false);
  });
});

// ── Tests: path normalization — trailing slash stripping ────────────────

describe('path normalization — trailing slash stripping', () => {
  it('resolveProjectDir strips trailing slash from absolute path', () => {
    // resolveProjectDir normalizes absolute paths via path.resolve(),
    // which strips trailing slashes — consistent with setupProject behavior.
    const result = resolveProjectDir('/tmp/myproject/');
    expect(result).toBe('/tmp/myproject');
    expect(result.endsWith('/')).toBe(false);
  });

  it('path.resolve strips trailing slash (Node built-in behavior)', () => {
    // This is the behavior setupProject relies on at line 62: path.resolve(dir)
    expect(path.resolve('/tmp/myproject/')).toBe('/tmp/myproject');
    expect(path.resolve('/tmp/myproject')).toBe('/tmp/myproject');
  });

  it('setupProject normalizes dir with trailing slash via path.resolve', async () => {
    // Create a gsdDir with correct layout
    const gsdDir2 = await mkdtemp(path.join(os.tmpdir(), 'pilot-gsd2-'));
    mockGsdDir = gsdDir2;
    const commandsDir = path.join(gsdDir2, 'commands');
    await mkdir(commandsDir, { recursive: true });
    await mkdir(path.join(gsdDir2, 'agents'), { recursive: true });
    await mkdir(path.join(gsdDir2, 'get-shit-done'), { recursive: true });
    await writeFile(path.join(commandsDir, 'gsd-delegate.md'), '# gsd-delegate\n', 'utf8');

    const tmpDir2 = await mkdtemp(path.join(os.tmpdir(), 'pilot-test2-'));

    // Pass directory with trailing slash — setupProject uses path.resolve(dir) which strips it
    const result = await setupProject(tmpDir2 + '/');

    // Should succeed — path.resolve in setupProject strips trailing slash
    expect(result.errors.length).toBe(0);

    await rm(tmpDir2, { recursive: true, force: true });
    await rm(gsdDir2, { recursive: true, force: true });
  });
});

// ── Tests: setupProject — refresh mode ──────────────────────────────────

describe('setupProject — refresh mode', () => {
  let tmpDir: string;
  let gsdDir: string;
  let oldGsdDir: string;

  /**
   * Helper: create a valid gsdDir with commands/agents/get-shit-done + gsd-delegate.md
   */
  async function createValidGsdDir(dir: string): Promise<void> {
    const commandsDir = path.join(dir, 'commands');
    await mkdir(commandsDir, { recursive: true });
    await mkdir(path.join(dir, 'agents'), { recursive: true });
    await mkdir(path.join(dir, 'get-shit-done'), { recursive: true });
    await writeFile(path.join(commandsDir, 'gsd-delegate.md'), '# gsd-delegate\n', 'utf8');
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-refresh-'));
    gsdDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-gsd-new-'));
    oldGsdDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-gsd-old-'));
    await createValidGsdDir(gsdDir);
    await createValidGsdDir(oldGsdDir);
    mockGsdDir = gsdDir;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(gsdDir, { recursive: true, force: true });
    await rm(oldGsdDir, { recursive: true, force: true });
  });

  it('refresh re-creates symlinks pointing to current gsdDir', async () => {
    // Set up project with symlinks pointing to OLD gsdDir
    mockGsdDir = oldGsdDir;
    const initialResult = await setupProject(tmpDir);
    expect(initialResult.errors).toHaveLength(0);

    // Verify symlinks point to OLD gsdDir
    const commandLink = path.join(tmpDir, '.opencode', 'command');
    const oldTarget = await readlink(commandLink);
    expect(oldTarget).toContain(oldGsdDir);

    // Now refresh with NEW gsdDir
    mockGsdDir = gsdDir;
    const refreshResult = await setupProject(tmpDir, { refresh: true });
    expect(refreshResult.errors).toHaveLength(0);

    // Verify symlinks now point to NEW gsdDir
    const newTarget = await readlink(commandLink);
    expect(newTarget).toContain(gsdDir);
    expect(newTarget).not.toContain(oldGsdDir);

    // Result should contain "Refreshed" entries
    expect(refreshResult.created.some(c => c.includes('Refreshed'))).toBe(true);
  });

  it('refresh merges missing fields into existing opencode.json', async () => {
    // First setup to create initial files
    const initialResult = await setupProject(tmpDir);
    expect(initialResult.errors).toHaveLength(0);

    // Overwrite opencode.json with custom content (missing permission fields)
    const configPath = path.join(tmpDir, 'opencode.json');
    await writeFile(configPath, JSON.stringify({ custom: 'value' }, null, 2) + '\n', 'utf8');

    // Refresh — should merge template fields into existing config
    const refreshResult = await setupProject(tmpDir, { refresh: true });
    expect(refreshResult.errors).toHaveLength(0);

    // Read opencode.json and verify merge
    const content = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    // User value preserved
    expect(content.custom).toBe('value');
    // Template fields added
    const perm = content.permission as Record<string, unknown>;
    expect(perm).toBeDefined();
    const readPerm = perm.read as Record<string, unknown>;
    expect(readPerm['**']).toBe('allow');

    // Result should report merge
    expect(refreshResult.created.some(c => c.includes('Merged'))).toBe(true);
  });

  it('refresh with force overwrites opencode.json entirely', async () => {
    // First setup
    const initialResult = await setupProject(tmpDir);
    expect(initialResult.errors).toHaveLength(0);

    // Add custom values to opencode.json
    const configPath = path.join(tmpDir, 'opencode.json');
    await writeFile(configPath, JSON.stringify({ custom: 'value', permission: { read: { '**': 'allow' } } }, null, 2) + '\n', 'utf8');

    // Refresh with force — should overwrite entirely
    const refreshResult = await setupProject(tmpDir, { refresh: true, force: true });
    expect(refreshResult.errors).toHaveLength(0);

    // Read opencode.json — should match template exactly, no 'custom' key
    const content = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    expect(content).not.toHaveProperty('custom');
    expect(content).toHaveProperty('permission');

    // Result should report force-overwrite
    expect(refreshResult.created.some(c => c.includes('force-overwritten'))).toBe(true);
  });

  it('refresh skips real directories (not symlinks) — no data loss', async () => {
    // First setup
    const initialResult = await setupProject(tmpDir);
    expect(initialResult.errors).toHaveLength(0);

    // Replace symlink with a real directory
    const commandLink = path.join(tmpDir, '.opencode', 'command');
    // Remove the symlink and create a real directory with a file in it
    const { unlink: unlinkFn } = await import('node:fs/promises');
    await unlinkFn(commandLink);
    await mkdir(commandLink, { recursive: true });
    await writeFile(path.join(commandLink, 'user-data.txt'), 'important data', 'utf8');

    // Refresh — should NOT delete the real directory
    const refreshResult = await setupProject(tmpDir, { refresh: true });

    // The real directory should still exist with its data
    const stats = await lstat(commandLink);
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
    const userData = await readFile(path.join(commandLink, 'user-data.txt'), 'utf8');
    expect(userData).toBe('important data');

    // Result should contain a skip message about data loss
    expect(refreshResult.skipped.some(s => s.includes('data loss') || s.includes('real directory'))).toBe(true);
  });

  it('without refresh, behavior unchanged — symlinks are skipped', async () => {
    // First setup
    const initialResult = await setupProject(tmpDir);
    expect(initialResult.errors).toHaveLength(0);
    expect(initialResult.created.some(c => c.includes('.opencode/command/'))).toBe(true);

    // Second setup WITHOUT refresh — symlinks should be skipped (not re-created)
    const secondResult = await setupProject(tmpDir);
    expect(secondResult.errors).toHaveLength(0);

    // Symlinks should be reported as skipped (already exists)
    expect(secondResult.skipped.some(s => s.includes('already exists'))).toBe(true);

    // No "Refreshed" entries should appear
    expect(secondResult.created.some(c => c.includes('Refreshed'))).toBe(false);

    // Symlinks should still point to original target
    const commandLink = path.join(tmpDir, '.opencode', 'command');
    const target = await readlink(commandLink);
    expect(target).toContain(gsdDir);
  });
});
