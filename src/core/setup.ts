/**
 * Project setup: symlinks, claude.json, .gitignore, git init.
 *
 * Powers `pilot setup <dir>` by creating the .claude/ directory structure
 * with symlinks to pilot-gsd resources, generating the permissive
 * claude.json config, and ensuring .gitignore and git are set up.
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
 * 2. .claude/ directory with symlinks to pilot-gsd
 * 3. claude.json with permissive permissions
 * 4. .gitignore entry for .claude/
 * 5. git init (if not already a repo)
 *
 * Never overwrites existing claude.json.
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

  // 2. Create .claude/ directory
  const claudeDir = path.join(absDir, '.claude');
  try {
    await mkdir(claudeDir, { recursive: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to create .claude/: ${msg}`);
    return result;
  }

  // 3. Create symlinks
  const symlinks: Array<{ name: string; target: string }> = [
    { name: 'command', target: path.join(config.gsdDir, 'commands') },
    { name: 'agents', target: path.join(config.gsdDir, 'agents') },
    { name: 'get-shit-done', target: path.join(config.gsdDir, 'get-shit-done') },
  ];

  for (const link of symlinks) {
    const linkPath = path.join(claudeDir, link.name);

    // Check if target exists
    if (!(await isDirectory(link.target))) {
      result.errors.push(`Symlink target not found: ${link.target}`);
      continue;
    }

    // Check if symlink already exists
    if (await exists(linkPath)) {
      result.skipped.push(`.claude/${link.name}/ (already exists)`);
      continue;
    }

    try {
      await symlink(link.target, linkPath);
      result.created.push(`.claude/${link.name}/ → ${link.target}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to create symlink .claude/${link.name}/: ${msg}`);
    }
  }

  // 4. Create claude.json
  const claudeJsonPath = path.join(absDir, 'claude.json');
  if (await exists(claudeJsonPath)) {
    result.skipped.push('claude.json (already exists)');
  } else {
    const claudeConfig = {
      permissions: {
        allow: ['**'],
      },
    };
    try {
      await writeFile(claudeJsonPath, JSON.stringify(claudeConfig, null, 2) + '\n', 'utf8');
      result.created.push('claude.json');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to create claude.json: ${msg}`);
    }
  }

  // 5. Update .gitignore
  const gitignorePath = path.join(absDir, '.gitignore');
  try {
    if (await exists(gitignorePath)) {
      const content = await readFile(gitignorePath, 'utf8');
      if (!content.split('\n').some((line) => line.trim() === '.claude/')) {
        const suffix = content.endsWith('\n') ? '' : '\n';
        await writeFile(gitignorePath, content + suffix + '.claude/\n', 'utf8');
        result.created.push('.gitignore entry for .claude/');
      } else {
        result.skipped.push('.gitignore already contains .claude/');
      }
    } else {
      await writeFile(gitignorePath, '.claude/\n', 'utf8');
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
