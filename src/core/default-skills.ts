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
  { repo: 'https://github.com/anthropics/skills', skill: 'webapp-testing', categories: ['testing'] },
];

// ── Tier 2: Stack-Specific Skills ─────────────────────────────────────────

export const STACK_SKILLS: Record<string, SkillRef[]> = {
  'react': [
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'frontend-patterns', categories: ['frontend'] },
    { repo: 'https://github.com/nicepkg/aide', skill: 'vercel-react-best-practices', categories: ['frontend', 'performance'] },
    { repo: 'https://github.com/anthropics/skills', skill: 'frontend-design', categories: ['frontend', 'ui-design'] },
  ],
  'tanstack': [
    { repo: 'https://github.com/deckardger/tanstack-agent-skills', skill: 'tanstack-start-best-practices', categories: ['frontend'] },
    { repo: 'https://github.com/deckardger/tanstack-agent-skills', skill: 'tanstack-query-best-practices', categories: ['frontend'] },
    { repo: 'https://github.com/deckardger/tanstack-agent-skills', skill: 'tanstack-router-best-practices', categories: ['frontend'] },
  ],
  'typescript': [
    // Covered by Tier 1 typescript
  ],
  'tailwind': [
    { repo: 'https://github.com/wshobson/tailwind-design-system', skill: 'tailwind-design-system', categories: ['frontend', 'ui-design'] },
  ],
  'shadcn': [
    { repo: 'https://github.com/shadcn/ui', skill: 'shadcn', categories: ['frontend', 'ui-design'] },
  ],
  'cloudflare': [
    { repo: 'https://github.com/cloudflare/skills', skill: 'workers-best-practices', categories: ['deployment', 'devops'] },
    { repo: 'https://github.com/cloudflare/skills', skill: 'durable-objects', categories: ['deployment', 'devops'] },
    { repo: 'https://github.com/cloudflare/wrangler', skill: 'wrangler', categories: ['deployment', 'devops'] },
  ],
  'hono': [
    { repo: 'https://github.com/openstatusHQ/hono', skill: 'hono', categories: ['backend', 'api'] },
    { repo: 'https://github.com/jezweb/hono-api-scaffolder', skill: 'hono-api-scaffolder', categories: ['api', 'devops'] },
  ],
  'testing': [
    { repo: 'https://github.com/antfu/skills', skill: 'vitest', categories: ['testing'] },
    { repo: 'https://github.com/nicepkg/aide', skill: 'testing', categories: ['testing'] },
    { repo: 'https://github.com/wshobson/javascript-testing-patterns', skill: 'javascript-testing-patterns', categories: ['testing'] },
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'tdd-workflow', categories: ['testing'] },
  ],
  'playwright': [
    { repo: 'https://github.com/currents-dev/playwright-best-practices-skill', skill: 'playwright-best-practices', categories: ['testing'] },
  ],
  'vite': [
    { repo: 'https://github.com/antfu/skills', skill: 'vite', categories: ['devops'] },
  ],
  'turborepo': [
    { repo: 'https://github.com/vercel/turborepo', skill: 'turborepo', categories: ['architecture', 'devops'] },
  ],
  'drizzle': [
    { repo: 'https://github.com/nicepkg/aide', skill: 'drizzle', categories: ['database'] },
    { repo: 'https://github.com/jezweb/d1-drizzle-schema', skill: 'd1-drizzle-schema', categories: ['database', 'devops'] },
    { repo: 'https://github.com/wshobson/agents', skill: 'database-migration', categories: ['database'] },
  ],
  'postgres': [
    { repo: 'https://github.com/affaan-m/everything-claude-code', skill: 'postgres-patterns', categories: ['database'] },
    { repo: 'https://github.com/supabase/agent-skills', skill: 'supabase-postgres-best-practices', categories: ['database'] },
    { repo: 'https://github.com/neondatabase/agent-skills', skill: 'neon-postgres', categories: ['database'] },
    { repo: 'https://github.com/wshobson/agents', skill: 'postgresql-table-design', categories: ['database'] },
  ],
  'better-auth': [
    { repo: 'https://github.com/better-auth/skills', skill: 'better-auth-best-practices', categories: ['backend', 'security'] },
  ],
  'stripe': [
    { repo: 'https://github.com/stripe/ai', skill: 'stripe-best-practices', categories: ['backend'] },
  ],
  'fastapi': [
    { repo: 'https://github.com/wshobson/agents', skill: 'fastapi-templates', categories: ['backend', 'api'] },
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
    { repo: 'https://github.com/supercent-io/skills-template', skill: 'web-accessibility', categories: ['accessibility', 'ui-design'] },
  ],
  'astro': [
    // Detected but no quality skills available yet — placeholder for future
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

      // React (from react or next dep)
      if (allDeps['react'] || allDeps['next']) {
        items.push('react');
        const trigger = allDeps['next'] ? 'next' : 'react';
        signals['react'] = `package.json dependency: ${trigger}`;
      }

      // TanStack (Router, Start, Query — also implies react)
      const tanstackKeys = Object.keys(allDeps).filter(k => k.startsWith('@tanstack/'));
      if (tanstackKeys.length > 0) {
        items.push('tanstack');
        const trigger = allDeps['@tanstack/react-start'] ? '@tanstack/react-start'
          : allDeps['@tanstack/react-router'] ? '@tanstack/react-router'
          : tanstackKeys[0];
        signals['tanstack'] = `package.json dependency: ${trigger}`;
        // TanStack implies React if not already detected
        if (!items.includes('react')) {
          items.push('react');
          signals['react'] = `inferred from ${trigger}`;
        }
      }

      // Tailwind CSS (v3 or v4)
      if (allDeps['tailwindcss'] || allDeps['@tailwindcss/vite']) {
        items.push('tailwind');
        const trigger = allDeps['@tailwindcss/vite'] ? '@tailwindcss/vite' : 'tailwindcss';
        signals['tailwind'] = `package.json dependency: ${trigger}`;
      }

      // Testing frameworks
      if (allDeps['vitest'] || allDeps['jest']) {
        items.push('testing');
        const trigger = allDeps['vitest'] ? 'vitest' : 'jest';
        signals['testing'] = `package.json dependency: ${trigger}`;
      }

      // Playwright
      if (allDeps['@playwright/test']) {
        items.push('playwright');
        signals['playwright'] = 'package.json dependency: @playwright/test';
      }

      // Hono
      if (allDeps['hono']) {
        items.push('hono');
        signals['hono'] = 'package.json dependency: hono';
      }

      // Vite (standalone — not if already detected via framework)
      if (allDeps['vite']) {
        items.push('vite');
        signals['vite'] = 'package.json dependency: vite';
      }

      // Turborepo
      if (allDeps['turbo']) {
        items.push('turborepo');
        signals['turborepo'] = 'package.json dependency: turbo';
      }

      // Drizzle
      if (allDeps['drizzle-orm'] || allDeps['drizzle-kit']) {
        items.push('drizzle');
        const trigger = allDeps['drizzle-orm'] ? 'drizzle-orm' : 'drizzle-kit';
        signals['drizzle'] = `package.json dependency: ${trigger}`;
      }

      // better-auth
      if (allDeps['better-auth']) {
        items.push('better-auth');
        signals['better-auth'] = 'package.json dependency: better-auth';
      }

      // Stripe
      if (allDeps['stripe'] || allDeps['@stripe/stripe-js']) {
        items.push('stripe');
        const trigger = allDeps['stripe'] ? 'stripe' : '@stripe/stripe-js';
        signals['stripe'] = `package.json dependency: ${trigger}`;
      }

      // FastAPI (Python — detected via pyproject.toml-style deps in package.json scripts)
      if (allDeps['fastapi']) {
        items.push('fastapi');
        signals['fastapi'] = 'package.json dependency: fastapi';
      }

      // Astro
      if (allDeps['astro']) {
        items.push('astro');
        signals['astro'] = 'package.json dependency: astro';
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

  // ── wrangler.toml / wrangler.json / wrangler.jsonc → cloudflare ──
  const wranglerFiles = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'] as const;
  const wranglerFile = wranglerFiles.find(f => existsSync(path.join(projectDir, f)));
  if (wranglerFile && !items.includes('cloudflare')) {
    items.push('cloudflare');
    signals['cloudflare'] = `${wranglerFile} exists`;
  }

  // ── components.json → shadcn ──
  if (existsSync(path.join(projectDir, 'components.json')) && !items.includes('shadcn')) {
    items.push('shadcn');
    signals['shadcn'] = 'components.json exists (shadcn/ui config)';
  }

  // ── turbo.json → turborepo (if not already detected from deps) ──
  if (existsSync(path.join(projectDir, 'turbo.json')) && !items.includes('turborepo')) {
    items.push('turborepo');
    signals['turborepo'] = 'turbo.json exists';
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

  // ── pyproject.toml → fastapi (Python projects) ──
  if (existsSync(path.join(projectDir, 'pyproject.toml')) && !items.includes('fastapi')) {
    try {
      const pyproj = readFileSync(path.join(projectDir, 'pyproject.toml'), 'utf-8');
      if (pyproj.includes('fastapi')) {
        items.push('fastapi');
        signals['fastapi'] = 'pyproject.toml contains fastapi';
      }
    } catch {
      // skip
    }
  }

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
