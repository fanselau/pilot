import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock all external dependencies ──────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/test-QUEUE.md',
    pilotDir: '/tmp/.pilot',
    queueJsonFile: '/tmp/.pilot/queue.json',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/gsd',
    noColor: true,
  })),
}));

vi.mock('../../src/core/smart-add.js', () => ({
  detectScope: vi.fn(),
  detectProjectState: vi.fn(),
  generateRequirementsContent: vi.fn(),
  resolveInternalMode: vi.fn(),
}));

vi.mock('../../src/core/queue-store.js', () => ({
  addItem: vi.fn(async () => 'ab12'),
}));

vi.mock('../../src/core/setup.js', () => ({
  setupProject: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn(),
  access: vi.fn(),
}));

import { stat, readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { detectScope, detectProjectState, generateRequirementsContent, resolveInternalMode } from '../../src/core/smart-add.js';
import { addItem } from '../../src/core/queue-store.js';
import { setupProject } from '../../src/core/setup.js';
import { setJsonMode } from '../../src/util/output.js';
import { addCommand } from '../../src/commands/add.js';
import type { ScopeDetectionResult, ProjectStateResult } from '../../src/core/types.js';

const mockedStat = vi.mocked(stat);
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedReaddir = vi.mocked(readdir);
const mockedMkdir = vi.mocked(mkdir);
const mockedCopyFile = vi.mocked(copyFile);
const mockedDetectScope = vi.mocked(detectScope);
const mockedDetectProjectState = vi.mocked(detectProjectState);
const mockedGenerateRequirementsContent = vi.mocked(generateRequirementsContent);
const mockedResolveInternalMode = vi.mocked(resolveInternalMode);
const mockedAddItem = vi.mocked(addItem);
const mockedSetupProject = vi.mocked(setupProject);

// Suppress unused var warnings
void mockedCopyFile;
void mockedReadFile;
void mockedWriteFile;

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectState(overrides: Partial<ProjectStateResult> = {}): ProjectStateResult {
  return {
    exists: true,
    hasOpencode: true,
    hasPlanning: true,
    allPhasesDone: true,
    phasesIncomplete: false,
    isQueued: false,
    isRunning: false,
    queuedMode: null,
    runningPhase: null,
    needsSetup: false,
    needsInit: false,
    ...overrides,
  };
}

function makeScopeResult(overrides: Partial<ScopeDetectionResult> = {}): ScopeDetectionResult {
  return {
    scope: 'phase',
    itemCount: 5,
    hasPhaseHeaders: false,
    isDirectory: false,
    rationale: '5 requirement items (focused feature)',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('addCommand', () => {
  let output: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    output = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as typeof process.exit);
    setJsonMode(false);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    setJsonMode(false);
  });

  it('add with requirements file detects scope and queues via addItem', async () => {
    // Mock: stat returns file
    mockedStat.mockResolvedValue({ isDirectory: () => false, isFile: () => true } as never);
    // Mock: readFile returns markdown content with heading
    mockedReadFile.mockResolvedValue(
      '# Dark Mode\n\n## Requirements\n### Must Have\n- [ ] item 1\n- [ ] item 2\n- [ ] item 3\n- [ ] item 4\n- [ ] item 5' as never,
    );
    mockedWriteFile.mockResolvedValue(undefined);

    mockedDetectProjectState.mockResolvedValue(makeProjectState());
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'phase', rationale: '5 items' }));
    mockedResolveInternalMode.mockReturnValue('add-and-build');

    const result = await addCommand('resume-roast', '/external/requirements/dark-mode.md', {});

    // addItem was called with correct params
    expect(mockedAddItem).toHaveBeenCalledWith({
      project: 'resume-roast',
      mode: 'add-and-build',
      description: 'Dark Mode',
    });

    expect(result.id).toBe('ab12');
    expect(result.project).toBe('resume-roast');
    expect(result.scope).toBe('phase');
    expect(result.internalMode).toBe('add-and-build');
    expect(result.dryRun).toBe(false);
  });

  it('add with string description queues as quick', async () => {
    // Mock: stat throws (not a file/dir)
    mockedStat.mockRejectedValue(new Error('ENOENT'));

    mockedDetectProjectState.mockResolvedValue(makeProjectState());
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'quick', rationale: 'String description' }));
    mockedResolveInternalMode.mockReturnValue('quick');

    const result = await addCommand('resume-roast', 'fix the favicon', {});

    expect(mockedAddItem).toHaveBeenCalledWith({
      project: 'resume-roast',
      mode: 'quick',
      description: 'fix the favicon',
    });

    expect(result.scope).toBe('quick');
    expect(result.internalMode).toBe('quick');
    expect(result.id).toBe('ab12');
  });

  it('add with directory queues as milestone', async () => {
    // Mock: stat returns directory
    mockedStat.mockResolvedValue({ isDirectory: () => true, isFile: () => false } as never);
    mockedReaddir.mockResolvedValue(['phase1.md', 'phase2.md', 'readme.txt'] as never);

    mockedDetectProjectState.mockResolvedValue(makeProjectState());
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'milestone', isDirectory: true, rationale: 'Directory detected' }));
    mockedResolveInternalMode.mockReturnValue('build-full');

    const result = await addCommand('resume-roast', '/path/to/requirements/v2/', {});

    expect(mockedAddItem).toHaveBeenCalledWith({
      project: 'resume-roast',
      mode: 'build-full',
      description: expect.stringContaining('requirements files'),
    });

    expect(result.scope).toBe('milestone');
    expect(result.internalMode).toBe('build-full');
  });

  it('add --dry-run does not call addItem', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState());
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'quick' }));
    mockedResolveInternalMode.mockReturnValue('quick');

    const result = await addCommand('resume-roast', 'fix bug', { dryRun: true });

    // addItem should NOT be called
    expect(mockedAddItem).not.toHaveBeenCalled();

    expect(result.dryRun).toBe(true);
    expect(result.id).toBeNull();
  });

  it('add --as phase overrides detection', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState());
    mockedResolveInternalMode.mockReturnValue('add-and-build');
    mockedGenerateRequirementsContent.mockReturnValue('# Generated\n\n- [ ] task');
    mockedWriteFile.mockResolvedValue(undefined);
    mockedMkdir.mockResolvedValue(undefined);

    const result = await addCommand('resume-roast', 'add dark mode', { as: 'phase' });

    // detectScope should NOT be called (override bypasses it)
    expect(mockedDetectScope).not.toHaveBeenCalled();
    // resolveInternalMode should be called with scope='phase'
    expect(mockedResolveInternalMode).toHaveBeenCalledWith('phase', expect.anything());

    expect(result.scope).toBe('phase');
    expect(result.internalMode).toBe('add-and-build');
  });

  it('add to project without .opencode runs setup', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState({
      hasOpencode: false,
      needsSetup: true,
    }));
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'quick' }));
    mockedResolveInternalMode.mockReturnValue('quick');
    mockedSetupProject.mockResolvedValue({ created: [], skipped: [], errors: [] });

    await addCommand('resume-roast', 'fix bug', {});

    // setupProject should be called
    expect(mockedSetupProject).toHaveBeenCalledWith('/tmp/projects/resume-roast');
  });

  it('add warns when project already queued', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState({
      isQueued: true,
      queuedMode: 'build-full',
    }));
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'quick' }));
    mockedResolveInternalMode.mockReturnValue('quick');

    await addCommand('resume-roast', 'fix bug', {});

    // Output should contain a warning about already queued
    expect(output).toContain('already queued');
    expect(output).toContain('build-full');
  });

  it('add exits 1 for non-existent project', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState({
      exists: false,
    }));

    await expect(
      addCommand('nonexistent', 'fix bug', {}),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('add generates requirements file for non-quick scope with string input', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState());
    mockedDetectScope.mockReturnValue(makeScopeResult({ scope: 'phase' }));
    mockedResolveInternalMode.mockReturnValue('add-and-build');
    mockedGenerateRequirementsContent.mockReturnValue('# Add Dark Mode\n\n## Requirements\n### Must Have\n- [ ] add dark mode');
    mockedWriteFile.mockResolvedValue(undefined);
    mockedMkdir.mockResolvedValue(undefined);

    const result = await addCommand('resume-roast', 'add dark mode', {});

    // mkdir should be called for requirements dir
    expect(mockedMkdir).toHaveBeenCalledWith(
      expect.stringContaining('requirements'),
      expect.objectContaining({ recursive: true }),
    );
    // generateRequirementsContent should be called
    expect(mockedGenerateRequirementsContent).toHaveBeenCalledWith('add dark mode');
    // writeFile should be called for requirements file
    const reqWriteCalls = mockedWriteFile.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('requirements'),
    );
    expect(reqWriteCalls.length).toBeGreaterThan(0);

    expect(result.requirementsPath).toContain('requirements');
    expect(result.requirementsPath).toContain('add-dark-mode');
  });

  it('add exits 2 for invalid --as scope', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));
    mockedDetectProjectState.mockResolvedValue(makeProjectState());

    await expect(
      addCommand('resume-roast', 'fix bug', { as: 'invalid-scope' }),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
