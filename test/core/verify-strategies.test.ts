import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock execa before importing the module under test
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { runFileContentVerification, runCliVerification } from '../../src/core/verify-strategies.js';

const mockedExeca = vi.mocked(execa);

describe('runFileContentVerification', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'pilot-verify-strat-'));
    tempDirs.push(dir);
    return dir;
  }

  /**
   * Helper: create a minimal valid project with phase dir, plan, summary, and ROADMAP.
   */
  async function setupValidProject(dir: string, phase: number = 1): Promise<void> {
    const padded = String(phase).padStart(2, '0');
    const phaseDirName = `${padded}-test-phase`;
    const phaseDir = join(dir, '.planning', 'phases', phaseDirName);
    await mkdir(phaseDir, { recursive: true });

    // Valid PLAN.md with frontmatter
    await writeFile(join(phaseDir, `${padded}-01-PLAN.md`), [
      '---',
      `phase: ${padded}-test-phase`,
      'plan: 01',
      'type: auto',
      '---',
      '',
      '# Plan',
      'Some plan content here.',
    ].join('\n'));

    // Valid SUMMARY.md with >10 lines
    const summaryLines = Array.from({ length: 15 }, (_, i) => `Summary line ${i + 1}`);
    await writeFile(join(phaseDir, `${padded}-01-SUMMARY.md`), summaryLines.join('\n'));

    // ROADMAP.md with phase and success criteria
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, '.planning', 'ROADMAP.md'), [
      '# Roadmap',
      '',
      `### Phase ${phase}: Test Phase`,
      '**Goal:** Test phase goal',
      '**Success Criteria:**',
      '- src/core/config.ts resolves all env vars',
      '- core/types.ts exports all interfaces',
    ].join('\n'));
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('passes when phase dir has plans and summaries', async () => {
    const dir = await makeTempDir();
    await setupValidProject(dir, 1);

    const result = await runFileContentVerification(dir, 1);

    expect(result.strategy).toBe('file-content');
    expect(result.passed).toBe(true);
    expect(result.passedChecks).toBeGreaterThan(0);
    expect(result.failedChecks).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('fails when phase directory does not exist', async () => {
    const dir = await makeTempDir();
    // No .planning/phases at all

    const result = await runFileContentVerification(dir, 1);

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('phase directory')]),
    );
  });

  it('fails when no summary files exist', async () => {
    const dir = await makeTempDir();
    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // Plan file but no summary
    await writeFile(join(phaseDir, '01-01-PLAN.md'), [
      '---',
      'phase: 01-test-phase',
      'plan: 01',
      '---',
      '',
      '# Plan',
    ].join('\n'));

    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, '.planning', 'ROADMAP.md'), '# Roadmap\n### Phase 1: Test\n');

    const result = await runFileContentVerification(dir, 1);

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('summary')]),
    );
  });

  it('detects stub summaries with less than 10 lines', async () => {
    const dir = await makeTempDir();
    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    await writeFile(join(phaseDir, '01-01-PLAN.md'), [
      '---',
      'phase: 01-test-phase',
      'plan: 01',
      '---',
      '# Plan',
    ].join('\n'));

    // Stub summary with only 5 lines
    await writeFile(join(phaseDir, '01-01-SUMMARY.md'), 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, '.planning', 'ROADMAP.md'), '# Roadmap\n### Phase 1: Test\n');

    const result = await runFileContentVerification(dir, 1);

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('stub')]),
    );
  });

  it('validates YAML frontmatter in PLAN.md files', async () => {
    const dir = await makeTempDir();
    await setupValidProject(dir, 1);

    const result = await runFileContentVerification(dir, 1);

    // frontmatter check should pass (valid PLAN.md with correct frontmatter)
    expect(result.passed).toBe(true);
    expect(result.issues.filter((i: string) => i.toLowerCase().includes('frontmatter'))).toHaveLength(0);
  });

  it('reports malformed YAML frontmatter (missing closing ---)', async () => {
    const dir = await makeTempDir();
    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // PLAN.md with unclosed frontmatter
    await writeFile(join(phaseDir, '01-01-PLAN.md'), [
      '---',
      'phase: 01-test-phase',
      'plan: 01',
      '',
      '# Plan',
      'Content without closing frontmatter delimiter.',
    ].join('\n'));

    // Valid summary
    const summaryLines = Array.from({ length: 15 }, (_, i) => `Summary line ${i + 1}`);
    await writeFile(join(phaseDir, '01-01-SUMMARY.md'), summaryLines.join('\n'));

    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, '.planning', 'ROADMAP.md'), '# Roadmap\n### Phase 1: Test\n');

    const result = await runFileContentVerification(dir, 1);

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('frontmatter')]),
    );
  });

  it('greps ROADMAP success criteria against project files', async () => {
    const dir = await makeTempDir();
    await setupValidProject(dir, 1);

    // Create matching src files
    await mkdir(join(dir, 'src', 'core'), { recursive: true });
    await writeFile(join(dir, 'src', 'core', 'config.ts'), 'export function getConfig() { /* resolves env vars */ }');
    await writeFile(join(dir, 'src', 'core', 'types.ts'), 'export interface PilotConfig {}');

    const result = await runFileContentVerification(dir, 1);

    expect(result.passed).toBe(true);
    // Criteria should match — no issues about unmatched criteria
    const unmatchedIssues = result.issues.filter((i: string) => i.toLowerCase().includes('unmatched'));
    expect(unmatchedIssues).toHaveLength(0);
  });

  it('reports unmatched ROADMAP success criteria as warnings', async () => {
    const dir = await makeTempDir();
    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    await writeFile(join(phaseDir, '01-01-PLAN.md'), [
      '---',
      'phase: 01-test-phase',
      'plan: 01',
      '---',
      '# Plan',
    ].join('\n'));

    const summaryLines = Array.from({ length: 15 }, (_, i) => `Summary line ${i + 1}`);
    await writeFile(join(phaseDir, '01-01-SUMMARY.md'), summaryLines.join('\n'));

    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, '.planning', 'ROADMAP.md'), [
      '# Roadmap',
      '',
      '### Phase 1: Test Phase',
      '**Success Criteria:**',
      '- src/nonexistent/module.ts works correctly',
      '- src/imaginary/feature.ts handles all cases',
    ].join('\n'));

    // No src/ directory at all
    const result = await runFileContentVerification(dir, 1);

    // Unmatched criteria should be warnings but NOT hard fail the overall result
    const unmatchedIssues = result.issues.filter((i: string) => i.toLowerCase().includes('unmatched'));
    expect(unmatchedIssues.length).toBeGreaterThan(0);
  });

  it('runs test suite when package.json has test script', async () => {
    const dir = await makeTempDir();
    await setupValidProject(dir, 1);

    // Add package.json with test script
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'test-project',
      scripts: { test: 'vitest run' },
    }));

    // Mock execa for test run — success
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Tests passed',
      stderr: '',
    } as never);

    const result = await runFileContentVerification(dir, 1);

    expect(result.testsRan).toBe(true);
    expect(result.testsPassed).toBe(true);
  });

  it('reports test failure', async () => {
    const dir = await makeTempDir();
    await setupValidProject(dir, 1);

    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'test-project',
      scripts: { test: 'vitest run' },
    }));

    // Mock execa for test run — failure
    mockedExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: 'Tests failed',
      stderr: 'FAIL src/test.ts',
    } as never);

    const result = await runFileContentVerification(dir, 1);

    expect(result.testsRan).toBe(true);
    expect(result.testsPassed).toBe(false);
  });

  it('skips tests when no test script exists', async () => {
    const dir = await makeTempDir();
    await setupValidProject(dir, 1);

    // No package.json at all (or no test script)
    const result = await runFileContentVerification(dir, 1);

    expect(result.testsRan).toBe(false);
    expect(result.testsPassed).toBeNull();
  });
});

describe('runCliVerification', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'pilot-verify-cli-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('passes when build succeeds and binary works', async () => {
    const dir = await makeTempDir();

    // package.json with build + bin
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      bin: { 'my-cli': './dist/index.js' },
      scripts: { build: 'tsc' },
    }));

    // Create the binary file (exists after build)
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist', 'index.js'), '#!/usr/bin/env node\nconsole.log("hello");');
    await chmod(join(dir, 'dist', 'index.js'), 0o755);

    // Also create phase dir for phase check
    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // Mock: build succeeds, --help succeeds
    mockedExeca
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Build complete', stderr: '' } as never)   // build
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Usage: my-cli [options]', stderr: '' } as never);  // --help

    const result = await runCliVerification(dir, 1);

    expect(result.strategy).toBe('cli');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails when build fails', async () => {
    const dir = await makeTempDir();

    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      bin: { 'my-cli': './dist/index.js' },
      scripts: { build: 'tsc' },
    }));

    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // Mock: build fails
    mockedExeca.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'Error: tsc failed' } as never);

    const result = await runCliVerification(dir, 1);

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('build')]),
    );
  });

  it('fails when --help returns non-zero', async () => {
    const dir = await makeTempDir();

    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      bin: { 'my-cli': './dist/index.js' },
      scripts: { build: 'tsc' },
    }));

    // Binary exists
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist', 'index.js'), '#!/usr/bin/env node');
    await chmod(join(dir, 'dist', 'index.js'), 0o755);

    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // Mock: build succeeds, --help fails
    mockedExeca
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'Build complete', stderr: '' } as never)   // build
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'Unknown option' } as never);   // --help

    const result = await runCliVerification(dir, 1);

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('help')]),
    );
  });

  it('runs test suite when available', async () => {
    const dir = await makeTempDir();

    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      scripts: { build: 'tsc', test: 'vitest run' },
    }));

    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // Mock: build succeeds, test succeeds
    mockedExeca
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' } as never)   // build
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'All tests passed', stderr: '' } as never);  // test

    const result = await runCliVerification(dir, 1);

    expect(result.testsRan).toBe(true);
    expect(result.testsPassed).toBe(true);
  });

  it('skips binary checks when no bin field in package.json', async () => {
    const dir = await makeTempDir();

    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-lib',
      scripts: { build: 'tsc' },
    }));

    const phaseDir = join(dir, '.planning', 'phases', '01-test-phase');
    await mkdir(phaseDir, { recursive: true });

    // Mock: build succeeds
    mockedExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' } as never);

    const result = await runCliVerification(dir, 1);

    // Should not have issues about binary existence or executable
    const binaryIssues = result.issues.filter((i: string) =>
      i.toLowerCase().includes('binary') || i.toLowerCase().includes('executable'),
    );
    expect(binaryIssues).toHaveLength(0);
  });
});
