/**
 * Project setup: GSD commands via upstream installer, opencode.json, .gitignore, git init.
 *
 * Powers `pilot setup <dir>` by invoking the upstream get-shit-done-cc installer
 * in the project directory, generating the permissive opencode.json config,
 * and ensuring .gitignore and git are set up.
 *
 * Migration: detects and removes legacy installer-owned symlinks before running installer.
 *
 * Pure core module — no UI dependencies.
 */

import { mkdir, symlink, readFile, readdir, writeFile, access, stat, lstat, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { ensureAutonomousGsdConfig } from './gsd-config.js';
import { getConfig } from './config.js';
import { updateProjectGsdState } from './db.js';
import { ensureApprovedGsdPackage, inspectProjectGsdState } from './managed-gsd.js';
import type { ProjectGsdState } from './managed-gsd.js';
import { errMsg } from '../util/errors.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface SetupOptions {
  refresh?: boolean;
  force?: boolean;
}

interface SetupResult {
  created: string[];
  skipped: string[];
  errors: string[];
  gsd: {
    approvedVersion: string;
    installedVersion: string | null;
    driftStatus: 'matches' | 'behind' | 'ahead' | 'unknown';
    error: string | null;
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

export const OPENCODE_JSON_TEMPLATE = {
  permission: {
    read: { '**': 'allow' },
    write: { '**': 'allow' },
    edit: { '**': 'allow' },
    bash: { '**': 'allow' },
    external_directory: { '**': 'allow' },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Deep-merge source into target.
 * Template values fill in missing keys; existing user values are NEVER overwritten.
 * Arrays are NOT merged — target arrays win if present.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else if (!(key in target)) {
      result[key] = source[key];
    }
    // If key exists in target, target wins (existing user values preserved)
  }
  return result;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

/**
 * Set up a project directory for use with Pilot.
 *
 * Creates:
 * 1. The project directory (if needed)
 * 2. .opencode/ directory with GSD commands via upstream installer
 * 3. opencode.json with permissive permissions
 * 4. .gitignore entry for .opencode/
 * 5. git init (if not already a repo)
 *
 * With options.refresh=true: re-runs the upstream installer and deep-merges
 * opencode.json template into existing config (adds missing fields without
 * overwriting user values). With options.force=true alongside refresh,
 * overwrites opencode.json entirely with template.
 *
 * Without options: never overwrites existing opencode.json (backward compatible).
 */
async function setupProject(dir: string, options?: SetupOptions): Promise<SetupResult> {
  const absDir = path.resolve(dir);
  const approvedVersion = getConfig().approvedGsdVersion;
  const result: SetupResult = {
    created: [],
    skipped: [],
    errors: [],
    gsd: {
      approvedVersion,
      installedVersion: null,
      driftStatus: 'unknown',
      error: null,
    },
  };
  let currentGsdState: ProjectGsdState = {
    approvedVersion,
    installedVersion: null,
    driftStatus: 'unknown' as const,
    checkedAt: new Date().toISOString(),
    error: null,
  };
  let shouldRunInstaller = true;
  let installerBlockedByRuntime = false;
  let installerFailureMessage: string | null = null;

  // 1. Create directory if needed
  try {
    await mkdir(absDir, { recursive: true });
  } catch (err: unknown) {
    const msg = errMsg(err);
    result.errors.push(`Failed to create directory: ${msg}`);
    return result;
  }

  try {
    await ensureApprovedGsdPackage(approvedVersion);
  } catch (err: unknown) {
    installerBlockedByRuntime = true;
    installerFailureMessage = `Failed to prepare approved GSD ${approvedVersion}: ${errMsg(err)}`;
    result.errors.push(installerFailureMessage);
  }

  // 2. Create .opencode/ directory
  const opencodeDir = path.join(absDir, '.opencode');
  try {
    await mkdir(opencodeDir, { recursive: true });
  } catch (err: unknown) {
    const msg = errMsg(err);
    result.errors.push(`Failed to create .opencode/: ${msg}`);
    return result;
  }

  // 3. Migration cleanup: remove legacy installer-owned symlinks before running installer
  //    This ensures the installer can create real directories/files in their place.

  // 3a. Directory-level symlinks in installer-owned .opencode/ paths
  for (const name of ['command', 'agents', 'get-shit-done']) {
    const linkPath = path.join(opencodeDir, name);
    try {
      const linkStats = await lstat(linkPath);
      if (linkStats.isSymbolicLink()) {
        await unlink(linkPath);
        result.created.push(`Removed legacy symlink: .opencode/${name}/`);
      }
    } catch {
      // Path doesn't exist or can't be stat'd — nothing to clean up
    }
  }

  // 3b. File-level symlinks inside installer-owned directories
  for (const dirName of ['command', 'agents']) {
    const subDir = path.join(opencodeDir, dirName);
    try {
      const subDirStats = await lstat(subDir);
      // Only scan if it's a real directory (not a symlink — those were handled above)
      if (!subDirStats.isSymbolicLink() && subDirStats.isDirectory()) {
        const entries = await readdir(subDir);
        for (const entry of entries) {
          const entryPath = path.join(subDir, entry);
          try {
            const entryStats = await lstat(entryPath);
            if (entryStats.isSymbolicLink()) {
              await unlink(entryPath);
            }
          } catch {
            // Can't stat entry — skip
          }
        }
      }
    } catch {
      // Directory doesn't exist — nothing to scan
    }
  }

  // 3c. Check for package.json — GSD installer requires a Node.js project
  const packageJsonPath = path.join(absDir, 'package.json');
  const hasPackageJson = await exists(packageJsonPath);
  if (options?.refresh) {
    currentGsdState = await inspectProjectGsdState(absDir, approvedVersion);
    if (currentGsdState.driftStatus === 'ahead') {
      shouldRunInstaller = false;
      result.skipped.push(`GSD reinstall skipped: project is ahead of approved version (${currentGsdState.installedVersion ?? 'unknown'} > ${approvedVersion})`);
      updateProjectGsdState(absDir, currentGsdState);
    }
  }

  if (!hasPackageJson) {
    shouldRunInstaller = false;
    result.errors.push(
      'Skipping GSD installation: no package.json found in project (GSD installer requires a Node.js project)',
    );
    // Do NOT return early — continue with opencode.json, .gitignore, git init, shell exposure
  } else if (installerBlockedByRuntime) {
    shouldRunInstaller = false;
  } else if (shouldRunInstaller) {
    // 3d. Run upstream installer
    const installerBin = path.join(
      path.resolve(import.meta.dirname, '..', '..'),
      'node_modules', '.bin', 'get-shit-done-cc',
    );
    const { stdout: _installerStdout, stderr: installerStderr, exitCode } = await execa(installerBin, ['--opencode', '--local'], {
      cwd: absDir,
      timeout: 60_000,
      reject: false,
    });

    if (exitCode !== 0) {
      installerFailureMessage = `GSD installer failed: ${installerStderr.trim()}`;
      result.errors.push(installerFailureMessage);
    } else {
      result.created.push('GSD commands installed via get-shit-done-cc');
    }

    // 3e. Validate installation — check sentinel files
    const helpMd = path.join(opencodeDir, 'command', 'gsd-help.md');
    if (!(await exists(helpMd))) {
      result.errors.push('gsd-help.md not found after installation — installer may have failed');
    }

    const toolsCjs = path.join(opencodeDir, 'get-shit-done', 'bin', 'gsd-tools.cjs');
    if (!(await exists(toolsCjs))) {
      result.errors.push('gsd-tools.cjs not found after installation — installer may have failed');
    }

    try {
      await ensureAutonomousGsdConfig(absDir);
      result.created.push('.planning/config.json (autonomous defaults enforced)');
    } catch (err: unknown) {
      const msg = errMsg(err);
      result.errors.push(`Failed to enforce autonomous .planning/config.json: ${msg}`);
    }
  }

  if (shouldRunInstaller && installerFailureMessage === null) {
    currentGsdState = await inspectProjectGsdState(absDir, approvedVersion);
    updateProjectGsdState(absDir, currentGsdState);
  } else if (installerFailureMessage !== null) {
    currentGsdState = {
      approvedVersion,
      installedVersion: currentGsdState.installedVersion,
      driftStatus: currentGsdState.installedVersion ? currentGsdState.driftStatus : 'unknown',
      checkedAt: new Date().toISOString(),
      error: installerFailureMessage,
    };
    updateProjectGsdState(absDir, currentGsdState);
  }

  result.gsd = {
    approvedVersion: currentGsdState.approvedVersion,
    installedVersion: currentGsdState.installedVersion,
    driftStatus: currentGsdState.driftStatus,
    error: currentGsdState.error,
  };

  // 4. Link project commands into .opencode/command/ (only for real dirs, not symlinks)
  const commandDir = path.join(opencodeDir, 'command');
  try {
    const commandDirStats = await lstat(commandDir);
    // Only link project commands when .opencode/command/ is a real directory (not a symlink)
    // Symlinked command dirs already have all commands via the GSD dir
    if (!commandDirStats.isSymbolicLink() && commandDirStats.isDirectory()) {
      const projectCommandsDir = path.join(absDir, 'commands');
      if (await isDirectory(projectCommandsDir)) {
        const commandFiles = await readdir(projectCommandsDir);
        const mdFiles = commandFiles.filter((f) => f.endsWith('.md'));
        for (const filename of mdFiles) {
          const targetPath = path.join(absDir, 'commands', filename);
          const linkPath2 = path.join(commandDir, filename);
          if (await exists(linkPath2)) {
            result.skipped.push(`${filename} (already exists in .opencode/command/)`);
          } else {
            try {
              await symlink(targetPath, linkPath2);
              result.created.push(`✓ Linked command: ${filename} → .opencode/command/${filename}`);
            } catch (err: unknown) {
              const msg = errMsg(err);
              result.errors.push(`Failed to link command ${filename}: ${msg}`);
            }
          }
        }
      }
    }
  } catch {
    // .opencode/command/ doesn't exist yet — skip project command linking
  }

  // 5. Create opencode.json (skip if either opencode.json or legacy claude.json exists)
  const configJsonPath = path.join(absDir, 'opencode.json');
  const legacyConfigPath = path.join(absDir, 'claude.json');
  if (await exists(configJsonPath)) {
    if (options?.refresh) {
      // Refresh mode: deep-merge template into existing config or force-overwrite
      try {
        if (options.force) {
          // Force mode: overwrite entirely with template
          await writeFile(configJsonPath, JSON.stringify(OPENCODE_JSON_TEMPLATE, null, 2) + '\n', 'utf8');
          result.created.push('opencode.json (force-overwritten with template)');
        } else {
          // Merge mode: add missing fields from template, preserve existing values
          const existingRaw = await readFile(configJsonPath, 'utf8');
          const existingConfig = JSON.parse(existingRaw) as Record<string, unknown>;
          const merged = deepMerge(existingConfig, OPENCODE_JSON_TEMPLATE as unknown as Record<string, unknown>);
          await writeFile(configJsonPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
          result.created.push('Merged opencode.json (added missing fields)');
        }
      } catch (err: unknown) {
        const msg = errMsg(err);
        result.errors.push(`Failed to refresh opencode.json: ${msg}`);
      }
    } else {
      result.skipped.push('opencode.json (already exists)');
    }
  } else if (await exists(legacyConfigPath)) {
    result.skipped.push('opencode.json (legacy claude.json exists — not overwriting)');
  } else {
    try {
      await writeFile(configJsonPath, JSON.stringify(OPENCODE_JSON_TEMPLATE, null, 2) + '\n', 'utf8');
      result.created.push('opencode.json');
    } catch (err: unknown) {
      const msg = errMsg(err);
      result.errors.push(`Failed to create opencode.json: ${msg}`);
    }
  }

  // 6. Update .gitignore
  const gitignorePath = path.join(absDir, '.gitignore');
  try {
    if (await exists(gitignorePath)) {
      const content = await readFile(gitignorePath, 'utf8');
      if (!content.split('\n').some((line) => line.trim() === '.opencode/')) {
        const suffix = content.endsWith('\n') ? '' : '\n';
        await writeFile(gitignorePath, content + suffix + '.opencode/\n', 'utf8');
        result.created.push('.gitignore entry for .opencode/');
      } else {
        result.skipped.push('.gitignore already contains .opencode/');
      }
    } else {
      await writeFile(gitignorePath, '.opencode/\n', 'utf8');
      result.created.push('.gitignore');
    }
  } catch (err: unknown) {
    const msg = errMsg(err);
    result.errors.push(`Failed to update .gitignore: ${msg}`);
  }

  // 7. Git init if not already a repo
  const gitDir = path.join(absDir, '.git');
  if (!(await exists(gitDir))) {
    try {
      await execa('git', ['init', '-q'], { cwd: absDir });
      result.created.push('git repository');
    } catch (err: unknown) {
      const msg = errMsg(err);
      result.errors.push(`Failed to init git: ${msg}`);
    }
  } else {
    result.skipped.push('git repository (already initialized)');
  }

  // 8. Ensure shell exposure (stable launchers in ~/.local/bin)
  try {
    const { ensureShellExposure } = await import('./shell-exposure.js');
    const exposure = await ensureShellExposure();
    for (const finding of exposure.findings) {
      if (finding.status === 'created') {
        result.created.push(`Shell launcher: ${finding.stablePath} → ${finding.resolvedTarget}`);
      } else if (finding.status === 'refreshed') {
        result.created.push(`Shell launcher refreshed: ${finding.stablePath} → ${finding.resolvedTarget}`);
      } else if (finding.status === 'fail') {
        result.errors.push(`Shell exposure: ${finding.tool} — ${finding.detail}`);
      }
      // 'pass' = already correct, skip silently
    }
  } catch (err) {
    // Shell exposure is best-effort — never fail setup over it
    result.errors.push(`Shell exposure: ${errMsg(err)}`);
  }

  return result;
}

// ── Verify ─────────────────────────────────────────────────────────────────

interface VerifyFinding {
  status: 'pass' | 'fail' | 'warn';
  label: string;
  detail: string;
}

interface VerifySetupResult {
  findings: VerifyFinding[];
  passed: number;
  failed: number;
  warnings: number;
}

/**
 * Verify an existing project setup without modifying anything.
 *
 * Checks:
 * 1. .opencode/ (or .claude/) directory exists
 * 2. Expected GSD directories (command, agents, get-shit-done) exist and are accessible
 * 3. gsd-help.md sentinel exists (confirms upstream installer ran)
 * 4. opencode.json (or claude.json) exists and is valid JSON
 */
async function verifySetup(dir: string): Promise<VerifySetupResult> {
  const absDir = path.resolve(dir);
  const findings: VerifyFinding[] = [];

  // 1. Check for config directory (.opencode/ or .claude/)
  const configDirs = ['.opencode', '.claude'];
  let foundConfigDir: string | null = null;
  let configDirName: string | null = null;

  for (const name of configDirs) {
    const configPath = path.join(absDir, name);
    if (await exists(configPath)) {
      foundConfigDir = configPath;
      configDirName = name;
      break;
    }
  }

  if (foundConfigDir === null || configDirName === null) {
    findings.push({
      status: 'fail',
      label: 'Config directory',
      detail: 'No .opencode/ or .claude/ directory found',
    });
  } else {
    findings.push({
      status: 'pass',
      label: 'Config directory',
      detail: `${configDirName}/ exists`,
    });

    // 2. Check GSD directories exist (real directories OR symlinks both valid post-migration)
    const expectedDirs = ['command', 'agents', 'get-shit-done'];

    for (const dirName of expectedDirs) {
      const dirPath = path.join(foundConfigDir, dirName);

      try {
        const dirStats = await lstat(dirPath);

        if (dirStats.isDirectory() || dirStats.isSymbolicLink()) {
          // Verify it's accessible (resolves for symlinks)
          try {
            await realpath(dirPath);
            findings.push({
              status: 'pass',
              label: `${configDirName}/${dirName}`,
              detail: 'exists',
            });
          } catch {
            findings.push({
              status: 'fail',
              label: `${configDirName}/${dirName}`,
              detail: 'broken symlink (target does not exist) — run: pilot setup --refresh',
            });
          }
        } else {
          findings.push({
            status: 'warn',
            label: `${configDirName}/${dirName}`,
            detail: 'exists but is not a directory — run: pilot setup --refresh',
          });
        }
      } catch {
        findings.push({
          status: 'fail',
          label: `${configDirName}/${dirName}`,
          detail: 'not found — run: pilot setup --refresh',
        });
      }
    }

    // 3. Check gsd-help.md sentinel (indicates upstream installer ran successfully)
    const helpMdPath = path.join(foundConfigDir, 'command', 'gsd-help.md');
    try {
      await access(helpMdPath);
      findings.push({
        status: 'pass',
        label: 'gsd-help.md',
        detail: 'GSD commands installed',
      });
    } catch {
      findings.push({
        status: 'fail',
        label: 'gsd-help.md',
        detail: 'not found — run: pilot setup --refresh',
      });
    }
  }

  // 4. Check opencode.json / claude.json
  const configFiles = ['opencode.json', 'claude.json'];
  let foundConfig = false;

  for (const configFile of configFiles) {
    const configPath = path.join(absDir, configFile);
    if (await exists(configPath)) {
      foundConfig = true;
      try {
        const content = await readFile(configPath, 'utf8');
        JSON.parse(content);
        findings.push({
          status: 'pass',
          label: configFile,
          detail: 'valid JSON',
        });
      } catch {
        findings.push({
          status: 'fail',
          label: configFile,
          detail: 'invalid JSON',
        });
      }
      break;
    }
  }

  if (!foundConfig) {
    findings.push({
      status: 'fail',
      label: 'Config file',
      detail: 'No opencode.json or claude.json found',
    });
  }

  const passed = findings.filter((f) => f.status === 'pass').length;
  const failed = findings.filter((f) => f.status === 'fail').length;
  const warnings = findings.filter((f) => f.status === 'warn').length;

  return { findings, passed, failed, warnings };
}

export { setupProject, verifySetup };
export type { SetupOptions, SetupResult, VerifySetupResult, VerifyFinding };
