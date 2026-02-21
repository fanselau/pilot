/**
 * Project setup: symlinks, opencode.json, .gitignore, git init.
 *
 * Powers `pilot setup <dir>` by creating the .opencode/ directory structure
 * with symlinks to pilot-gsd resources, generating the permissive
 * opencode.json config, and ensuring .gitignore and git are set up.
 *
 * Pure core module — no UI dependencies.
 */

import { mkdir, symlink, readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { getConfig } from './config.js';

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
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to create directory: ${msg}`);
    return result;
  }

  // 2. Create .opencode/ directory
  const opencodeDir = path.join(absDir, '.opencode');
  try {
    await mkdir(opencodeDir, { recursive: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
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

    // Check if symlink already exists
    if (await exists(linkPath)) {
      result.skipped.push(`.opencode/${link.name}/ (already exists)`);
      continue;
    }

    try {
      await symlink(link.target, linkPath);
      result.created.push(`.opencode/${link.name}/ → ${link.target}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to create symlink .opencode/${link.name}/: ${msg}`);
    }
  }

  // 4. Create opencode.json
  const claudeJsonPath = path.join(absDir, 'opencode.json');
  if (await exists(claudeJsonPath)) {
    result.skipped.push('opencode.json (already exists)');
  } else {
    const claudeConfig = {
      permissions: {
        allow: ['**'],
      },
    };
    try {
      await writeFile(claudeJsonPath, JSON.stringify(claudeConfig, null, 2) + '\n', 'utf8');
      result.created.push('opencode.json');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
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
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to update .gitignore: ${msg}`);
  }

  // 6. Git init if not already a repo
  const gitDir = path.join(absDir, '.git');
  if (!(await exists(gitDir))) {
    try {
      await execa('git', ['init', '-q'], { cwd: absDir });
      result.created.push('git repository');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to init git: ${msg}`);
    }
  } else {
    result.skipped.push('git repository (already initialized)');
  }

  return result;
}

export { setupProject };
export type { SetupResult };
