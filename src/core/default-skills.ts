/**
 * Default skills catalog, stack detection, and recommendation builder.
 *
 * Provides:
 * - TIER1_SKILLS: Universal coding skills registered on every project
 * - STACK_SKILLS: Stack-specific skills keyed by detected technology
 * - detectProjectStack(): Filesystem-based project stack detection
 * - recommendDefaultSkills(): Deduplicated union of Tier 1 + detected Tier 2
 * - bootstrapDefaultSkills(): Register all recommended skills for a project
 *
 * Pure core module — no UI dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { registerSkill } from './skills.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface SkillRef {
  repo: string;       // e.g. 'https://github.com/anthropics/skills'
  skill: string;      // e.g. 'frontend-design' (the --skill flag)
  categories: string[];
}

export interface DetectedStack {
  items: string[];       // detected stack keys (e.g. ['react', 'typescript', 'tailwind'])
  signals: Record<string, string>; // what triggered each detection
}

export interface Recommendation {
  skills: Array<SkillRef & { tier: 1 | 2; stackKey?: string }>;
  detectedStack: DetectedStack;
}

// ── Tier 1: Universal Skills (always registered) ──────────────────────────

export const TIER1_SKILLS: SkillRef[] = [
  { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'coding-standards', categories: ['general'] },
  { repo: 'https://github.com/Shubhamsaboo/awesome-llm-apps', skill: 'code-reviewer', categories: ['general', 'security'] },
  { repo: 'https://github.com/anthropics/skills', skill: 'systematic-debugging', categories: ['general'] },
  { repo: 'https://github.com/nicepkg/aide', skill: 'typescript', categories: ['general'] },
  { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'security-review', categories: ['security'] },
];

// ── Tier 2: Stack-Specific Skills ─────────────────────────────────────────

export const STACK_SKILLS: Record<string, SkillRef[]> = {
  'react': [
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'frontend-patterns', categories: ['frontend'] },
    { repo: 'https://github.com/nicepkg/aide', skill: 'vercel-react-best-practices', categories: ['frontend', 'performance'] },
    { repo: 'https://github.com/anthropics/skills', skill: 'frontend-design', categories: ['frontend', 'ui-design'] },
  ],
  'typescript': [
    // Covered by Tier 1 typescript
  ],
  'tailwind': [
    { repo: 'https://github.com/wshobson/tailwind-design-system', skill: 'tailwind-design-system', categories: ['frontend', 'ui-design'] },
  ],
  'cloudflare': [
    { repo: 'https://github.com/cloudflare/wrangler', skill: 'wrangler', categories: ['deployment', 'devops'] },
    { repo: 'https://github.com/openclaw/cloudflare-gen', skill: 'cloudflare-gen', categories: ['deployment', 'devops'] },
  ],
  'hono': [
    { repo: 'https://github.com/openstatusHQ/hono', skill: 'hono', categories: ['backend', 'api'] },
    { repo: 'https://github.com/jezweb/hono-api-scaffolder', skill: 'hono-api-scaffolder', categories: ['api', 'devops'] },
  ],
  'testing': [
    { repo: 'https://github.com/nicepkg/aide', skill: 'testing', categories: ['testing'] },
    { repo: 'https://github.com/wshobson/javascript-testing-patterns', skill: 'javascript-testing-patterns', categories: ['testing'] },
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'tdd-workflow', categories: ['testing'] },
  ],
  'drizzle': [
    { repo: 'https://github.com/nicepkg/aide', skill: 'drizzle', categories: ['database'] },
    { repo: 'https://github.com/jezweb/d1-drizzle-schema', skill: 'd1-drizzle-schema', categories: ['database', 'devops'] },
  ],
  'postgres': [
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'postgres-patterns', categories: ['database'] },
  ],
  'docs': [
    { repo: 'https://github.com/anthropics/skills', skill: 'doc-coauthoring', categories: ['docs'] },
    { repo: 'https://github.com/wshobson/changelog-automation', skill: 'changelog-automation', categories: ['docs'] },
  ],
  'api': [
    { repo: 'https://github.com/wshobson/api-design-principles', skill: 'api-design-principles', categories: ['api'] },
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'backend-patterns', categories: ['backend', 'api'] },
  ],
  'ui-design': [
    { repo: 'https://github.com/calcom/web-design-guidelines', skill: 'web-design-guidelines', categories: ['ui-design'] },
    { repo: 'https://github.com/wshobson/design-system-patterns', skill: 'design-system-patterns', categories: ['ui-design'] },
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
      const key = `${skill.repo}/${skill.skill}`;
      if (!seen.has(key)) {
        seen.add(key);
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
        const key = `${skill.repo}/${skill.skill}`;
        if (!seen.has(key)) {
          seen.add(key);
          skills.push({ ...skill, tier: 2, stackKey });
        }
      }
    }
  }

  return { skills, detectedStack };
}

// ── Bootstrap Result ──────────────────────────────────────────────────────

export interface BootstrapResult {
  installed: number;
  attempted: number;
  failed: number;
  errors: Array<{ skill: string; error: string }>;
}

// ── Bootstrap Default Skills ──────────────────────────────────────────────

/**
 * Register all recommended skills for a project in the manifest.
 * Uses recommendDefaultSkills() to determine which skills to register,
 * then calls registerSkill() (manifest-only) for each.
 *
 * Returns counts and any errors encountered.
 */
export async function bootstrapDefaultSkills(options: {
  projectDir: string;
  yes?: boolean;
  tier?: 1 | 2 | 'all';
}): Promise<BootstrapResult> {
  const recommendation = recommendDefaultSkills(options.projectDir, { tier: options.tier });

  let installed = 0;
  let failed = 0;
  const errors: Array<{ skill: string; error: string }> = [];

  for (const s of recommendation.skills) {
    try {
      registerSkill(s.repo, s.skill, s.categories);
      installed++;
    } catch (err) {
      failed++;
      errors.push({
        skill: s.skill,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    installed,
    attempted: recommendation.skills.length,
    failed,
    errors,
  };
}
