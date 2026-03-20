/**
 * Unit tests for core/skills.ts — manifest-only skill registry.
 *
 * Tests: CATEGORY_INFO, PREDEFINED_CATEGORIES, registerSkill, unregisterSkill,
 * formatCategoryHelp, resolveSkillsForJob.
 *
 * Uses temp directories for filesystem isolation. Mocks getConfig to point
 * pilotDir at a temp directory so manifest/skills are sandboxed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── Mock config ─────────────────────────────────────────────────────────

let tmpPilotDir: string;

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({
    pilotDir: tmpPilotDir,
  }),
}));

// Must import AFTER vi.mock
import {
  resolveSkillsForJob,
  saveManifest,
  loadManifest,
  registerSkill,
  unregisterSkill,
  formatCategoryHelp,
  PREDEFINED_CATEGORIES,
  CATEGORY_INFO,
} from '../../src/core/skills.js';
import type { SkillEntry, SkillManifest } from '../../src/core/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pilot-skills-test-'));
}

function makeSkillEntry(overrides: Partial<SkillEntry> & { name: string }): SkillEntry {
  const name = overrides.name;
  return {
    name,
    description: overrides.description ?? `${name} skill`,
    categories: overrides.categories ?? [],
    repo: overrides.repo ?? 'https://github.com/test/repo',
    skill: overrides.skill ?? name,
  };
}

function setupManifest(skills: SkillEntry[]): void {
  const manifest: SkillManifest = { version: 1, skills };
  saveManifest(manifest);
}

// ── Setup / Teardown ────────────────────────────────────────────────────

beforeEach(() => {
  tmpPilotDir = makeTmpDir();
});

afterEach(() => {
  try {
    rmSync(tmpPilotDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ── CATEGORY_INFO ────────────────────────────────────────────────────────

describe('CATEGORY_INFO', () => {
  it('has exactly 15 entries', () => {
    expect(Object.keys(CATEGORY_INFO).length).toBe(15);
  });

  it('has entries for all PREDEFINED_CATEGORIES', () => {
    for (const cat of PREDEFINED_CATEGORIES) {
      expect(CATEGORY_INFO[cat]).toBeDefined();
      expect(typeof CATEGORY_INFO[cat]).toBe('string');
      expect(CATEGORY_INFO[cat].length).toBeGreaterThan(0);
    }
  });

  it('includes new categories: deployment, accessibility, architecture', () => {
    expect(CATEGORY_INFO['deployment']).toContain('Cloudflare');
    expect(CATEGORY_INFO['accessibility']).toContain('WCAG');
    expect(CATEGORY_INFO['architecture']).toContain('Component');
  });
});

// ── PREDEFINED_CATEGORIES ────────────────────────────────────────────────

describe('PREDEFINED_CATEGORIES', () => {
  it('has 15 entries', () => {
    expect(PREDEFINED_CATEGORIES.length).toBe(15);
  });

  it('includes deployment, accessibility, architecture', () => {
    expect(PREDEFINED_CATEGORIES).toContain('deployment');
    expect(PREDEFINED_CATEGORIES).toContain('accessibility');
    expect(PREDEFINED_CATEGORIES).toContain('architecture');
  });
});

// ── registerSkill ────────────────────────────────────────────────────────

describe('registerSkill', () => {
  it('adds new skill to manifest', () => {
    const entry = registerSkill('https://github.com/test/repo', 'my-skill', ['frontend']);
    expect(entry.name).toBe('my-skill');
    expect(entry.repo).toBe('https://github.com/test/repo');
    expect(entry.skill).toBe('my-skill');
    expect(entry.categories).toEqual(['frontend']);
    const manifest = loadManifest();
    expect(manifest.skills.find(s => s.name === 'my-skill')).toBeDefined();
  });

  it('updates existing skill by name', () => {
    registerSkill('https://github.com/test/repo', 'my-skill', ['frontend']);
    const updated = registerSkill('https://github.com/test/repo2', 'my-skill', ['backend']);
    expect(updated.repo).toBe('https://github.com/test/repo2');
    expect(updated.categories).toEqual(['backend']);
  });
});

// ── unregisterSkill ──────────────────────────────────────────────────────

describe('unregisterSkill', () => {
  it('removes skill from manifest', () => {
    registerSkill('https://github.com/test/repo', 'to-remove', ['general']);
    const result = unregisterSkill('to-remove');
    expect(result.removed).toBe(true);
    expect(loadManifest().skills.find(s => s.name === 'to-remove')).toBeUndefined();
  });

  it('returns false for non-existent skill', () => {
    const result = unregisterSkill('nonexistent');
    expect(result.removed).toBe(false);
  });
});

// ── formatCategoryHelp ───────────────────────────────────────────────────

describe('formatCategoryHelp', () => {
  it('includes Available categories header', () => {
    const help = formatCategoryHelp();
    expect(help).toContain('Available categories:');
  });

  it('includes all category descriptions', () => {
    const help = formatCategoryHelp();
    expect(help).toContain('React, UI components');
    expect(help).toContain('Cloudflare Workers');
    expect(help).toContain('WCAG');
  });

  it('includes usage examples', () => {
    const help = formatCategoryHelp();
    expect(help).toContain('Usage: pilot add');
    expect(help).toContain('--no-categories');
  });

  it('shows installed skills count when manifest has entries', () => {
    registerSkill('https://github.com/test/repo', 'test-skill', ['general']);
    const help = formatCategoryHelp();
    expect(help).toContain('Installed skills (1 total)');
  });
});

// ── resolveSkillsForJob ─────────────────────────────────────────────────

describe('resolveSkillsForJob', () => {
  it('returns empty array when manifest is empty and job has no categories', () => {
    setupManifest([]);
    expect(resolveSkillsForJob(null)).toEqual([]);
  });

  it('returns universal skill (empty categories) when job has no categories', () => {
    const universal = makeSkillEntry({ name: 'linter', categories: [] });
    setupManifest([universal]);

    const result = resolveSkillsForJob(null);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('linter');
  });

  it('returns universal skill when job has categories (universal = always)', () => {
    const universal = makeSkillEntry({ name: 'linter', categories: [] });
    setupManifest([universal]);

    const result = resolveSkillsForJob(['frontend']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('linter');
  });

  it('does NOT return category-specific skill when job has no categories', () => {
    const frontend = makeSkillEntry({ name: 'react-helper', categories: ['frontend'] });
    setupManifest([frontend]);

    const result = resolveSkillsForJob(null);
    expect(result).toHaveLength(0);
  });

  it('returns category-specific skill when job categories overlap', () => {
    const frontend = makeSkillEntry({ name: 'react-helper', categories: ['frontend'] });
    setupManifest([frontend]);

    const result = resolveSkillsForJob(['frontend', 'testing']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('react-helper');
  });

  it('does NOT return skill when categories do not overlap', () => {
    const backend = makeSkillEntry({ name: 'express-helper', categories: ['backend'] });
    setupManifest([backend]);

    const result = resolveSkillsForJob(['frontend']);
    expect(result).toHaveLength(0);
  });

  it('returns matching + universal skills for mixed manifest', () => {
    const universal = makeSkillEntry({ name: 'linter', categories: [] });
    const frontend = makeSkillEntry({ name: 'react-helper', categories: ['frontend'] });
    const backend = makeSkillEntry({ name: 'express-helper', categories: ['backend'] });
    const testing = makeSkillEntry({ name: 'vitest-helper', categories: ['testing', 'frontend'] });
    setupManifest([universal, frontend, backend, testing]);

    const result = resolveSkillsForJob(['frontend']);
    const names = result.map(s => s.name);
    expect(names).toContain('linter');       // universal
    expect(names).toContain('react-helper'); // frontend match
    expect(names).toContain('vitest-helper'); // frontend match (multi-cat)
    expect(names).not.toContain('express-helper'); // backend only
  });

  it('returns empty array for empty job categories array', () => {
    const frontend = makeSkillEntry({ name: 'react-helper', categories: ['frontend'] });
    setupManifest([frontend]);

    const result = resolveSkillsForJob([]);
    expect(result).toHaveLength(0);
  });
});
