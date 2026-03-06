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
import {
  recommendDefaultSkills,
  bootstrapDefaultSkills,
} from '../core/default-skills.js';
import { outputHuman } from '../util/output.js';
import { errMsg } from '../util/errors.js';
import { bold, dim, green, yellow } from '../util/colors.js';
import { createInterface } from 'node:readline';

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

// ── Recommend ─────────────────────────────────────────────────────────────

function parseTierOption(raw: string | undefined): 1 | 2 | 'all' {
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  return 'all';
}

async function skillsRecommendCommand(
  projectDir: string,
  options: { tier?: string },
): Promise<void> {
  const tier = parseTierOption(options.tier);
  const recommendation = recommendDefaultSkills(projectDir, { tier });

  if (recommendation.skills.length === 0) {
    outputHuman('No skills to recommend for this project.');
    return;
  }

  // Show detected stack
  if (recommendation.detectedStack.items.length > 0) {
    const stackNames = recommendation.detectedStack.items.map(s => s.charAt(0).toUpperCase() + s.slice(1));
    outputHuman(`Detected stack: ${stackNames.join(', ')}`);
    outputHuman('');
  }

  outputHuman(`Recommended skills (${recommendation.skills.length}):`);
  outputHuman('');

  // Group by tier
  const tier1 = recommendation.skills.filter(s => s.tier === 1);
  const tier2 = recommendation.skills.filter(s => s.tier === 2);

  if (tier1.length > 0) {
    outputHuman(`${bold('Tier 1 (Universal)')}:`);
    for (const skill of tier1) {
      const name = skill.install.padEnd(42);
      const cats = dim(skill.categories.join(', '));
      outputHuman(`  ${name}  ${cats}`);
    }
    outputHuman('');
  }

  if (tier2.length > 0) {
    outputHuman(`${bold('Tier 2 (Stack-specific)')}:`);
    for (const skill of tier2) {
      const name = skill.install.padEnd(42);
      const cats = skill.categories.join(', ').padEnd(28);
      const stackTag = skill.stackKey ? dim(`(${skill.stackKey})`) : '';
      outputHuman(`  ${name}  ${cats}  ${stackTag}`);
    }
    outputHuman('');
  }

  outputHuman(`Run ${bold('pilot skills bootstrap --yes')} to install all.`);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

async function skillsBootstrapCommand(
  projectDir: string,
  options: { yes?: boolean; tier?: string },
): Promise<void> {
  const tier = parseTierOption(options.tier);

  // Preview what will be installed
  const recommendation = recommendDefaultSkills(projectDir, { tier });

  if (recommendation.skills.length === 0) {
    outputHuman('No skills to recommend for this project.');
    return;
  }

  // Show detected stack
  if (recommendation.detectedStack.items.length > 0) {
    const stackNames = recommendation.detectedStack.items.map(s => s.charAt(0).toUpperCase() + s.slice(1));
    outputHuman(`Detected stack: ${stackNames.join(', ')}`);
    outputHuman('');
  }

  // Interactive confirmation unless --yes
  if (!options.yes) {
    if (!process.stdin.isTTY) {
      outputHuman(yellow('Non-interactive terminal detected. Use --yes for non-interactive mode.'));
      return;
    }

    const answer = await new Promise<string>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`Install ${recommendation.skills.length} recommended skills? (Y/n) `, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });

    if (answer.toLowerCase() === 'n') {
      outputHuman('Cancelled.');
      return;
    }
  }

  outputHuman(`Installing ${recommendation.skills.length} recommended skills...`);

  const result = await bootstrapDefaultSkills({ projectDir, yes: true, tier });

  // Display results per skill
  for (const skill of recommendation.skills) {
    const failed = result.errors.find(e => e.skill === skill.install);
    if (failed) {
      outputHuman(`  ${yellow('⚠')} ${skill.install} ${dim(`(failed: ${failed.error.split('\n')[0]})`)}`);
    } else {
      outputHuman(`  ${green('✓')} ${skill.install}`);
    }
  }

  outputHuman('');

  if (result.failed > 0) {
    outputHuman(`Installed ${result.installed}/${result.attempted} skills (${result.failed} failed)`);
  } else {
    outputHuman(`Installed ${result.installed}/${result.attempted} skills`);
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  skillsListCommand,
  skillsAddCommand,
  skillsRemoveCommand,
  skillsCategoriesCommand,
  skillsTagCommand,
  skillsSyncCommand,
  skillsRecommendCommand,
  skillsBootstrapCommand,
};
