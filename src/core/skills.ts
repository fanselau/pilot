/**
 * Manifest-only skill registry for Pilot.
 *
 * No local skill cache — manifest is a pure { repo, skill, categories } registry.
 * Skills are installed JIT by the runner via `npx skills add` directly into projects.
 *
 * Pure core module — no UI dependencies.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { renameSync } from 'node:fs';
import { getConfig } from './config.js';
import type { SkillEntry, SkillManifest } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────

export const PREDEFINED_CATEGORIES = [
  'frontend', 'backend', 'api', 'database', 'devops', 'deployment',
  'testing', 'docs', 'ui-design', 'performance', 'security',
  'accessibility', 'architecture', 'prompting', 'general',
] as const;

export const CATEGORY_INFO: Record<string, string> = {
  frontend: 'React, UI components, layouts, client-side logic',
  backend: 'Server logic, workers, middleware, auth',
  api: 'REST/GraphQL endpoints, request handling, validation',
  database: 'Schema, migrations, queries, ORM (Drizzle, Prisma)',
  devops: 'CI/CD, GitHub Actions, Docker, infrastructure',
  deployment: 'Cloudflare Workers, Wrangler, Vercel, edge deploys',
  testing: 'Unit tests, E2E, vitest, playwright',
  docs: 'README, changelogs, documentation, comments',
  'ui-design': 'Design systems, Tailwind, styling, responsive',
  performance: 'Lighthouse, bundle size, caching, optimization',
  security: 'Auth, input validation, OWASP, secrets management',
  accessibility: 'WCAG, screen readers, focus management, ARIA',
  architecture: 'Component patterns, refactoring, code organization',
  prompting: 'LLM prompts, agent instructions, system prompts',
  general: 'Catch-all — coding standards, debugging, review',
};

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
 *
 * Handles backward compat: old entries with `source`/`path` fields are
 * mapped to new shape (populate `repo` from `source`, `skill` from `name`).
 */
export function loadManifest(): SkillManifest {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) {
    return { version: 1, skills: [] };
  }
  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as SkillManifest & { skills: Array<Record<string, unknown>> };
    if (parsed.version !== 1 || !Array.isArray(parsed.skills)) {
      return { version: 1, skills: [] };
    }
    // Migrate old entries that have source/path but no repo/skill
    const skills: SkillEntry[] = parsed.skills.map((entry) => {
      const e = entry as unknown as Record<string, unknown>;
      if (typeof e['repo'] === 'string' && typeof e['skill'] === 'string') {
        // Already new format
        return {
          name: String(e['name'] ?? ''),
          description: String(e['description'] ?? ''),
          categories: Array.isArray(e['categories']) ? (e['categories'] as string[]) : [],
          repo: String(e['repo']),
          skill: String(e['skill']),
        };
      }
      // Old format: migrate source → repo, name → skill
      const source = String(e['source'] ?? '');
      let repo = source;
      if (source.startsWith('github:')) {
        repo = `https://github.com/${source.slice(7)}`;
      }
      return {
        name: String(e['name'] ?? ''),
        description: String(e['description'] ?? ''),
        categories: Array.isArray(e['categories']) ? (e['categories'] as string[]) : [],
        repo,
        skill: String(e['name'] ?? ''),
      };
    });
    return { version: 1, skills };
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

// ── List Skills ───────────────────────────────────────────────────────────

/**
 * Returns all installed SkillEntry[] from the manifest.
 */
export function listSkills(): SkillEntry[] {
  return loadManifest().skills;
}

// ── Register Skill ────────────────────────────────────────────────────────

/**
 * Register a skill in the manifest (or update existing entry).
 * No git clone, no filesystem changes — manifest-only.
 */
export function registerSkill(repo: string, skill: string, categories: string[]): SkillEntry {
  const manifest = loadManifest();
  const existing = manifest.skills.find(s => s.name === skill);
  if (existing) {
    // Update existing entry
    existing.repo = repo;
    existing.categories = categories;
    saveManifest(manifest);
    return existing;
  }
  const entry: SkillEntry = { name: skill, description: '', categories, repo, skill };
  manifest.skills.push(entry);
  saveManifest(manifest);
  return entry;
}

// ── Unregister Skill ──────────────────────────────────────────────────────

/**
 * Remove a skill from the manifest by name.
 * No filesystem deletion — no local files to remove.
 */
export function unregisterSkill(name: string): { removed: boolean } {
  const manifest = loadManifest();
  const idx = manifest.skills.findIndex(s => s.name === name);
  if (idx === -1) return { removed: false };
  manifest.skills.splice(idx, 1);
  saveManifest(manifest);
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
  // Dynamic import to avoid top-level execa dependency issues
  const { execa } = await import('execa');
  const resolved = resolveSkillsForJob(categories);
  if (resolved.length === 0) return [];

  const installed: string[] = [];
  for (const skill of resolved) {
    // Check if project already has this skill installed
    const destDir = path.join(projectDir, '.opencode', 'skill', skill.name);
    if (existsSync(destDir)) continue;

    try {
      await execa('npx', [
        'skills', 'add', skill.repo,
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

// ── Cleanup Installed Skills ──────────────────────────────────────────────

/**
 * Remove skills installed by Pilot from project's .opencode/skill/ directory.
 * Deletes the entire .opencode/skill/ directory if it exists.
 * Called after job spawn completes.
 */
export function cleanupInstalledSkills(projectDir: string): void {
  const openSkillDir = path.join(projectDir, '.opencode', 'skill');
  if (!existsSync(openSkillDir)) return;

  try {
    rmSync(openSkillDir, { recursive: true, force: true });
  } catch {
    process.stderr.write(`Warning: failed to cleanup installed skills at ${openSkillDir}\n`);
  }
}

// ── Format Category Help ──────────────────────────────────────────────────

/**
 * Format the helpful error message shown when --categories is missing.
 * Lists all predefined categories with descriptions and installed skills per category.
 */
export function formatCategoryHelp(): string {
  const lines: string[] = [];
  lines.push('Error: --categories is required. Pick one or more from the list below.');
  lines.push('');
  lines.push('Available categories:');
  for (const cat of PREDEFINED_CATEGORIES) {
    const desc = CATEGORY_INFO[cat] ?? '';
    lines.push(`  ${cat.padEnd(16)}${desc}`);
  }

  const manifest = loadManifest();
  if (manifest.skills.length > 0) {
    lines.push('');
    lines.push(`Installed skills (${manifest.skills.length} total):`);
    const byCategory = new Map<string, string[]>();
    for (const s of manifest.skills) {
      if (s.categories.length === 0) {
        const arr = byCategory.get('universal') ?? [];
        arr.push(s.name);
        byCategory.set('universal', arr);
      } else {
        for (const cat of s.categories) {
          const arr = byCategory.get(cat) ?? [];
          arr.push(s.name);
          byCategory.set(cat, arr);
        }
      }
    }
    const ordered = [...PREDEFINED_CATEGORIES as unknown as string[], 'universal'];
    for (const cat of ordered) {
      const skills = byCategory.get(cat);
      if (skills && skills.length > 0) {
        lines.push(`  ${cat.padEnd(16)}${skills.join(', ')}`);
      }
    }
  }

  lines.push('');
  lines.push('Usage: pilot add <project> <req> --categories frontend,testing [--notify main]');
  lines.push('       pilot add <project> <req> --no-categories  (skip skills)');
  return lines.join('\n');
}
