import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, lstat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── Mock external dependencies ──────────────────────────────────────────────

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    queueFile: '/tmp/QUEUE.md',
    logDir: '/tmp',
    stuckThreshold: 90,
    projectDir: '/tmp/projects',
    gsdDir: '/tmp/mock-gsd',
    noColor: true,
  })),
}));

import { getConfig } from '../../src/core/config.js';
import { setupProject } from '../../src/core/setup.js';

// ── Test suite ──────────────────────────────────────────────────────────────

describe('setupProject', () => {
  let tempDir: string;
  let gsdDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create temp directories for each test
    tempDir = await mkdtemp(path.join(tmpdir(), 'pilot-setup-test-'));
    gsdDir = await mkdtemp(path.join(tmpdir(), 'pilot-gsd-mock-'));

    // Create mock pilot-gsd subdirectories
    await mkdir(path.join(gsdDir, 'commands'), { recursive: true });
    await mkdir(path.join(gsdDir, 'agents'), { recursive: true });
    await mkdir(path.join(gsdDir, 'get-shit-done'), { recursive: true });

    // Point getConfig to our temp gsdDir
    vi.mocked(getConfig).mockReturnValue({
      queueFile: '/tmp/QUEUE.md',
      logDir: '/tmp',
      stuckThreshold: 90,
      projectDir: '/tmp/projects',
      gsdDir,
      noColor: true,
    });

    // Pre-create a .git directory so git init is skipped
    await mkdir(path.join(tempDir, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(gsdDir, { recursive: true, force: true });
  });

  it('creates .opencode/ directory with symlinks', async () => {
    const result = await setupProject(tempDir);

    // Assert .opencode/ directory exists
    const opencodeDir = path.join(tempDir, '.opencode');
    const stats = await lstat(opencodeDir);
    expect(stats.isDirectory()).toBe(true);

    // Assert each symlink exists and is a symlink
    const commandLink = path.join(opencodeDir, 'command');
    const commandStats = await lstat(commandLink);
    expect(commandStats.isSymbolicLink()).toBe(true);

    const agentsLink = path.join(opencodeDir, 'agents');
    const agentsStats = await lstat(agentsLink);
    expect(agentsStats.isSymbolicLink()).toBe(true);

    const gsdLink = path.join(opencodeDir, 'get-shit-done');
    const gsdStats = await lstat(gsdLink);
    expect(gsdStats.isSymbolicLink()).toBe(true);

    // Assert .claude/ does NOT exist
    const claudeDir = path.join(tempDir, '.claude');
    try {
      await lstat(claudeDir);
      // If lstat succeeds, .claude exists — fail
      expect.fail('.claude/ directory should not exist');
    } catch {
      // Expected: .claude doesn't exist
    }

    // Verify created entries include symlinks
    expect(result.created).toContainEqual(expect.stringContaining('.opencode/command/'));
    expect(result.created).toContainEqual(expect.stringContaining('.opencode/agents/'));
    expect(result.created).toContainEqual(expect.stringContaining('.opencode/get-shit-done/'));
    expect(result.errors).toHaveLength(0);
  });

  it('creates opencode.json with correct permission format', async () => {
    const result = await setupProject(tempDir);

    // Read and parse opencode.json
    const configPath = path.join(tempDir, 'opencode.json');
    const content = await readFile(configPath, 'utf8');
    const config = JSON.parse(content);

    // Assert permission exists (singular, not permissions)
    expect(config.permission).toBeDefined();
    expect(config.permissions).toBeUndefined();

    // Assert all 5 permission types present and correct
    expect(config.permission.read['**']).toBe('allow');
    expect(config.permission.write['**']).toBe('allow');
    expect(config.permission.edit['**']).toBe('allow');
    expect(config.permission.bash['**']).toBe('allow');
    expect(config.permission.external_directory['**']).toBe('allow');

    expect(result.created).toContain('opencode.json');
  });

  it('adds .opencode/ to .gitignore', async () => {
    const result = await setupProject(tempDir);

    // Read .gitignore
    const gitignorePath = path.join(tempDir, '.gitignore');
    const content = await readFile(gitignorePath, 'utf8');

    // Assert it contains .opencode/
    expect(content).toContain('.opencode/');
    expect(result.created).toContainEqual(expect.stringContaining('.gitignore'));
  });

  it('skips existing opencode.json', async () => {
    // Write a custom opencode.json first
    const configPath = path.join(tempDir, 'opencode.json');
    const customContent = '{"custom": true}\n';
    await writeFile(configPath, customContent, 'utf8');

    const result = await setupProject(tempDir);

    // Assert skipped includes opencode.json
    expect(result.skipped).toContainEqual(expect.stringContaining('opencode.json'));

    // Assert the file content is unchanged
    const content = await readFile(configPath, 'utf8');
    expect(content).toBe(customContent);
  });

  it('warns on real directory (not symlink) in .opencode/', async () => {
    // Create .opencode/command/ as a real directory (not symlink)
    const opencodeDir = path.join(tempDir, '.opencode');
    await mkdir(path.join(opencodeDir, 'command'), { recursive: true });

    const result = await setupProject(tempDir);

    // Assert result.skipped includes a message about "real directory"
    const realDirSkip = result.skipped.find((s) =>
      s.includes('real directory') && s.includes('command'),
    );
    expect(realDirSkip).toBeDefined();
  });

  it('skips opencode.json when legacy claude.json exists', async () => {
    // Write a claude.json (legacy config)
    const legacyPath = path.join(tempDir, 'claude.json');
    await writeFile(legacyPath, '{"legacy": true}\n', 'utf8');

    const result = await setupProject(tempDir);

    // Assert skipped includes message about legacy claude.json
    const legacySkip = result.skipped.find((s) =>
      s.includes('claude.json') || s.includes('legacy'),
    );
    expect(legacySkip).toBeDefined();

    // Assert opencode.json was NOT created
    const configPath = path.join(tempDir, 'opencode.json');
    try {
      await lstat(configPath);
      expect.fail('opencode.json should not have been created');
    } catch {
      // Expected: opencode.json doesn't exist
    }
  });
});
