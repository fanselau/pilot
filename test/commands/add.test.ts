/**
 * Tests for `pilot add` command — scope detection, file/dir handling, --as override.
 *
 * Mocks: db.ts (addJob), output.ts (outputJson/outputHuman/isJsonMode),
 *        node:fs (accessSync/statSync/readFileSync).
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the db module
vi.mock('../../src/core/db.js', () => ({
  addJob: vi.fn((_proj: string, _scope: string, _desc: string, _reqPath?: string, _profile?: string, _provider?: string) => ({
    id: 'ab12',
    project: _proj,
    scope: _scope,
    description: _desc,
    requirementPath: _reqPath ?? null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    createdAt: '2026-03-02T10:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: _profile ?? 'balanced',
    providerMode: _provider ?? 'claude-only',
  })),
}));

// Mock output utilities
let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  isJsonMode: () => mockJsonMode,
}));

// Mock colors to identity functions for test readability
vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
}));

// Control projectDir via PILOT_PROJECT_DIR env var.
// resolveProjectDir() calls getConfig() internally which reads env vars, so
// setting process.env.PILOT_PROJECT_DIR gives us full control without mocking
// module internals. Tests update `mockedProjectDir` and sync it to the env var.
let mockedProjectDir = '/tmp/pilot-test-projects';

function syncProjectDirEnv(): void {
  process.env.PILOT_PROJECT_DIR = mockedProjectDir;
}

vi.mock('../../src/core/config.js', async (importOriginal) => {
  // Keep the real resolveProjectDir (it reads PILOT_PROJECT_DIR via getConfig).
  // Only provide the mock getConfig for callers in add.ts that use getConfig()
  // directly — after the refactor there are none, but keep for safety.
  const original = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...original,
    // resolveProjectDir is the real implementation from original (spread above)
  };
});

import { addCommand, detectScope } from '../../src/commands/add.js';
import { addJob } from '../../src/core/db.js';
import type { JobScope } from '../../src/core/types.js';

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  // Sync the env var so resolveProjectDir uses the current mockedProjectDir
  syncProjectDirEnv();
});

// ── detectScope ────────────────────────────────────────────────────────────

describe('detectScope', () => {
  it('returns quick for a plain string requirement', () => {
    // A non-existent path = short string → quick
    const scope = detectScope('fix the navbar z-index');
    expect(scope).toBe('quick');
  });

  it('returns phase for an existing file path', () => {
    // Use a file that definitely exists
    const scope = detectScope('package.json');
    expect(scope).toBe('phase');
  });

  it('returns milestone for an existing directory path', () => {
    // Use a directory that definitely exists
    const scope = detectScope('src');
    expect(scope).toBe('milestone');
  });
});

// ── addCommand ─────────────────────────────────────────────────────────────

describe('addCommand', () => {
  // Create a configured my-project dir for existing tests
  let existingTestsDir: string;

  beforeAll(() => {
    existingTestsDir = mkdtempSync(path.join(tmpdir(), 'pilot-add-existing-'));
    mockedProjectDir = existingTestsDir;
    syncProjectDirEnv();

    // Set up my-project with proper structure
    const projectDir = path.join(existingTestsDir, 'my-project');
    mkdirSync(path.join(projectDir, '.opencode'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');
  });

  afterAll(() => {
    rmSync(existingTestsDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  it('queues a string requirement as quick scope', async () => {
    await addCommand('my-project', 'fix the navbar', {});

    // addJob receives the resolved absolute path (not the raw shorthand name)
    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'quick', 'fix the navbar', undefined, undefined, undefined,
    );
    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Queued');
    expect(output).toContain('my-project');
  });

  it('--as overrides auto-detected scope', async () => {
    await addCommand('my-project', 'fix the navbar', { as: 'phase' as JobScope });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'phase', 'fix the navbar', undefined, undefined, undefined,
    );
  });

  it('detects file path and uses phase scope with title extraction', async () => {
    // package.json exists and is a file; title won't be found via markdown heading
    // so it falls back to basename
    await addCommand('my-project', 'package.json', {});

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'),
      'phase',
      expect.any(String),
      expect.stringContaining('package.json'),
      undefined,
      undefined,
    );
  });

  it('quick scope with file passes full content as description', async () => {
    // Force quick scope via --as, but provide a file that exists
    await addCommand('my-project', 'package.json', { as: 'quick' as JobScope });

    // When scope=quick and file exists, the full content is passed as description
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const description = callArgs[2];
    // Should contain actual file content (package.json has at least a name field)
    expect(description.length).toBeGreaterThan(10);
    expect(description).toContain('"name"');
  });

  it('outputs JSON when json mode is active', async () => {
    mockJsonMode = true;

    await addCommand('my-project', 'fix stuff', {});

    expect(mockOutputJson).toHaveBeenCalledWith({ job: expect.objectContaining({ id: 'ab12' }) });
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('truncates long descriptions in human output', async () => {
    const longDesc = 'a'.repeat(100);
    await addCommand('my-project', longDesc, {});

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('…');
  });

  it('passes profile and provider to addJob', async () => {
    await addCommand('my-project', 'fix stuff', { profile: 'budget', provider: 'hybrid' });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'quick', 'fix stuff', undefined, 'budget', 'hybrid',
    );
  });

  it('defaults work without --profile and --provider flags', async () => {
    await addCommand('my-project', 'fix stuff', {});

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'quick', 'fix stuff', undefined, undefined, undefined,
    );
  });

  it('exits 2 for invalid profile', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('my-project', 'fix stuff', { profile: 'garbage' })).rejects.toThrow('exit');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid profile'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits 2 for invalid provider', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('my-project', 'fix stuff', { provider: 'bogus' })).rejects.toThrow('exit');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid provider'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('shows non-default profile/provider tag in human output', async () => {
    await addCommand('my-project', 'fix stuff', { profile: 'budget', provider: 'hybrid' });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('[budget/hybrid]');
  });

  it('does not show tag when profile/provider are defaults', async () => {
    await addCommand('my-project', 'fix stuff', { profile: 'balanced', provider: 'claude-only' });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).not.toContain('[');
  });
});

// ── project setup validation ───────────────────────────────────────────────

describe('project setup validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pilot-setup-validation-'));
    mockedProjectDir = tmpDir;
    syncProjectDirEnv();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  it('rejects project without .opencode/command/', async () => {
    // Create a bare project dir — no .opencode/
    const projectDir = path.join(tmpDir, 'test-proj');
    mkdirSync(projectDir, { recursive: true });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('test-proj', 'fix stuff', {})).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('not configured');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('rejects project with broken .opencode/command/ symlink', async () => {
    // Create project dir with .opencode/ dir, but broken symlink for command/
    const projectDir = path.join(tmpDir, 'test-proj');
    mkdirSync(path.join(projectDir, '.opencode'), { recursive: true });
    // Create a symlink pointing to a nonexistent target
    symlinkSync('/nonexistent/path/that/does/not/exist', path.join(projectDir, '.opencode', 'command'));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('test-proj', 'fix stuff', {})).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('broken setup');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('accepts properly configured project', async () => {
    // Create project dir with real .opencode/command/ and .opencode/agents/ directories
    const projectDir = path.join(tmpDir, 'test-proj');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');

    // Should not exit — addJob should be called with the resolved absolute path
    await addCommand('test-proj', 'fix stuff', {});

    expect(addJob).toHaveBeenCalledWith(
      path.join(tmpDir, 'test-proj'), 'quick', 'fix stuff', undefined, undefined, undefined,
    );
  });

  it('--force bypasses setup check', async () => {
    // Bare project dir — no .opencode/ at all
    const projectDir = path.join(tmpDir, 'test-proj');
    mkdirSync(projectDir, { recursive: true });
    // Add opencode.json so we don't get the missing-config warning
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');

    // With --force, should bypass validation and call addJob with resolved path
    await addCommand('test-proj', 'fix stuff', { force: true });

    expect(addJob).toHaveBeenCalledWith(
      path.join(tmpDir, 'test-proj'), 'quick', 'fix stuff', undefined, undefined, undefined,
    );
  });

  it('warns but does not block when opencode.json is missing', async () => {
    // Create project dir with .opencode/command/ and .opencode/agents/ but no opencode.json
    const projectDir = path.join(tmpDir, 'test-proj');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    // No opencode.json

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Should NOT exit — addJob should be called despite warning
    await addCommand('test-proj', 'fix stuff', {});

    expect(addJob).toHaveBeenCalledWith(
      path.join(tmpDir, 'test-proj'), 'quick', 'fix stuff', undefined, undefined, undefined,
    );
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('opencode.json');

    stderrSpy.mockRestore();
  });

  it('resolves "." to cwd when --force is set', async () => {
    // "." resolves to process.cwd() — no project dir creation needed with --force
    await addCommand('.', 'fix stuff', { force: true });

    expect(addJob).toHaveBeenCalledWith(
      process.cwd(), 'quick', 'fix stuff', undefined, undefined, undefined,
    );
  });

  it('uses absolute path as-is when --force is set', async () => {
    const absPath = '/tmp/some-abs-path';

    await addCommand(absPath, 'fix stuff', { force: true });

    expect(addJob).toHaveBeenCalledWith(
      absPath, 'quick', 'fix stuff', undefined, undefined, undefined,
    );
  });
});
