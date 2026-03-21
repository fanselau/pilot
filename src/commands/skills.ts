/**
 * `pilot skills` — Manage the skill manifest (registry editor only).
 *
 * Subcommands: list, register, remove, categories, tag.
 * All operations delegate to core/skills.ts.
 *
 * No install/bootstrap/sync — the runner handles actual installation JIT.
 */

import {
  listSkills,
  registerSkill,
  unregisterSkill,
  tagSkill,
  PREDEFINED_CATEGORIES,
  CATEGORY_INFO,
  loadManifest,
} from '../core/skills.js';
import { bootstrapDefaultSkills, recommendDefaultSkills } from '../core/default-skills.js';
import { outputHuman } from '../util/output.js';
import { bold, dim, green, yellow } from '../util/colors.js';

function parseCategoriesInput(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

function exitForEmptyCategories(): never {
  process.stderr.write('Error: --categories must include at least one category (e.g. frontend,testing)\n');
  process.exit(1);
}

// ── List ──────────────────────────────────────────────────────────────────

async function skillsListCommand(): Promise<void> {
  const skills = listSkills();

  if (skills.length === 0) {
    outputHuman('No skills registered. Use: pilot skills register <repo> --skill <name> --categories <cats>');
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Registered Skills')} (${skills.length})`);
  outputHuman('');

  for (const skill of skills) {
    const name = bold(skill.name.padEnd(24));
    const desc = dim(
      skill.description.length > 50
        ? skill.description.slice(0, 50) + '…'
        : skill.description.padEnd(52),
    );
    const cats =
      skill.categories.length > 0
        ? skill.categories.join(', ')
        : dim('universal');
    const repo = dim(skill.repo);
    outputHuman(`  ${name}  ${desc}  ${cats.padEnd(20)}  ${repo}`);
  }

  outputHuman('');
}

// ── Register ─────────────────────────────────────────────────────────────

async function skillsRegisterCommand(
  repo: string,
  options: { skill: string; categories: string },
): Promise<void> {
  const categories = parseCategoriesInput(options.categories);
  if (!categories || categories.length === 0) {
    exitForEmptyCategories();
  }
  const entry = registerSkill(repo, options.skill, categories);
  outputHuman(`${green('✓')} Registered: ${entry.name} (${entry.repo})`);
  outputHuman(`  Categories: ${entry.categories.join(', ')}`);
}

// ── Remove ────────────────────────────────────────────────────────────────

async function skillsRemoveCommand(name: string): Promise<void> {
  const result = unregisterSkill(name);
  if (!result.removed) {
    process.stderr.write(`Skill not found: ${name}\n`);
    process.exit(1);
  }
  outputHuman(`Removed: ${name}`);
}

// ── Categories ────────────────────────────────────────────────────────────

async function skillsCategoriesCommand(): Promise<void> {
  const manifest = loadManifest();

  // Group skills by category
  const byCategory = new Map<string, string[]>();
  for (const skill of manifest.skills) {
    if (skill.categories.length === 0) {
      const arr = byCategory.get('universal') ?? [];
      arr.push(skill.name);
      byCategory.set('universal', arr);
    } else {
      for (const cat of skill.categories) {
        const arr = byCategory.get(cat) ?? [];
        arr.push(skill.name);
        byCategory.set(cat, arr);
      }
    }
  }

  outputHuman('');
  outputHuman(`  ${bold('Available Categories')}`);
  outputHuman('');

  for (const cat of PREDEFINED_CATEGORIES) {
    const desc = CATEGORY_INFO[cat] ?? '';
    const count = byCategory.get(cat)?.length ?? 0;
    outputHuman(`  ${cat.padEnd(16)}${desc.padEnd(52)}  ${count} skill${count !== 1 ? 's' : ''}`);
  }

  if (manifest.skills.length > 0) {
    outputHuman('');
    outputHuman(`  ${bold('Registered Skills')} (${manifest.skills.length} total)`);
    outputHuman('');
    const ordered = [...PREDEFINED_CATEGORIES as unknown as string[], 'universal'];
    for (const cat of ordered) {
      const skills = byCategory.get(cat);
      if (skills && skills.length > 0) {
        outputHuman(`  ${cat.padEnd(16)}${skills.join(', ')}`);
      }
    }
  }

  outputHuman('');
}

// ── Tag ───────────────────────────────────────────────────────────────────

async function skillsTagCommand(
  name: string,
  options: { categories: string },
): Promise<void> {
  const categories = parseCategoriesInput(options.categories);
  if (!categories || categories.length === 0) {
    exitForEmptyCategories();
  }

  const result = tagSkill(name, categories);
  if (!result) {
    process.stderr.write(`Skill not found: ${name}\n`);
    process.exit(1);
  }

  outputHuman(`Updated ${name} categories: ${result.categories.join(', ')}`);
}

// ── Seed ──────────────────────────────────────────────────────────────────

async function skillsSeedCommand(
  options: { yes?: boolean; projectDir?: string },
): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  // Preview what will be registered
  const recommendation = recommendDefaultSkills(projectDir, { tier: 'all' });
  const tier1Count = recommendation.skills.filter(s => s.tier === 1).length;
  const tier2Count = recommendation.skills.filter(s => s.tier === 2).length;
  const stackItems = recommendation.detectedStack.items;

  outputHuman('');
  outputHuman(`  ${bold('Skills Seed Preview')}`);
  outputHuman('');
  outputHuman(`  Total skills: ${recommendation.skills.length} (${tier1Count} tier-1, ${tier2Count} tier-2)`);
  if (stackItems.length > 0) {
    outputHuman(`  Detected stack: ${stackItems.join(', ')}`);
    for (const key of stackItems) {
      const signal = recommendation.detectedStack.signals[key];
      if (signal) {
        outputHuman(`    ${dim(key)}: ${dim(signal)}`);
      }
    }
  } else {
    outputHuman(`  Detected stack: ${dim('(none — only tier-1 universal skills)')}`);
  }
  outputHuman('');

  // Register all recommended skills (bootstrapDefaultSkills uses registerSkill which overwrites by name)
  const result = await bootstrapDefaultSkills({ projectDir, yes: true, tier: 'all' });

  outputHuman(`  ${green('✓')} Seeded ${result.installed} skills (${tier1Count} tier-1, ${tier2Count} tier-2). ${result.failed} failed.`);

  if (result.errors.length > 0) {
    outputHuman('');
    for (const err of result.errors) {
      outputHuman(`  ${yellow('⚠')} ${err.skill}: ${err.error}`);
    }
  }

  outputHuman('');
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  skillsListCommand,
  skillsRegisterCommand,
  skillsRemoveCommand,
  skillsCategoriesCommand,
  skillsTagCommand,
  skillsSeedCommand,
};
