/**
 * Project setup: symlinks, opencode.json, .gitignore, git init.
 *
 * Powers `pilot setup <dir>` by creating the .opencode/ directory structure
 * with symlinks to pilot-gsd resources, generating the permissive
 * opencode.json config, and ensuring .gitignore and git are set up.
 *
 * Pure core module — no UI dependencies.
 */

import { mkdir, symlink, readFile, readdir, writeFile, access, stat, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { getConfig } from './config.js';
import { errMsg } from '../util/errors.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface SetupResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * 2. .opencode/ directory with symlinks to pilot-gsd
 * 3. opencode.json with permissive permissions
 * 4. .gitignore entry for .opencode/
 * 5. git init (if not already a repo)
 *
 * Never overwrites existing opencode.json.
 */
async function setupProject(dir: string): Promise<SetupResult> {
  const config = getConfig();
  const absDir = path.resolve(dir);
  const result: SetupResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // 1. Create directory if needed
  try {
    await mkdir(absDir, { recursive: true });
  } catch (err: unknown) {
    const msg = errMsg(err);
    result.errors.push(`Failed to create directory: ${msg}`);
    return result;
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

  // 3. Create symlinks
  const symlinks: Array<{ name: string; target: string }> = [
    { name: 'command', target: path.join(config.gsdDir, 'commands') },
    { name: 'agents', target: path.join(config.gsdDir, 'agents') },
    { name: 'get-shit-done', target: path.join(config.gsdDir, 'get-shit-done') },
  ];

  for (const link of symlinks) {
    const linkPath = path.join(opencodeDir, link.name);

    // Check if target exists
    if (!(await isDirectory(link.target))) {
      result.errors.push(`Symlink target not found: ${link.target}`);
      continue;
    }

    // Check if path already exists — distinguish symlinks from real directories
    if (await exists(linkPath)) {
      try {
        const linkStats = await lstat(linkPath);
        if (linkStats.isSymbolicLink()) {
          result.skipped.push(`.opencode/${link.name}/ (already exists)`);
        } else {
          result.skipped.push(
            `.opencode/${link.name}/ exists as real directory (not symlink) — skipping to avoid data loss`,
          );
        }
      } catch {
        result.skipped.push(`.opencode/${link.name}/ (already exists)`);
      }
      continue;
    }

    try {
      await symlink(link.target, linkPath);
      result.created.push(`.opencode/${link.name}/ → ${link.target}`);
    } catch (err: unknown) {
      const msg = errMsg(err);
      result.errors.push(`Failed to create symlink .opencode/${link.name}/: ${msg}`);
    }
  }

  // 4. Create opencode.json (skip if either opencode.json or legacy claude.json exists)
  const configJsonPath = path.join(absDir, 'opencode.json');
  const legacyConfigPath = path.join(absDir, 'claude.json');
  if (await exists(configJsonPath)) {
    result.skipped.push('opencode.json (already exists)');
  } else if (await exists(legacyConfigPath)) {
    result.skipped.push('opencode.json (legacy claude.json exists — not overwriting)');
  } else {
    const opencodeConfig = {
      permission: {
        read: { '**': 'allow' },
        write: { '**': 'allow' },
        edit: { '**': 'allow' },
        bash: { '**': 'allow' },
        external_directory: { '**': 'allow' },
      },
    };
    try {
      await writeFile(configJsonPath, JSON.stringify(opencodeConfig, null, 2) + '\n', 'utf8');
      result.created.push('opencode.json');
    } catch (err: unknown) {
      const msg = errMsg(err);
      result.errors.push(`Failed to create opencode.json: ${msg}`);
    }
  }

  // 5. Update .gitignore
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

  // 6. Git init if not already a repo
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
 * 2. Expected symlinks exist AND resolve to valid targets
 * 3. Entries in config dir are symlinks (not real files/dirs)
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

    // 2. Check symlinks
    const expectedLinks = ['command', 'agents', 'get-shit-done'];

    for (const linkName of expectedLinks) {
      const linkPath = path.join(foundConfigDir, linkName);

      try {
        const linkStats = await lstat(linkPath);

        if (!linkStats.isSymbolicLink()) {
          findings.push({
            status: 'warn',
            label: `${configDirName}/${linkName}`,
            detail: 'exists as real directory/file (not a symlink)',
          });
          continue;
        }

        // Check symlink resolves
        try {
          const resolved = await realpath(linkPath);
          findings.push({
            status: 'pass',
            label: `${configDirName}/${linkName}`,
            detail: `→ ${resolved}`,
          });
        } catch {
          findings.push({
            status: 'fail',
            label: `${configDirName}/${linkName}`,
            detail: 'broken symlink (target does not exist)',
          });
        }
      } catch {
        findings.push({
          status: 'fail',
          label: `${configDirName}/${linkName}`,
          detail: 'not found',
        });
      }
    }

    // 3. Check for unexpected real files/dirs (not symlinks) in config dir
    try {
      const entries = await readdir(foundConfigDir);
      for (const entry of entries) {
        if (expectedLinks.includes(entry)) continue; // Already checked above

        const entryPath = path.join(foundConfigDir, entry);
        try {
          const entryStats = await lstat(entryPath);
          if (!entryStats.isSymbolicLink()) {
            findings.push({
              status: 'warn',
              label: `${configDirName}/${entry}`,
              detail: 'real file/directory (expected symlink or not expected at all)',
            });
          }
        } catch {
          // Can't stat — skip
        }
      }
    } catch {
      // Can't read dir — skip
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
export type { SetupResult, VerifySetupResult, VerifyFinding };
