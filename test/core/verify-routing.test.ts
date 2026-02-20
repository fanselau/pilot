import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProjectType, resolveVerifyStrategy } from '../../src/core/verify-routing.js';

describe('detectProjectType', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'pilot-verify-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  // ── Web detection signals ──────────────────────────────────────────────

  it('returns web for project with vite dev script', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      scripts: { dev: 'vite' },
    }));
    expect(await detectProjectType(dir)).toBe('web');
  });

  it('returns web for project with next dev script', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      scripts: { dev: 'next dev' },
    }));
    expect(await detectProjectType(dir)).toBe('web');
  });

  it('returns web for project with express start', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-server',
      scripts: { start: 'node server.js' },
      dependencies: { express: '^4.0' },
    }));
    expect(await detectProjectType(dir)).toBe('web');
  });

  it('returns web for project with JSX route files', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      scripts: { build: 'tsc' },
    }));
    await mkdir(join(dir, 'src', 'app'), { recursive: true });
    await writeFile(join(dir, 'src', 'app', 'page.tsx'), '');
    expect(await detectProjectType(dir)).toBe('web');
  });

  it('returns web for project with localhost in package.json', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      scripts: { test: 'curl http://localhost:3000/health' },
    }));
    expect(await detectProjectType(dir)).toBe('web');
  });

  it('returns web for project with web framework dependency', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      dependencies: { next: '^14.0' },
    }));
    expect(await detectProjectType(dir)).toBe('web');
  });

  it('returns web over cli when both signals present', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      bin: { 'my-cli': './dist/index.js' },
      scripts: { dev: 'vite' },
    }));
    // Web checked first, so web wins even with bin present
    expect(await detectProjectType(dir)).toBe('web');
  });

  // ── CLI detection signals ──────────────────────────────────────────────

  it('returns cli for project with bin field', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      bin: { 'my-cli': './dist/index.js' },
      scripts: { build: 'tsc' },
    }));
    expect(await detectProjectType(dir)).toBe('cli');
  });

  it('returns cli for project with build script and src/ but no web signals', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-lib',
      scripts: { build: 'tsc' },
    }));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'index.ts'), '');
    expect(await detectProjectType(dir)).toBe('cli');
  });

  // ── File-content detection signals ────────────────────────────────────

  it('returns file-content when no package.json', async () => {
    const dir = await makeTempDir();
    expect(await detectProjectType(dir)).toBe('file-content');
  });

  it('returns file-content for markdown-only project', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'README.md'), '# Hello');
    await writeFile(join(dir, 'CONTRIBUTING.md'), '# Contributing');
    expect(await detectProjectType(dir)).toBe('file-content');
  });

  it('returns file-content for package.json with no signals', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-config',
      version: '1.0.0',
    }));
    expect(await detectProjectType(dir)).toBe('file-content');
  });
});

describe('resolveVerifyStrategy', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'pilot-verify-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('explicit browser strategy returns web', async () => {
    const dir = await makeTempDir();
    const result = await resolveVerifyStrategy('browser', dir);
    expect(result.strategy).toBe('web');
    expect(result.reason).toBe('explicit --strategy flag');
  });

  it('explicit file strategy returns file-content', async () => {
    const dir = await makeTempDir();
    const result = await resolveVerifyStrategy('file', dir);
    expect(result.strategy).toBe('file-content');
    expect(result.reason).toBe('explicit --strategy flag');
  });

  it('explicit cli strategy returns cli', async () => {
    const dir = await makeTempDir();
    const result = await resolveVerifyStrategy('cli', dir);
    expect(result.strategy).toBe('cli');
    expect(result.reason).toBe('explicit --strategy flag');
  });

  it('auto strategy delegates to detectProjectType for web project', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-app',
      scripts: { dev: 'vite' },
    }));
    const result = await resolveVerifyStrategy('auto', dir);
    expect(result.strategy).toBe('web');
    expect(result.reason).toContain('vite');
  });

  it('auto strategy delegates to detectProjectType for cli project', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      bin: { 'my-cli': './dist/index.js' },
      scripts: { build: 'tsc' },
    }));
    const result = await resolveVerifyStrategy('auto', dir);
    expect(result.strategy).toBe('cli');
    expect(result.reason).toContain('bin');
  });

  it('auto strategy delegates to detectProjectType for file-content project', async () => {
    const dir = await makeTempDir();
    const result = await resolveVerifyStrategy('auto', dir);
    expect(result.strategy).toBe('file-content');
    expect(result.reason).toContain('no package.json');
  });
});
