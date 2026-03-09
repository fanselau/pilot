/**
 * Default skills catalog, stack detection, recommendation, and bootstrap orchestrator.
 *
 * Provides:
 * - TIER1_SKILLS: Universal coding skills installed on every project
 * - STACK_SKILLS: Stack-specific skills keyed by detected technology
 * - detectProjectStack(): Filesystem-based project stack detection
 * - recommendDefaultSkills(): Deduplicated union of Tier 1 + detected Tier 2
 * - bootstrapDefaultSkills(): Non-fatal installation via `npx skills install`
 *
 * Pure core module — no UI dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { loadManifest, syncManifest, tagSkill } from './skills.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface SkillRef {
  install: string;       // marketplace identifier: "author/skill-name"
  categories: string[];  // categories to auto-tag
}

export interface DetectedStack {
  items: string[];       // detected stack keys (e.g. ['react', 'typescript', 'tailwind'])
  signals: Record<string, string>; // what triggered each detection
}

export interface Recommendation {
  skills: Array<SkillRef & { tier: 1 | 2; stackKey?: string }>;
  detectedStack: DetectedStack;
}

export interface BootstrapResult {
  attempted: number;
  installed: number;
  skipped: number;
  failed: number;
  tagged: number;
  detectedStack: DetectedStack;
  errors: Array<{ skill: string; error: string }>;
}

// ── Tier 1: Universal Skills (always installed) ───────────────────────────

export const TIER1_SKILLS: SkillRef[] = [
  { install: 'affaan-m/coding-standards', categories: ['general'] },
  { install: 'Shubhamsaboo/code-reviewer', categories: ['general', 'security'] },
  { install: 'obra/systematic-debugging', categories: ['general'] },
  { install: 'lobehub/typescript', categories: ['general'] },
  { install: 'affaan-m/security-review', categories: ['security'] },
];

// ── Tier 2: Stack-Specific Skills ─────────────────────────────────────────

export const STACK_SKILLS: Record<string, SkillRef[]> = {
  'react': [
    { install: 'affaan-m/frontend-patterns', categories: ['frontend'] },
    { install: 'lobehub/vercel-react-best-practices', categories: ['frontend', 'performance'] },
    { install: 'anthropics/frontend-design', categories: ['frontend', 'ui-design'] },
  ],
  'typescript': [
    // Covered by Tier 1 lobehub/typescript
  ],
  'tailwind': [
    { install: 'wshobson/tailwind-design-system', categories: ['frontend', 'ui-design'] },
  ],
  'cloudflare': [
    { install: 'cloudflare/wrangler', categories: ['devops'] },
    { install: 'openclaw/cloudflare-gen', categories: ['devops'] },
  ],
  'hono': [
    { install: 'openstatusHQ/hono', categories: ['backend', 'api'] },
    { install: 'jezweb/hono-api-scaffolder', categories: ['api', 'devops'] },
  ],
  'testing': [
    { install: 'lobehub/testing', categories: ['testing'] },
    { install: 'wshobson/javascript-testing-patterns', categories: ['testing'] },
    { install: 'affaan-m/tdd-workflow', categories: ['testing'] },
  ],
  'drizzle': [
    { install: 'lobehub/drizzle', categories: ['database'] },
    { install: 'jezweb/d1-drizzle-schema', categories: ['database', 'devops'] },
  ],
  'postgres': [
    { install: 'affaan-m/postgres-patterns', categories: ['database'] },
  ],
  'docs': [
    { install: 'anthropics/doc-coauthoring', categories: ['docs'] },
    { install: 'wshobson/changelog-automation', categories: ['docs'] },
  ],
  'api': [
    { install: 'wshobson/api-design-principles', categories: ['api'] },
    { install: 'affaan-m/backend-patterns', categories: ['backend', 'api'] },
  ],
  'ui-design': [
    { install: 'calcom/web-design-guidelines', categories: ['ui-design'] },
    { install: 'wshobson/design-system-patterns', categories: ['ui-design'] },
  ],
};

// ── Stack Detection ───────────────────────────────────────────────────────

/**
 * Detect project stack from filesystem signals.
 * Only scans root-level files — no recursive traversal.
 */
export function detectProjectStack(projectDir: string): DetectedStack {
  const items: string[] = [];
  const signals: Record<string, string> = {};

  // ── package.json dependencies ──
  const pkgPath = path.join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      // React / Next.js / TanStack
      if (allDeps['react'] || allDeps['next'] || Object.keys(allDeps).some(k => k.startsWith('@tanstack/'))) {
        items.push('react');
        const trigger = allDeps['next'] ? 'next' : allDeps['react'] ? 'react' : '@tanstack/*';
        signals['react'] = `package.json dependency: ${trigger}`;
      }

      // Tailwind CSS
      if (allDeps['tailwindcss']) {
        items.push('tailwind');
        signals['tailwind'] = 'package.json dependency: tailwindcss';
      }

      // Testing frameworks
      if (allDeps['vitest'] || allDeps['jest']) {
        items.push('testing');
        const trigger = allDeps['vitest'] ? 'vitest' : 'jest';
        signals['testing'] = `package.json dependency: ${trigger}`;
      }

      // Hono
      if (allDeps['hono']) {
        items.push('hono');
        signals['hono'] = 'package.json dependency: hono';
      }

      // Drizzle
      if (allDeps['drizzle-orm'] || allDeps['drizzle-kit']) {
        items.push('drizzle');
        const trigger = allDeps['drizzle-orm'] ? 'drizzle-orm' : 'drizzle-kit';
        signals['drizzle'] = `package.json dependency: ${trigger}`;
      }
    } catch {
      // Invalid/corrupt package.json — skip gracefully
    }
  }

  // ── tsconfig.json → typescript ──
  if (existsSync(path.join(projectDir, 'tsconfig.json'))) {
    items.push('typescript');
    signals['typescript'] = 'tsconfig.json exists';
  }

  // ── wrangler.toml / wrangler.json → cloudflare ──
  if (existsSync(path.join(projectDir, 'wrangler.toml')) || existsSync(path.join(projectDir, 'wrangler.json'))) {
    items.push('cloudflare');
    const file = existsSync(path.join(projectDir, 'wrangler.toml')) ? 'wrangler.toml' : 'wrangler.json';
    signals['cloudflare'] = `${file} exists`;
  }

  // ── Prisma / Drizzle config → postgres (only if drizzle not already detected) ──
  const hasPrisma = existsSync(path.join(projectDir, 'prisma', 'schema.prisma'));
  const hasDrizzleConfig = existsSync(path.join(projectDir, 'drizzle.config.ts')) ||
    existsSync(path.join(projectDir, 'drizzle.config.js'));
  if (hasPrisma) {
    if (!items.includes('postgres')) {
      items.push('postgres');
      signals['postgres'] = 'prisma/schema.prisma exists';
    }
  }
  if (hasDrizzleConfig && !items.includes('drizzle')) {
    items.push('drizzle');
    signals['drizzle'] = 'drizzle config file exists';
  }

  // ── biome.json / .eslintrc* → informational only (not mapped to skills) ──
  // Detected but not pushed to items — informational signal

  return { items, signals };
}

// ── Recommendation Builder ────────────────────────────────────────────────

/**
 * Build a deduplicated list of recommended skills.
 * Default tier is 'all' (Tier 1 + detected Tier 2).
 */
export function recommendDefaultSkills(
  projectDir: string,
  options?: { tier?: 1 | 2 | 'all' },
): Recommendation {
  const tier = options?.tier ?? 'all';
  const detectedStack = detectProjectStack(projectDir);

  const skills: Array<SkillRef & { tier: 1 | 2; stackKey?: string }> = [];
  const seen = new Set<string>();

  // Add Tier 1 (unless tier=2)
  if (tier !== 2) {
    for (const skill of TIER1_SKILLS) {
      if (!seen.has(skill.install)) {
        seen.add(skill.install);
        skills.push({ ...skill, tier: 1 });
      }
    }
  }

  // Add Tier 2 from detected stack (unless tier=1)
  if (tier !== 1) {
    for (const stackKey of detectedStack.items) {
      const stackSkills = STACK_SKILLS[stackKey];
      if (!stackSkills) continue;
      for (const skill of stackSkills) {
        if (!seen.has(skill.install)) {
          seen.add(skill.install);
          skills.push({ ...skill, tier: 2, stackKey });
        }
      }
    }
  }

  return { skills, detectedStack };
}

// ── Concurrency Utility ───────────────────────────────────────────────────

/**
 * Run async tasks with a concurrency limit.
 * Returns PromiseSettledResult[] preserving original index order.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = [];
  let index = 0;

  async function next(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      try {
        const value = await tasks[i]();
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Bootstrap Orchestrator ────────────────────────────────────────────────

/**
 * Install recommended skills via `npx skills install`.
 * Non-fatal: continues on per-item failure.
 *
 * Runs installs concurrently (up to 5 parallel) for speed.
 * Skips already-installed skills before attempting npx install.
 * Calls syncManifest() ONCE after all installs complete (not per-install).
 * Tags all successfully installed skills after the batch sync.
 */
export async function bootstrapDefaultSkills(options: {
  projectDir: string;
  yes?: boolean;
  tier?: 1 | 2 | 'all';
}): Promise<BootstrapResult> {
  const { projectDir, tier } = options;
  const recommendation = recommendDefaultSkills(projectDir, { tier });

  const result: BootstrapResult = {
    attempted: recommendation.skills.length,
    installed: 0,
    skipped: 0,
    failed: 0,
    tagged: 0,
    detectedStack: recommendation.detectedStack,
    errors: [],
  };

  // Check which skills are already installed to skip them
  const existingManifest = loadManifest();
  const installedNames = new Set(existingManifest.skills.map(s => s.name));

  // Build install tasks for non-skipped skills, track which indices to install
  const skillsToInstall: Array<{ skill: typeof recommendation.skills[0]; index: number }> = [];
  for (let i = 0; i < recommendation.skills.length; i++) {
    const skill = recommendation.skills[i];
    const parts = skill.install.split('/');
    const shortName = parts[parts.length - 1] ?? '';
    if (installedNames.has(shortName)) {
      result.skipped++;
      continue;
    }
    skillsToInstall.push({ skill, index: i });
  }

  // Update attempted to reflect actual install attempts (excluding skipped)
  // Note: result.attempted stays as total recommended for API compatibility

  // Build thunks for concurrent execution
  const installTasks = skillsToInstall.map(({ skill }) => {
    return async (): Promise<string> => {
      await execa('npx', ['skills', 'install', skill.install], {
        timeout: 60_000,
      });
      return skill.install;
    };
  });

  // Run all installs concurrently with limit of 5
  if (installTasks.length > 0) {
    const settled = await runWithConcurrency(installTasks, 5);

    // Count results
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const { skill } = skillsToInstall[i];
      if (outcome.status === 'fulfilled') {
        result.installed++;
      } else {
        result.failed++;
        const errorMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        result.errors.push({ skill: skill.install, error: errorMsg });
      }
    }

    // Single syncManifest call after ALL installs complete
    const manifest = syncManifest();

    // Tag all successfully installed skills in one pass
    for (let i = 0; i < settled.length; i++) {
      if (settled[i].status !== 'fulfilled') continue;
      const { skill } = skillsToInstall[i];
      const skillName = findSkillNameByInstall(manifest.skills.map(s => s.name), skill.install);
      if (skillName) {
        const tagged = tagSkill(skillName, skill.categories);
        if (tagged) {
          result.tagged++;
        }
      }
    }
  } else {
    // No installs needed — still sync manifest for consistency
    syncManifest();
  }

  return result;
}

/**
 * Heuristic: derive the likely skill name from an install ID like "author/skill-name".
 * The skill directory name is typically the skill-name part of the install ID.
 * Match against available manifest names.
 */
function findSkillNameByInstall(manifestNames: string[], installId: string): string | null {
  // Extract the skill-name part (after the /)
  const parts = installId.split('/');
  const shortName = parts[parts.length - 1];
  if (!shortName) return null;

  // Exact match on short name
  if (manifestNames.includes(shortName)) {
    return shortName;
  }

  // Try case-insensitive match
  const lower = shortName.toLowerCase();
  for (const name of manifestNames) {
    if (name.toLowerCase() === lower) {
      return name;
    }
  }

  return null;
}
