import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { getConfig } from './config.js';

export type { ManagedGsdDriftStatus } from './types.js';
import type { ManagedGsdDriftStatus } from './types.js';

export interface ProjectGsdState {
  approvedVersion: string;
  installedVersion: string | null;
  driftStatus: ManagedGsdDriftStatus;
  checkedAt: string;
  error: string | null;
}

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+$/;

function validateApprovedGsdVersion(version: string): string {
  if (!EXACT_VERSION_RE.test(version)) {
    throw new Error(`Approved GSD version must use exact x.y.z format, got ${JSON.stringify(version)}`);
  }
  return version;
}

function parseExactVersion(version: string): [number, number, number] | null {
  if (!EXACT_VERSION_RE.test(version)) {
    return null;
  }

  return version.split('.').map((part) => Number(part)) as [number, number, number];
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = parseExactVersion(left);
  const rightParts = parseExactVersion(right);
  if (!leftParts || !rightParts) {
    return null;
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }

  return 0;
}

function resolvePilotRoot(pilotRoot?: string): string {
  return pilotRoot ?? path.resolve(import.meta.dirname, '..', '..');
}

function resolveConfigPath(configPath?: string): string {
  if (configPath) return configPath;
  if (process.env.PILOT_CONFIG_FILE) return process.env.PILOT_CONFIG_FILE;
  return path.join(os.homedir(), '.pilot', 'config.json');
}

function classifyProjectGsdDrift(
  approvedVersion: string,
  installedVersion: string | null,
  error?: string | null,
): ManagedGsdDriftStatus {
  validateApprovedGsdVersion(approvedVersion);
  if (error || !installedVersion) {
    return 'unknown';
  }

  const comparison = compareVersions(installedVersion, approvedVersion);
  if (comparison === null) {
    return 'unknown';
  }
  if (comparison === 0) {
    return 'matches';
  }
  return comparison < 0 ? 'behind' : 'ahead';
}

async function inspectProjectGsdState(projectDir: string, approvedVersion?: string): Promise<ProjectGsdState> {
  const resolvedApprovedVersion = validateApprovedGsdVersion(approvedVersion ?? getConfig().approvedGsdVersion);
  const checkedAt = new Date().toISOString();
  const versionPath = path.join(projectDir, '.opencode', 'get-shit-done', 'VERSION');

  try {
    const rawVersion = (await readFile(versionPath, 'utf8')).trim();
    if (!rawVersion) {
      return {
        approvedVersion: resolvedApprovedVersion,
        installedVersion: null,
        driftStatus: 'unknown',
        checkedAt,
        error: `VERSION file is empty at ${versionPath}`,
      };
    }

    if (!parseExactVersion(rawVersion)) {
      return {
        approvedVersion: resolvedApprovedVersion,
        installedVersion: null,
        driftStatus: 'unknown',
        checkedAt,
        error: `Invalid VERSION content at ${versionPath}: ${rawVersion}`,
      };
    }

    return {
      approvedVersion: resolvedApprovedVersion,
      installedVersion: rawVersion,
      driftStatus: classifyProjectGsdDrift(resolvedApprovedVersion, rawVersion),
      checkedAt,
      error: null,
    };
  } catch (error) {
    return {
      approvedVersion: resolvedApprovedVersion,
      installedVersion: null,
      driftStatus: 'unknown',
      checkedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getPilotRuntimeGsdVersion(pilotRoot?: string): Promise<string | null> {
  const runtimePackagePath = path.join(
    resolvePilotRoot(pilotRoot),
    'node_modules',
    'get-shit-done-cc',
    'package.json',
  );

  try {
    const raw = await readFile(runtimePackagePath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parseExactVersion(parsed.version) ? parsed.version : null;
  } catch {
    return null;
  }
}

async function ensureApprovedGsdPackage(
  approvedVersion: string,
  pilotRoot?: string,
): Promise<{ changed: boolean; runtimeVersion: string | null }> {
  const resolvedApprovedVersion = validateApprovedGsdVersion(approvedVersion);
  const resolvedPilotRoot = resolvePilotRoot(pilotRoot);
  const runtimeVersion = await getPilotRuntimeGsdVersion(resolvedPilotRoot);

  if (runtimeVersion === resolvedApprovedVersion) {
    return { changed: false, runtimeVersion };
  }

  await execa('bun', ['add', '--exact', `get-shit-done-cc@${resolvedApprovedVersion}`], { cwd: resolvedPilotRoot });
  return { changed: true, runtimeVersion };
}

async function setApprovedGsdVersion(version: string, configPath?: string): Promise<string> {
  const approvedVersion = validateApprovedGsdVersion(version);
  const resolvedConfigPath = resolveConfigPath(configPath);

  let configContent: Record<string, unknown> = {};
  try {
    configContent = JSON.parse(await readFile(resolvedConfigPath, 'utf8')) as Record<string, unknown>;
  } catch {
    configContent = {};
  }

  const existingGsd = configContent.gsd;
  configContent.gsd = {
    ...(existingGsd && typeof existingGsd === 'object' && !Array.isArray(existingGsd) ? existingGsd : {}),
    approvedVersion,
  };

  await mkdir(path.dirname(resolvedConfigPath), { recursive: true });
  await writeFile(resolvedConfigPath, `${JSON.stringify(configContent, null, 2)}\n`, 'utf8');
  try {
    await chmod(resolvedConfigPath, 0o600);
  } catch {
    // Non-fatal on unsupported platforms.
  }

  return approvedVersion;
}

export {
  validateApprovedGsdVersion,
  classifyProjectGsdDrift,
  inspectProjectGsdState,
  getPilotRuntimeGsdVersion,
  ensureApprovedGsdPackage,
  setApprovedGsdVersion,
};
