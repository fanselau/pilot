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
  addJob: vi.fn((_proj: string, _scope: string, _desc: string, _reqPath?: string, _profile?: string, _provider?: string, _dependsOn?: string, _parentJobId?: string, _callbackSessionKey?: string, _callbackUrl?: string, _timeout?: number, _skipGracePeriod?: boolean, _notifyRoute?: unknown) => ({
    id: 'ab12',
    project: _proj,
    scope: _scope,
    description: _desc,
    requirementPath: _reqPath ?? null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-02T10:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 0,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: _profile ?? 'balanced',
    providerMode: _provider ?? 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: _callbackUrl ?? null,
    callbackSessionKey: _callbackSessionKey ?? null,
    notifyRoute: _notifyRoute ?? null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: _skipGracePeriod ?? false,
    retryBudget: 0,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
  })),
  bump: vi.fn(),
  findDuplicateJob: vi.fn(() => null),
  getProject: vi.fn(() => null),
  updateJobCategories: vi.fn(),
  getLatestFailedJob: vi.fn(() => null),
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

vi.mock('../../src/core/config.js', () => {
  // getConfig and resolveProjectDir are mocked to read from env vars dynamically,
  // so tests can control behavior via PILOT_PROJECT_DIR and PILOT_DEFAULT_NOTIFY.
  const getConfig = vi.fn(() => ({
    pilotDir: '/tmp/.pilot',
    pilotDbPath: '/tmp/.pilot/pilot.db',
    projectDir: process.env.PILOT_PROJECT_DIR ?? '/tmp/pilot-test-projects',
    stuckThreshold: 90,
    maxParallel: 1,
    pollInterval: 5,
    defaultTimeout: 60,
    sessionMemoryMaxMb: 8192,
    reservedMemoryMb: 4096,
    memoryKillThresholdMb: 2048,
    logLevel: 'INFO' as const,
    noColor: false,
    telegramBotToken: null,
    telegramChatId: null,
    openclawHooksUrl: null,
    openclawHooksToken: null,
    defaultNotifySessionKey: process.env.PILOT_DEFAULT_NOTIFY ?? null,
  }));

  const resolveProjectDir = vi.fn((project: string): string => {
    if (!project) return project;
    if (project.startsWith('/')) return project;
    if (project === '.' || project.startsWith('./') || project.startsWith('../')) {
      // Use require for path.resolve in the mock — bun supports this in factories
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('node:path').resolve(project);
    }
    const projectDir = process.env.PILOT_PROJECT_DIR ?? '/tmp/pilot-test-projects';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:path').join(projectDir, project);
  });

  const getConfigFileDefaults = vi.fn(() => ({
    modelProfile: 'balanced' as const,
    providerMode: 'claude-only' as const,
    scope: null,
  }));

  const loadConfigFile = vi.fn(() => ({}));
  const _resetConfigCache = vi.fn();

  return { getConfig, resolveProjectDir, getConfigFileDefaults, loadConfigFile, _resetConfigCache };
});

// Mock notify-backends registry — default: no enabled backends (existing tests unaffected)
const mockGetEnabledBackends = vi.fn((): string[] => []);
const mockGetBackendConfig = vi.fn((_kind: string): Record<string, unknown> => ({}));

vi.mock('../../src/core/notify-backends/registry.js', () => ({
  getEnabledBackends: () => mockGetEnabledBackends(),
  getBackendConfig: (kind: string) => mockGetBackendConfig(kind),
}));

import { addCommand, detectScope } from '../../src/commands/add.js';
import { addJob, bump, findDuplicateJob, getProject, updateJobCategories, getLatestFailedJob } from '../../src/core/db.js';
import { getConfigFileDefaults } from '../../src/core/config.js';
import type { JobScope } from '../../src/core/types.js';

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  // Reset findDuplicateJob to return null (no duplicate) so existing tests are unaffected
  vi.mocked(findDuplicateJob).mockReturnValue(null);
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

  it('returns phase for an existing directory path (milestone disabled — directories route to phase)', () => {
    // Use a directory that definitely exists — milestone is disabled, directories now route to phase
    const scope = detectScope('src');
    expect(scope).toBe('phase');
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
    await addCommand('my-project', 'fix the navbar', { noNotify: true, noCategories: true });

    // addJob receives the resolved absolute path (not the raw shorthand name)
    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'quick', 'fix the navbar', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
    expect(mockOutputHuman).toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Queued');
    expect(output).toContain('my-project');
  });

  it('--as overrides auto-detected scope', async () => {
    await addCommand('my-project', 'fix the navbar', { as: 'phase' as JobScope, noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'phase', 'fix the navbar', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
  });

  it('detects file path and uses phase scope with title extraction', async () => {
    // package.json exists and is a file; title won't be found via markdown heading
    // so it falls back to basename
    await addCommand('my-project', 'package.json', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'),
      'phase',
      expect.any(String),
      expect.stringContaining('package.json'),
      'balanced',
      'claude-only',
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      false,
      [],
    );
  });

  it('quick scope with file passes full content as description', async () => {
    // Force quick scope via --as, but provide a file that exists
    await addCommand('my-project', 'package.json', { as: 'quick' as JobScope, noNotify: true, noCategories: true });

    // When scope=quick and file exists, the full content is passed as description
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const description = callArgs[2];
    // Should contain actual file content (package.json has at least a name field)
    expect(description.length).toBeGreaterThan(10);
    expect(description).toContain('"name"');
  });

  it('outputs JSON when json mode is active', async () => {
    mockJsonMode = true;

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(mockOutputJson).toHaveBeenCalledWith({ job: expect.objectContaining({ id: 'ab12' }) });
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('truncates long descriptions in human output', async () => {
    const longDesc = 'a'.repeat(100);
    await addCommand('my-project', longDesc, { noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('…');
  });

  it('passes profile and provider to addJob', async () => {
    await addCommand('my-project', 'fix stuff', { profile: 'budget', provider: 'hybrid', noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'quick', 'fix stuff', undefined, 'budget', 'hybrid', undefined, undefined, undefined, undefined, 0, false, [],
    );
  });

  it('defaults work without --profile and --provider flags', async () => {
    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'), 'quick', 'fix stuff', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
  });

  it('shows default grace-window queue message', async () => {
    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Start mode: waits for queue grace window before launch.');
  });

  it('persists --start-immediately and prints speed-vs-safety copy', async () => {
    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true, startImmediately: true });

    expect(addJob).toHaveBeenCalledWith(
      expect.stringContaining('my-project'),
      'quick',
      'fix stuff',
      undefined,
      'balanced',
      'claude-only',
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      true,
      [],
    );

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('--start-immediately');
    expect(output).toContain('faster start, less review/cancel time');
  });

  // Retry-specific tests removed (--retries, --no-retry, retry budget)

  it('exits 2 for invalid profile', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('my-project', 'fix stuff', { profile: 'garbage', noNotify: true, noCategories: true })).rejects.toThrow('exit');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid profile'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits 2 for invalid provider', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('my-project', 'fix stuff', { provider: 'bogus', noNotify: true, noCategories: true })).rejects.toThrow('exit');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown provider'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('shows non-default profile/provider tag in human output', async () => {
    await addCommand('my-project', 'fix stuff', { profile: 'budget', provider: 'hybrid', noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('[budget/hybrid]');
  });

  it('does not show tag when profile/provider are defaults', async () => {
    await addCommand('my-project', 'fix stuff', { profile: 'balanced', provider: 'claude-only', noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).not.toContain('[');
  });

  it('parses valid comma-separated categories and stores them on the job', async () => {
    await addCommand('my-project', 'fix stuff', { categories: 'frontend, testing', noNotify: true });

    expect(updateJobCategories).toHaveBeenCalledWith('ab12', ['frontend', 'testing']);
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Categories: frontend, testing');
  });

  it('rejects empty categories payloads from --categories', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(addCommand('my-project', 'fix stuff', { categories: ',,,', noNotify: true })).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(addJob).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('--categories must include at least one category');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
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

    await expect(addCommand('test-proj', 'fix stuff', { noNotify: true, noCategories: true })).rejects.toThrow('exit');

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

    await expect(addCommand('test-proj', 'fix stuff', { noNotify: true, noCategories: true })).rejects.toThrow('exit');

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
    await addCommand('test-proj', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      path.join(tmpDir, 'test-proj'), 'quick', 'fix stuff', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
  });

  it('--force bypasses setup check', async () => {
    // Bare project dir — no .opencode/ at all
    const projectDir = path.join(tmpDir, 'test-proj');
    mkdirSync(projectDir, { recursive: true });
    // Add opencode.json so we don't get the missing-config warning
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');

    // With --force, should bypass validation and call addJob with resolved path
    await addCommand('test-proj', 'fix stuff', { force: true, noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      path.join(tmpDir, 'test-proj'), 'quick', 'fix stuff', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
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
    await addCommand('test-proj', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      path.join(tmpDir, 'test-proj'), 'quick', 'fix stuff', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('opencode.json');

    stderrSpy.mockRestore();
  });

  it('resolves "." to cwd when --force is set', async () => {
    // "." resolves to process.cwd() — no project dir creation needed with --force
    await addCommand('.', 'fix stuff', { force: true, noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      process.cwd(), 'quick', 'fix stuff', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
  });

  it('uses absolute path as-is when --force is set', async () => {
    const absPath = '/tmp/some-abs-path';

    await addCommand(absPath, 'fix stuff', { force: true, noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalledWith(
      absPath, 'quick', 'fix stuff', undefined, 'balanced', 'claude-only', undefined, undefined, undefined, undefined, 0, false, [],
    );
  });
});

// ── duplicate detection ────────────────────────────────────────────────────

describe('duplicate detection', () => {
  // Shared fake Job returned by findDuplicateJob mock
  const fakeJob = {
    id: 'dup1',
    project: '/some/project',
    scope: 'quick' as JobScope,
    description: 'fix stuff',
    requirementPath: null,
    status: 'pending' as const,
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-02T10:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 0,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced' as const,
    providerMode: 'claude-only' as const,
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 0,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    runtimeSkillSnapshot: null,
  };

  // Use the existingTestsDir-level setup but create a fresh configured project
  let dupTestsDir: string;

  beforeAll(() => {
    dupTestsDir = mkdtempSync(path.join(tmpdir(), 'pilot-add-dup-'));
    mockedProjectDir = dupTestsDir;
    syncProjectDirEnv();

    // Set up my-project with proper structure
    const projectDir = path.join(dupTestsDir, 'my-project');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');
  });

  afterAll(() => {
    rmSync(dupTestsDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  beforeEach(() => {
    mockedProjectDir = dupTestsDir;
    syncProjectDirEnv();
    // Reset to no-duplicate state before each test
    vi.mocked(findDuplicateJob).mockReturnValue(null);
  });

  it('skips addJob when duplicate pending job found', async () => {
    vi.mocked(findDuplicateJob).mockReturnValue({ ...fakeJob, status: 'pending' });

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).not.toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('⚠');
    expect(output).toContain('queued');
  });

  it('skips addJob when duplicate running job found', async () => {
    vi.mocked(findDuplicateJob).mockReturnValue({ ...fakeJob, status: 'running' });

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).not.toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('running');
  });

  it('skips addJob when recently completed duplicate exists', async () => {
    vi.mocked(findDuplicateJob).mockReturnValue({ ...fakeJob, status: 'completed' as const });

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).not.toHaveBeenCalled();
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('recently completed');
  });

  it('--force bypasses duplicate check', async () => {
    vi.mocked(findDuplicateJob).mockReturnValue(fakeJob);

    await addCommand('my-project', 'fix stuff', { force: true, noNotify: true, noCategories: true });

    expect(findDuplicateJob).not.toHaveBeenCalled();
    expect(addJob).toHaveBeenCalled();
  });

  it('proceeds when no duplicate found', async () => {
    vi.mocked(findDuplicateJob).mockReturnValue(null);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalled();
  });

  it('outputs JSON for duplicate in json mode', async () => {
    mockJsonMode = true;
    vi.mocked(findDuplicateJob).mockReturnValue(fakeJob);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(mockOutputJson).toHaveBeenCalledWith({
      duplicate: true,
      existingJob: expect.objectContaining({ id: 'dup1' }),
    });
    expect(addJob).not.toHaveBeenCalled();
  });
});

// ── notify flag validation (modular backend model) ─────────────────────────

describe('notify flag validation (modular backends)', () => {
  let notifyTestsDir: string;

  beforeAll(() => {
    notifyTestsDir = mkdtempSync(path.join(tmpdir(), 'pilot-add-notify-'));
    mockedProjectDir = notifyTestsDir;
    syncProjectDirEnv();

    // Set up my-project with proper structure
    const projectDir = path.join(notifyTestsDir, 'my-project');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');
  });

  afterAll(() => {
    rmSync(notifyTestsDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  beforeEach(() => {
    mockedProjectDir = notifyTestsDir;
    syncProjectDirEnv();
    vi.mocked(findDuplicateJob).mockReturnValue(null);
    vi.mocked(getProject).mockReturnValue(null);
    delete process.env.PILOT_DEFAULT_NOTIFY;
  });

  afterEach(() => {
    delete process.env.PILOT_DEFAULT_NOTIFY;
    vi.mocked(getProject).mockReturnValue(null);
  });

  it('succeeds without any notify flags (notify is optional)', async () => {
    await addCommand('my-project', 'fix stuff', { noCategories: true });

    expect(addJob).toHaveBeenCalled();
  });

  it('--no-notify stores empty notifyRoute array on the job', async () => {
    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12]; // 13th arg = notifyRoute
    expect(notifyRouteArg).toEqual([]);
  });

  it('--notify-kimaki stores kimaki route on the job', async () => {
    await addCommand('my-project', 'fix stuff', { notifyKimaki: 'ses_abc', noCategories: true });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12]; // 13th arg = notifyRoute
    expect(notifyRouteArg).toEqual([{ kind: 'kimaki', sessionId: 'ses_abc' }]);
  });

  it('--dry-run does not validate notify flags', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await addCommand('my-project', 'fix stuff', { dryRun: true, noCategories: true });

    // No exit(1/2) for missing notify
    const exitCalls = exitSpy.mock.calls.filter(([code]) => code === 1 || code === 2);
    expect(exitCalls).toHaveLength(0);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// NOTE: The old "project owner as fallback notify" and "optional notify behavior" test sections
// have been removed — they tested the legacy --notify/--owner notification model which was
// replaced by the modular backend system in Phase 101 Plans 02-03. The new notification model
// uses --notify-kimaki, --notify-webhook, --notify-telegram flags with per-backend enabled
// validation. Legacy --notify <value> still works for backward compat but is no longer the
// primary path. Tests for the new model are above.

// ── multi-backend notification flag combinations ───────────────────────────

describe('multi-backend notification flag combinations', () => {
  let multiBackendDir: string;

  beforeAll(() => {
    multiBackendDir = mkdtempSync(path.join(tmpdir(), 'pilot-add-multi-'));
    mockedProjectDir = multiBackendDir;
    syncProjectDirEnv();

    const projectDir = path.join(multiBackendDir, 'my-project');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');
  });

  afterAll(() => {
    rmSync(multiBackendDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  beforeEach(() => {
    mockedProjectDir = multiBackendDir;
    syncProjectDirEnv();
    vi.mocked(findDuplicateJob).mockReturnValue(null);
    vi.mocked(getProject).mockReturnValue(null);
    mockGetEnabledBackends.mockReturnValue([]);
    mockGetBackendConfig.mockReturnValue({});
    delete process.env.PILOT_DEFAULT_NOTIFY;
  });

  afterEach(() => {
    delete process.env.PILOT_DEFAULT_NOTIFY;
  });

  it('combines --notify-kimaki and --notify-webhook into NotifyRoute[]', async () => {
    await addCommand('my-project', 'fix stuff', {
      notifyKimaki: 'ses_123',
      notifyWebhook: 'https://example.com/hook',
      noCategories: true,
    });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12]; // 13th arg = notifyRoute
    expect(notifyRouteArg).toEqual(
      expect.arrayContaining([
        { kind: 'kimaki', sessionId: 'ses_123' },
        { kind: 'webhook', url: 'https://example.com/hook' },
      ]),
    );
    expect((notifyRouteArg as unknown[]).length).toBe(2);
  });

  it('combines --notify-kimaki, --notify-webhook, and --notify-telegram into 3-route array', async () => {
    await addCommand('my-project', 'fix stuff', {
      notifyKimaki: 'ses_456',
      notifyWebhook: 'https://hooks.example.com',
      notifyTelegram: 'chat_789',
      noCategories: true,
    });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12] as unknown[];
    expect(notifyRouteArg).toHaveLength(3);
    expect(notifyRouteArg).toEqual(
      expect.arrayContaining([
        { kind: 'kimaki', sessionId: 'ses_456' },
        { kind: 'webhook', url: 'https://hooks.example.com' },
        { kind: 'telegram', chatId: 'chat_789' },
      ]),
    );
  });

  it('--notify-kimaki with --notify-telegram produces 2-route array', async () => {
    await addCommand('my-project', 'fix stuff', {
      notifyKimaki: 'ses_abc',
      notifyTelegram: 'chat_def',
      noCategories: true,
    });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12] as unknown[];
    expect(notifyRouteArg).toHaveLength(2);
    expect(notifyRouteArg).toEqual(
      expect.arrayContaining([
        { kind: 'kimaki', sessionId: 'ses_abc' },
        { kind: 'telegram', chatId: 'chat_def' },
      ]),
    );
  });

  it('errors when enabled backend has no route and no default', async () => {
    // webhook is enabled but user provides no --notify-webhook and no config default
    mockGetEnabledBackends.mockReturnValue(['webhook']);
    mockGetBackendConfig.mockReturnValue({}); // no defaultUrl

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(
      addCommand('my-project', 'fix stuff', { noCategories: true }),
    ).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('webhook');
    expect(stderrOutput).toContain('Enabled notification backends require targets');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('uses project default route for enabled telegram backend when no flag given', async () => {
    mockGetEnabledBackends.mockReturnValue(['telegram']);
    mockGetBackendConfig.mockReturnValue({ defaultChatId: 'default_chat_999' });

    await addCommand('my-project', 'fix stuff', { noCategories: true });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12] as unknown[];
    expect(notifyRouteArg).toEqual(
      expect.arrayContaining([
        { kind: 'telegram', chatId: 'default_chat_999' },
      ]),
    );
  });

  it('uses webhook defaultUrl from config when webhook is enabled and no --notify-webhook flag', async () => {
    mockGetEnabledBackends.mockReturnValue(['webhook']);
    mockGetBackendConfig.mockReturnValue({ defaultUrl: 'https://default.hook.io/notify' });

    await addCommand('my-project', 'fix stuff', { noCategories: true });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12] as unknown[];
    expect(notifyRouteArg).toEqual(
      expect.arrayContaining([
        { kind: 'webhook', url: 'https://default.hook.io/notify' },
      ]),
    );
  });

  it('explicit flag + enabled backend default combine into multi-route array', async () => {
    // User provides --notify-kimaki, telegram is enabled with a default chatId
    mockGetEnabledBackends.mockReturnValue(['telegram']);
    mockGetBackendConfig.mockReturnValue({ defaultChatId: 'auto_chat' });

    await addCommand('my-project', 'fix stuff', {
      notifyKimaki: 'ses_explicit',
      noCategories: true,
    });

    expect(addJob).toHaveBeenCalled();
    const callArgs = vi.mocked(addJob).mock.calls[0];
    const notifyRouteArg = callArgs[12] as unknown[];
    expect(notifyRouteArg).toHaveLength(2);
    expect(notifyRouteArg).toEqual(
      expect.arrayContaining([
        { kind: 'kimaki', sessionId: 'ses_explicit' },
        { kind: 'telegram', chatId: 'auto_chat' },
      ]),
    );
  });
});

// ── --next flag (bump to front of queue) ───────────────────────────────────

describe('--next flag', () => {
  let nextTestsDir: string;

  beforeAll(() => {
    nextTestsDir = mkdtempSync(path.join(tmpdir(), 'pilot-add-next-'));
    mockedProjectDir = nextTestsDir;
    syncProjectDirEnv();

    // Set up my-project with proper structure
    const projectDir = path.join(nextTestsDir, 'my-project');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');
  });

  afterAll(() => {
    rmSync(nextTestsDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  beforeEach(() => {
    mockedProjectDir = nextTestsDir;
    syncProjectDirEnv();
    vi.mocked(findDuplicateJob).mockReturnValue(null);
    vi.mocked(getProject).mockReturnValue(null);
    delete process.env.PILOT_DEFAULT_NOTIFY;
  });

  it('calls bump(job.id) when opts.next is true', async () => {
    await addCommand('my-project', 'fix stuff', { next: true, noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalled();
    expect(bump).toHaveBeenCalledWith('ab12');
  });

  it('does NOT call bump when opts.next is not set', async () => {
    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(addJob).toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });

  it('shows "front of queue" indicator in human output when --next is used', async () => {
    await addCommand('my-project', 'fix stuff', { next: true, noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('front of queue');
  });
});

// ── blocked project warning ───────────────────────────────────────────────

describe('blocked project warning', () => {
  let blockedTestsDir: string;

  const blockedProject = {
    path: '',  // set in beforeAll
    owner: null,
    notifyRoutes: null,
    status: 'blocked' as const,
    blockedReason: 'Job xyz failed: some error',
    blockedAt: '2026-03-25T00:00:00Z',
    createdAt: '2026-03-20T00:00:00Z',
    defaultCategories: null,
  };

  const activeProject = {
    path: '',  // set in beforeAll
    owner: null,
    notifyRoutes: null,
    status: 'active' as const,
    blockedReason: null,
    blockedAt: null,
    createdAt: '2026-03-20T00:00:00Z',
    defaultCategories: null,
  };

  beforeAll(() => {
    blockedTestsDir = mkdtempSync(path.join(tmpdir(), 'pilot-add-blocked-'));
    mockedProjectDir = blockedTestsDir;
    syncProjectDirEnv();

    const projectDir = path.join(blockedTestsDir, 'my-project');
    mkdirSync(path.join(projectDir, '.opencode', 'command'), { recursive: true });
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    writeFileSync(path.join(projectDir, 'opencode.json'), '{}');

    blockedProject.path = projectDir;
    activeProject.path = projectDir;
  });

  afterAll(() => {
    rmSync(blockedTestsDir, { recursive: true, force: true });
    delete process.env.PILOT_PROJECT_DIR;
  });

  beforeEach(() => {
    mockedProjectDir = blockedTestsDir;
    syncProjectDirEnv();
    vi.mocked(findDuplicateJob).mockReturnValue(null);
    vi.mocked(getProject).mockReturnValue(null);
    vi.mocked(getLatestFailedJob).mockReturnValue(null);
    delete process.env.PILOT_DEFAULT_NOTIFY;
  });

  afterEach(() => {
    delete process.env.PILOT_DEFAULT_NOTIFY;
    vi.mocked(getProject).mockReturnValue(null);
    vi.mocked(getLatestFailedJob).mockReturnValue(null);
  });

  it('prints warning when project is blocked', async () => {
    vi.mocked(getProject).mockReturnValue(blockedProject);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    // Job should still be queued
    expect(addJob).toHaveBeenCalled();

    // Check for blocked warning in human output
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('blocked');
    expect(output).toContain('Job xyz failed: some error');
    expect(output).toContain('--unblock');
    // "Queued" should still appear
    expect(output).toContain('Queued');
  });

  it('includes failed job ID in warning when available', async () => {
    vi.mocked(getProject).mockReturnValue(blockedProject);
    vi.mocked(getLatestFailedJob).mockReturnValue({
      id: 'fail1',
      project: blockedProject.path,
      scope: 'quick',
      description: 'failed task',
      requirementPath: null,
      status: 'failed',
      priority: 0,
      dependsOn: null,
      parentJobId: null,
      createdAt: '2026-03-25T00:00:00',
      startedAt: '2026-03-25T00:00:00',
      completedAt: '2026-03-25T00:01:00',
      error: 'some error',
      resumeHint: null,
      attempts: 1,
      timeout: 0,
      delegationPlan: null,
      currentStep: 0,
      sessionTitles: null,
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      judgeVerdict: null,
      actualModels: null,
      callbackUrl: null,
      callbackSessionKey: null,
      notifyRoute: null,
      categories: null,
      gitBaseCommit: null,
      gitHeadCommit: null,
      startedDirty: false,
      skipGracePeriod: false,
      retryBudget: 0,
      retryCount: 0,
      retryHint: null,
      lastFailureFingerprint: null,
      hungCount: 0,
      lastHungReason: null,
    });

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('fail1');
  });

  it('no warning when project is active', async () => {
    vi.mocked(getProject).mockReturnValue(activeProject);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    // Should NOT contain blocked warning
    expect(output).not.toMatch(/Project is currently.*blocked/);
  });

  it('no warning when project is unregistered', async () => {
    vi.mocked(getProject).mockReturnValue(null);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).not.toMatch(/Project is currently.*blocked/);
  });

  it('JSON mode includes blockedWarning', async () => {
    mockJsonMode = true;
    vi.mocked(getProject).mockReturnValue(blockedProject);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    expect(mockOutputJson).toHaveBeenCalledWith(
      expect.objectContaining({
        job: expect.objectContaining({ id: 'ab12' }),
        blockedWarning: expect.objectContaining({
          reason: 'Job xyz failed: some error',
        }),
      }),
    );
  });

  it('warning appears before Queued output', async () => {
    vi.mocked(getProject).mockReturnValue(blockedProject);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    const calls = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string);
    const blockedIdx = calls.findIndex((s: string) => s.includes('blocked'));
    const queuedIdx = calls.findIndex((s: string) => s.includes('Queued'));
    expect(blockedIdx).toBeGreaterThanOrEqual(0);
    expect(queuedIdx).toBeGreaterThan(blockedIdx);
  });

  it('warning works without failed job ID (getLatestFailedJob returns null)', async () => {
    vi.mocked(getProject).mockReturnValue(blockedProject);
    vi.mocked(getLatestFailedJob).mockReturnValue(null);

    await addCommand('my-project', 'fix stuff', { noNotify: true, noCategories: true });

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('blocked');
    expect(output).toContain('--unblock');
    // Should NOT contain any "Failed job:" line since there's no failed job
    expect(output).not.toContain('Failed job:');
  });
});
