/**
 * Skill library management for Pilot.
 *
 * Manages ~/.pilot/skills/ directory: install/remove skills from GitHub,
 * tag with categories, resolve matching skills for jobs, and inject/cleanup
 * skills in project .opencode/skills/ directories before/after spawning.
 *
 * Pure core module — no UI dependencies.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
  cpSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { getConfig } from './config.js';
import type { SkillEntry, SkillManifest } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────

export const PREDEFINED_CATEGORIES = [
  'frontend', 'backend', 'api', 'database', 'devops', 'testing',
  'docs', 'ui-design', 'performance', 'security', 'prompting', 'general',
] as const;

// ── Path Helpers ──────────────────────────────────────────────────────────

/** Returns path to ~/.pilot/skills/ */
export function getSkillsDir(): string {
  return path.join(getConfig().pilotDir, 'skills');
}

/** Returns path to ~/.pilot/skills/manifest.json */
export function getManifestPath(): string {
  return path.join(getSkillsDir(), 'manifest.json');
}

// ── Manifest I/O ──────────────────────────────────────────────────────────

/**
 * Load the skills manifest.
 * Returns { version: 1, skills: [] } if file doesn't exist or is corrupt.
 */
export function loadManifest(): SkillManifest {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) {
    return { version: 1, skills: [] };
  }
  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as SkillManifest;
    if (parsed.version !== 1 || !Array.isArray(parsed.skills)) {
      return { version: 1, skills: [] };
    }
    return parsed;
  } catch {
    return { version: 1, skills: [] };
  }
}

/**
 * Save the manifest atomically (write to temp file, then rename).
 * Ensures skills dir exists first.
 */
export function saveManifest(manifest: SkillManifest): void {
  const skillsDir = getSkillsDir();
  mkdirSync(skillsDir, { recursive: true });
  const manifestPath = getManifestPath();
  const tmpPath = manifestPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
  renameSync(tmpPath, manifestPath);
}

// ── Frontmatter Parsing ──────────────────────────────────────────────────

interface FrontmatterResult {
  name: string;
  description: string;
}

/**
 * Parse SKILL.md frontmatter for name and description fields.
 * Simple line-by-line parse — no YAML library needed.
 * Returns null if frontmatter is missing or invalid.
 */
function parseFrontmatter(content: string): FrontmatterResult | null {
  const lines = content.split('\n');

  // Must start with ---
  if (lines[0]?.trim() !== '---') return null;

  let name = '';
  let description = '';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') break; // end of frontmatter

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key === 'name') name = value;
    if (key === 'description') description = value;
  }

  if (!name) return null;
  return { name, description };
}

// ── Sync Manifest ─────────────────────────────────────────────────────────

/**
 * Scan ~/.pilot/skills/ directories, read SKILL.md frontmatter from each,
 * rebuild manifest entries while PRESERVING user-assigned categories.
 * Returns the updated manifest.
 */
export function syncManifest(): SkillManifest {
  const skillsDir = getSkillsDir();
  const oldManifest = loadManifest();

  // Build a lookup of existing categories by skill name
  const existingCategories = new Map<string, string[]>();
  const existingSources = new Map<string, string>();
  for (const skill of oldManifest.skills) {
    existingCategories.set(skill.name, skill.categories);
    existingSources.set(skill.name, skill.source);
  }

  const skills: SkillEntry[] = [];

  if (!existsSync(skillsDir)) {
    const manifest: SkillManifest = { version: 1, skills };
    saveManifest(manifest);
    return manifest;
  }

  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    const manifest: SkillManifest = { version: 1, skills };
    saveManifest(manifest);
    return manifest;
  }

  for (const entry of entries) {
    if (entry === 'manifest.json') continue;

    const entryPath = path.join(skillsDir, entry);
    try {
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const skillMdPath = path.join(entryPath, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      const fm = parseFrontmatter(content);
      if (!fm) continue;

      skills.push({
        name: fm.name,
        description: fm.description,
        categories: existingCategories.get(fm.name) ?? [],
        source: existingSources.get(fm.name) ?? 'local',
        path: entryPath,
      });
    } catch {
      // Skip unreadable skills
      continue;
    }
  }

  const manifest: SkillManifest = { version: 1, skills };
  saveManifest(manifest);
  return manifest;
}

// ── List Skills ───────────────────────────────────────────────────────────

/**
 * Returns all installed SkillEntry[] from the manifest.
 */
export function listSkills(): SkillEntry[] {
  return loadManifest().skills;
}

// ── Add Skill ─────────────────────────────────────────────────────────────

interface AddSkillResult {
  installed: string[];
  skipped: string[];
  available?: string[];
}

/**
 * Parse a GitHub repo reference into owner/repo.
 * Supports: "owner/repo", "github:owner/repo", full GitHub URLs.
 */
function parseRepoRef(repoRef: string): { owner: string; repo: string } | null {
  // Strip github: prefix
  let ref = repoRef;
  if (ref.startsWith('github:')) {
    ref = ref.slice(7);
  }
  // Handle full GitHub URLs
  if (ref.startsWith('https://github.com/')) {
    ref = ref.slice('https://github.com/'.length);
  }
  if (ref.startsWith('http://github.com/')) {
    ref = ref.slice('http://github.com/'.length);
  }
  // Remove trailing .git or /
  ref = ref.replace(/\.git$/, '').replace(/\/$/, '');

  const parts = ref.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Recursively find SKILL.md files up to 2 levels deep in a directory.
 * Returns array of { name, dir } where dir is the parent directory of SKILL.md.
 */
function findSkillFiles(baseDir: string, depth = 0): Array<{ name: string; dir: string }> {
  const results: Array<{ name: string; dir: string }> = [];
  if (depth > 2) return results;

  // Check if SKILL.md exists at this level
  const skillPath = path.join(baseDir, 'SKILL.md');
  if (existsSync(skillPath)) {
    try {
      const content = readFileSync(skillPath, 'utf-8');
      const fm = parseFrontmatter(content);
      if (fm) {
        results.push({ name: fm.name, dir: baseDir });
      }
    } catch {
      // Skip unreadable
    }
  }

  // Recurse into subdirectories
  if (depth < 2) {
    try {
      const entries = readdirSync(baseDir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const entryPath = path.join(baseDir, entry);
        try {
          if (statSync(entryPath).isDirectory()) {
            results.push(...findSkillFiles(entryPath, depth + 1));
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return results;
}

/**
 * Install skill(s) from a GitHub repo reference.
 *
 * Format: "owner/repo", "github:owner/repo", or full GitHub URL.
 * Clones the repo, finds SKILL.md files, copies skill directories to
 * ~/.pilot/skills/<name>/. Does NOT overwrite existing skills.
 */
export async function addSkill(
  repoRef: string,
  options: { skill?: string; categories?: string[]; all?: boolean } = {},
): Promise<AddSkillResult> {
  const parsed = parseRepoRef(repoRef);
  if (!parsed) {
    throw new Error(`Invalid repo reference: ${repoRef}. Expected format: owner/repo`);
  }

  const { owner, repo } = parsed;
  const cloneUrl = `https://github.com/${owner}/${repo}`;
  const tmpDir = path.join(os.tmpdir(), `pilot-skill-${Date.now()}`);

  try {
    // Clone repo
    await execa('git', ['clone', '--depth', '1', cloneUrl, tmpDir], {
      timeout: 60000,
    });

    // Find all SKILL.md files
    const found = findSkillFiles(tmpDir);
    if (found.length === 0) {
      return { installed: [], skipped: [], available: [] };
    }

    // Filter by --skill if specified
    let toInstall = found;
    if (options.skill) {
      toInstall = found.filter(f => f.name === options.skill);
      if (toInstall.length === 0) {
        return { installed: [], skipped: [], available: found.map(f => f.name) };
      }
    } else if (!options.all && found.length > 1) {
      // Multiple skills found, no --skill or --all specified
      return { installed: [], skipped: [], available: found.map(f => f.name) };
    }

    const skillsDir = getSkillsDir();
    mkdirSync(skillsDir, { recursive: true });

    const installed: string[] = [];
    const skipped: string[] = [];

    for (const skill of toInstall) {
      const destDir = path.join(skillsDir, skill.name);
      if (existsSync(destDir)) {
        skipped.push(skill.name);
        continue;
      }
      // Copy skill directory
      cpSync(skill.dir, destDir, { recursive: true });
      installed.push(skill.name);
    }

    // Update manifest with new skills
    if (installed.length > 0) {
      const manifest = loadManifest();
      const source = `github:${owner}/${repo}`;
      for (const name of installed) {
        const destDir = path.join(skillsDir, name);
        const skillMdPath = path.join(destDir, 'SKILL.md');
        let description = '';
        try {
          const content = readFileSync(skillMdPath, 'utf-8');
          const fm = parseFrontmatter(content);
          if (fm) description = fm.description;
        } catch {
          // Use empty description
        }

        manifest.skills.push({
          name,
          description,
          categories: options.categories ?? [],
          source,
          path: destDir,
        });
      }
      saveManifest(manifest);
    }

    return { installed, skipped };
  } finally {
    // Clean up tmp dir
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

// ── Remove Skill ──────────────────────────────────────────────────────────

/**
 * Remove an installed skill by name.
 * Deletes ~/.pilot/skills/<name>/ and removes from manifest.
 */
export function removeSkill(name: string): { removed: boolean } {
  const skillsDir = getSkillsDir();
  const skillDir = path.join(skillsDir, name);

  const manifest = loadManifest();
  const idx = manifest.skills.findIndex(s => s.name === name);

  if (idx === -1 && !existsSync(skillDir)) {
    return { removed: false };
  }

  // Remove directory
  if (existsSync(skillDir)) {
    try {
      rmSync(skillDir, { recursive: true, force: true });
    } catch {
      // Log but continue to remove from manifest
      process.stderr.write(`Warning: failed to delete ${skillDir}\n`);
    }
  }

  // Remove from manifest
  if (idx !== -1) {
    manifest.skills.splice(idx, 1);
    saveManifest(manifest);
  }

  return { removed: true };
}

// ── Tag Skill ─────────────────────────────────────────────────────────────

/**
 * Update categories for a skill entry in the manifest.
 * Merges (union) with existing categories.
 * Returns updated SkillEntry or null if skill not found.
 */
export function tagSkill(name: string, categories: string[]): SkillEntry | null {
  const manifest = loadManifest();
  const entry = manifest.skills.find(s => s.name === name);
  if (!entry) return null;

  // Union merge: add new categories without duplicates
  const merged = new Set([...entry.categories, ...categories]);
  entry.categories = [...merged];

  saveManifest(manifest);
  return entry;
}

// ── Resolve Skills for Job ────────────────────────────────────────────────

/**
 * Given job categories, return matching SkillEntry[].
 *
 * - Universal skills (empty categories array): always included
 * - If job has no categories (null/empty): return only universal skills
 * - If job has categories: return union of universal skills + skills
 *   where ANY category overlaps
 */
export function resolveSkillsForJob(categories: string[] | null): SkillEntry[] {
  const manifest = loadManifest();

  const universal = manifest.skills.filter(s => s.categories.length === 0);

  if (!categories || categories.length === 0) {
    return universal;
  }

  const catSet = new Set(categories);
  const matched = manifest.skills.filter(
    s => s.categories.length > 0 && s.categories.some(c => catSet.has(c)),
  );

  // Deduplicate (universal + matched) by name
  const seen = new Set<string>();
  const result: SkillEntry[] = [];
  for (const skill of [...universal, ...matched]) {
    if (!seen.has(skill.name)) {
      seen.add(skill.name);
      result.push(skill);
    }
  }

  return result;
}

// ── Inject Skills ─────────────────────────────────────────────────────────

/** Tracking manifest for injected skills */
interface InjectedManifest {
  injected: string[];
}

/**
 * Copy matched skills into <projectDir>/.opencode/skills/.
 *
 * - Creates .opencode/skills/ if it doesn't exist
 * - Skips skills that already exist in the project (project skills take precedence)
 * - Writes .pilot-injected.json listing which skills were injected
 * - Returns list of names actually copied
 */
export function injectSkills(skills: SkillEntry[], projectDir: string): string[] {
  const openSkillsDir = path.join(projectDir, '.opencode', 'skills');
  mkdirSync(openSkillsDir, { recursive: true });

  const injected: string[] = [];

  for (const skill of skills) {
    const destDir = path.join(openSkillsDir, skill.name);

    // Skip if project already has this skill
    if (existsSync(destDir)) {
      continue;
    }

    try {
      // Copy only the SKILL.md file (and any other files in the skill dir)
      cpSync(skill.path, destDir, { recursive: true });
      injected.push(skill.name);
    } catch (err) {
      process.stderr.write(`Warning: failed to inject skill '${skill.name}': ${err}\n`);
    }
  }

  // Write tracking manifest
  if (injected.length > 0) {
    const manifestPath = path.join(openSkillsDir, '.pilot-injected.json');
    const manifest: InjectedManifest = { injected };
    try {
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      process.stderr.write(`Warning: failed to write injection manifest: ${err}\n`);
    }
  }

  return injected;
}

// ── Install Skills for Job (v2 JIT pattern) ──────────────────────────────

/**
 * Install matched skills for a job directly into project's .opencode/skill/ directory.
 * Uses resolveSkillsForJob() to find matching manifest entries, then runs
 * `npx skills add <repo> --skill <name> --agent opencode --yes` for each.
 *
 * This is the v2 replacement for the old injectSkills/cleanupInjectedSkills cycle.
 * Key differences from old pattern:
 * - No ~/.pilot/skills/ file cache — manifest is a pure registry
 * - Skills are installed via the `skills` CLI directly into the project
 * - `--agent opencode` ensures install to .opencode/skill/ only (not all 28 platforms)
 *
 * Returns list of skill names actually installed (skips already-present).
 */
export async function installSkillsForJob(
  categories: string[] | null,
  projectDir: string,
): Promise<string[]> {
  const resolved = resolveSkillsForJob(categories);
  if (resolved.length === 0) return [];

  const installed: string[] = [];
  for (const skill of resolved) {
    // Check if project already has this skill installed
    const destDir = path.join(projectDir, '.opencode', 'skill', skill.name);
    if (existsSync(destDir)) continue;

    try {
      await execa('npx', [
        'skills', 'add', skill.source,
        '--skill', skill.name,
        '--agent', 'opencode',
        '--yes',
      ], {
        cwd: projectDir,
        timeout: 60_000,
      });
      installed.push(skill.name);
    } catch (err) {
      process.stderr.write(`Warning: failed to install skill '${skill.name}': ${err}\n`);
    }
  }
  return installed;
}

// ── Cleanup Injected Skills ───────────────────────────────────────────────

/**
 * Remove only the skills that were injected by Pilot.
 *
 * Reads .pilot-injected.json, removes listed skill directories from
 * .opencode/skills/, then deletes the manifest file. Does NOT touch
 * any other files in .opencode/skills/.
 */
export function cleanupInjectedSkills(projectDir: string): void {
  const openSkillsDir = path.join(projectDir, '.opencode', 'skills');
  const manifestPath = path.join(openSkillsDir, '.pilot-injected.json');

  if (!existsSync(manifestPath)) return;

  let manifest: InjectedManifest;
  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as InjectedManifest;
  } catch {
    // Can't read manifest — remove the file at least
    try { rmSync(manifestPath, { force: true }); } catch { /* ignore */ }
    return;
  }

  // Remove each injected skill directory
  for (const name of manifest.injected) {
    const skillDir = path.join(openSkillsDir, name);
    try {
      rmSync(skillDir, { recursive: true, force: true });
    } catch {
      // Best effort — log to stderr but don't throw
      process.stderr.write(`Warning: failed to cleanup injected skill '${name}'\n`);
    }
  }

  // Remove the tracking manifest itself
  try {
    rmSync(manifestPath, { force: true });
  } catch {
    // Best effort
  }
}
