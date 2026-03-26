import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { _resetConfigCache, getConfig } from '../../src/core/config.js';
import {
  classifyProjectGsdDrift,
  ensureApprovedGsdPackage,
  inspectProjectGsdState,
  setApprovedGsdVersion,
  validateApprovedGsdVersion,
} from '../../src/core/managed-gsd.js';

const mockExeca = vi.mocked(execa);

describe('managed-gsd', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pilot-managed-gsd-'));
    configPath = path.join(tmpDir, 'config.json');
    process.env.PILOT_CONFIG_FILE = configPath;
    _resetConfigCache();
    mockExeca.mockReset();
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as never);
  });

  afterEach(async () => {
    delete process.env.PILOT_CONFIG_FILE;
    _resetConfigCache();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults the approved version to 1.24.0 when config omits it', async () => {
    await writeFile(configPath, JSON.stringify({ projectDir: '~/dev' }, null, 2));

    expect(getConfig().approvedGsdVersion).toBe('1.24.0');
  });

  it('round-trips valid approved versions and rejects invalid values', async () => {
    await setApprovedGsdVersion('1.25.3', configPath);
    _resetConfigCache();

    expect(validateApprovedGsdVersion('1.25.3')).toBe('1.25.3');
    expect(getConfig().approvedGsdVersion).toBe('1.25.3');
    expect(() => validateApprovedGsdVersion('latest')).toThrow(/exact x\.y\.z/i);
    await expect(setApprovedGsdVersion('1.25', configPath)).rejects.toThrow(/exact x\.y\.z/i);
  });

  it('classifies project drift deterministically', () => {
    expect(classifyProjectGsdDrift('1.24.0', '1.24.0')).toBe('matches');
    expect(classifyProjectGsdDrift('1.24.0', '1.23.9')).toBe('behind');
    expect(classifyProjectGsdDrift('1.24.0', '1.24.1')).toBe('ahead');
    expect(classifyProjectGsdDrift('1.24.0', null)).toBe('unknown');
    expect(classifyProjectGsdDrift('1.24.0', 'invalid')).toBe('unknown');
    expect(classifyProjectGsdDrift('1.24.0', '1.24.0', 'read failed')).toBe('unknown');
  });

  it('reads VERSION files and marks missing or invalid content as unknown', async () => {
    const goodProject = path.join(tmpDir, 'good-project');
    await mkdir(path.join(goodProject, '.opencode', 'get-shit-done'), { recursive: true });
    await writeFile(path.join(goodProject, '.opencode', 'get-shit-done', 'VERSION'), '1.24.0\n');

    const goodState = await inspectProjectGsdState(goodProject, '1.24.0');
    expect(goodState.installedVersion).toBe('1.24.0');
    expect(goodState.driftStatus).toBe('matches');
    expect(goodState.error).toBeNull();

    const badProject = path.join(tmpDir, 'bad-project');
    await mkdir(path.join(badProject, '.opencode', 'get-shit-done'), { recursive: true });
    await writeFile(path.join(badProject, '.opencode', 'get-shit-done', 'VERSION'), 'oops\n');

    const badState = await inspectProjectGsdState(badProject, '1.24.0');
    expect(badState.installedVersion).toBeNull();
    expect(badState.driftStatus).toBe('unknown');
    expect(badState.error).toMatch(/invalid/i);

    const missingState = await inspectProjectGsdState(path.join(tmpDir, 'missing-project'), '1.24.0');
    expect(missingState.installedVersion).toBeNull();
    expect(missingState.driftStatus).toBe('unknown');
  });

  it('skips installer convergence when the local runtime already matches', async () => {
    const pilotRoot = path.join(tmpDir, 'pilot-root');
    await mkdir(path.join(pilotRoot, 'node_modules', 'get-shit-done-cc'), { recursive: true });
    await writeFile(
      path.join(pilotRoot, 'node_modules', 'get-shit-done-cc', 'package.json'),
      JSON.stringify({ version: '1.24.0' }, null, 2),
    );

    const result = await ensureApprovedGsdPackage('1.24.0', pilotRoot);

    expect(result).toEqual({ changed: false, runtimeVersion: '1.24.0' });
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('runs bun add --exact when the local runtime version does not match', async () => {
    const pilotRoot = path.join(tmpDir, 'pilot-root-mismatch');
    await mkdir(path.join(pilotRoot, 'node_modules', 'get-shit-done-cc'), { recursive: true });
    await writeFile(
      path.join(pilotRoot, 'node_modules', 'get-shit-done-cc', 'package.json'),
      JSON.stringify({ version: '1.23.0' }, null, 2),
    );

    const result = await ensureApprovedGsdPackage('1.24.0', pilotRoot);

    expect(result).toEqual({ changed: true, runtimeVersion: '1.23.0' });
    expect(mockExeca).toHaveBeenCalledWith(
      'bun',
      ['add', '--exact', 'get-shit-done-cc@1.24.0'],
      { cwd: pilotRoot },
    );
  });
});
