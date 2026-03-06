/**
 * `pilot skills` — Manage the skill library for AI sessions.
 *
 * Subcommands: list, add, remove, categories, tag, sync.
 * All operations delegate to core/skills.ts.
 */

import {
  listSkills,
  addSkill,
  removeSkill,
  tagSkill,
  syncManifest,
  PREDEFINED_CATEGORIES,
} from '../core/skills.js';
import { outputHuman } from '../util/output.js';
import { errMsg } from '../util/errors.js';
import { bold, dim } from '../util/colors.js';

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
    outputHuman('No skills installed. Use: pilot skills add <github-repo>');
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Installed Skills')} (${skills.length})`);
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
    const source = dim(skill.source);
    outputHuman(`  ${name}  ${desc}  ${cats.padEnd(20)}  ${source}`);
  }

  outputHuman('');
}

// ── Add ───────────────────────────────────────────────────────────────────

async function skillsAddCommand(
  repoRef: string,
  options: { categories?: string; all?: boolean; skill?: string },
): Promise<void> {
  const categories = parseCategoriesInput(options.categories);
  if (options.categories !== undefined && (!categories || categories.length === 0)) {
    exitForEmptyCategories();
  }

  try {
    const result = await addSkill(repoRef, {
      categories,
      all: options.all,
      skill: options.skill,
    });

    // Multiple skills found, user must choose
    if (result.available && result.available.length > 0 && result.installed.length === 0) {
      outputHuman('Multiple skills found:');
      for (const name of result.available) {
        outputHuman(`  - ${name}`);
      }
      outputHuman('');
      outputHuman('Use --skill <name> or --all to install all.');
      return;
    }

    for (const name of result.installed) {
      outputHuman(`✓ Installed: ${name}`);
    }
    for (const name of result.skipped) {
      outputHuman(`  Skipped (already exists): ${name}`);
    }

    if (result.installed.length === 0 && result.skipped.length === 0) {
      outputHuman('No skills found in repository.');
    }
  } catch (err) {
    process.stderr.write(`Error: ${errMsg(err)}\n`);
    process.exit(1);
  }
}

// ── Remove ────────────────────────────────────────────────────────────────

async function skillsRemoveCommand(name: string): Promise<void> {
  const result = removeSkill(name);
  if (!result.removed) {
    process.stderr.write(`Skill not found: ${name}\n`);
    process.exit(1);
  }
  outputHuman(`Removed: ${name}`);
}

// ── Categories ────────────────────────────────────────────────────────────

async function skillsCategoriesCommand(): Promise<void> {
  const skills = listSkills();

  // Count skills per category
  const counts = new Map<string, number>();
  for (const skill of skills) {
    if (skill.categories.length === 0) {
      counts.set('universal', (counts.get('universal') ?? 0) + 1);
    } else {
      for (const cat of skill.categories) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
  }

  outputHuman('');
  outputHuman(`  ${bold('Categories')}`);
  outputHuman('');

  // Show predefined categories first
  const shown = new Set<string>();
  for (const cat of PREDEFINED_CATEGORIES) {
    const count = counts.get(cat) ?? 0;
    shown.add(cat);
    outputHuman(`  ${cat.padEnd(20)}  ${count}`);
  }

  // Show 'universal' and any custom categories
  if (!shown.has('universal')) {
    const count = counts.get('universal') ?? 0;
    outputHuman(`  ${'universal'.padEnd(20)}  ${count}`);
    shown.add('universal');
  }

  for (const [cat, count] of [...counts.entries()].sort()) {
    if (!shown.has(cat)) {
      outputHuman(`  ${cat.padEnd(20)}  ${count}`);
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

// ── Sync ──────────────────────────────────────────────────────────────────

async function skillsSyncCommand(): Promise<void> {
  const manifest = syncManifest();
  outputHuman(`Synced: ${manifest.skills.length} skills found`);
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  skillsListCommand,
  skillsAddCommand,
  skillsRemoveCommand,
  skillsCategoriesCommand,
  skillsTagCommand,
  skillsSyncCommand,
};
