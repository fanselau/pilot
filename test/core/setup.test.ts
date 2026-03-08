/**
 * Tests for core/setup.ts — setupProject() command layout validation
 * and path normalization regression tests.
 *
 * Uses real temp directories with mock getConfig() pointing gsdDir
 * at a controlled test directory to exercise gsd-delegate.md validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
  it('resolveProjectDir returns absolute path as-is (including trailing slash)', () => {
    // resolveProjectDir does NOT strip trailing slashes for absolute paths —
    // it returns them as-is. Normalization happens in setupProject via path.resolve().
    const result = resolveProjectDir('/tmp/myproject/');
    expect(result).toBe('/tmp/myproject/');
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
