/**
 * Unit tests for core/default-skills.ts — catalog constants, stack detection,
 * and recommendation builder.
 *
 * Uses temp directories for filesystem isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  TIER1_SKILLS,
  STACK_SKILLS,
  detectProjectStack,
  recommendDefaultSkills,
} from '../../src/core/default-skills.js';
import type { SkillRef } from '../../src/core/default-skills.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pilot-default-skills-test-'));
}

// ── Setup / Teardown ────────────────────────────────────────────────────

let projectDir: string;

beforeEach(() => {
  projectDir = makeTmpDir();
});

afterEach(() => {
  try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Catalog Constants ───────────────────────────────────────────────────

describe('Catalog constants', () => {
  it('TIER1_SKILLS has exactly 5 entries', () => {
    expect(TIER1_SKILLS).toHaveLength(5);
  });

  it('each TIER1_SKILLS entry has repo, skill and categories fields', () => {
    for (const skill of TIER1_SKILLS) {
      expect(skill).toHaveProperty('repo');
      expect(skill).toHaveProperty('skill');
      expect(skill).toHaveProperty('categories');
      expect(typeof skill.repo).toBe('string');
      expect(typeof skill.skill).toBe('string');
      expect(Array.isArray(skill.categories)).toBe(true);
      expect(skill.repo).toContain('github.com');
    }
  });

  it('TIER1_SKILLS contains expected skills', () => {
    const skillNames = TIER1_SKILLS.map(s => s.skill);
    expect(skillNames).toContain('coding-standards');
    expect(skillNames).toContain('code-reviewer');
    expect(skillNames).toContain('systematic-debugging');
    expect(skillNames).toContain('typescript');
    expect(skillNames).toContain('security-review');
  });

  it('STACK_SKILLS has entries for all 11 expected stack keys', () => {
    const expectedKeys = [
      'react', 'typescript', 'tailwind', 'cloudflare', 'hono',
      'testing', 'drizzle', 'postgres', 'docs', 'api', 'ui-design',
    ];
    for (const key of expectedKeys) {
      expect(STACK_SKILLS).toHaveProperty(key);
      expect(Array.isArray(STACK_SKILLS[key])).toBe(true);
    }
  });

  it('no duplicate skill names within TIER1_SKILLS', () => {
    const names = TIER1_SKILLS.map(s => s.skill);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no duplicate skill names within each STACK_SKILLS entry', () => {
    for (const [_key, skills] of Object.entries(STACK_SKILLS)) {
      const names = skills.map(s => s.skill);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('all STACK_SKILLS entries have valid repo, skill and categories', () => {
    for (const [_key, skills] of Object.entries(STACK_SKILLS)) {
      for (const skill of skills) {
        expect(typeof skill.repo).toBe('string');
        expect(typeof skill.skill).toBe('string');
        expect(Array.isArray(skill.categories)).toBe(true);
      }
    }
  });

  it('Cloudflare skills include deployment category', () => {
    const cloudflareSkills = STACK_SKILLS['cloudflare'];
    for (const skill of cloudflareSkills) {
      expect(skill.categories).toContain('deployment');
      expect(skill.categories).toContain('devops');
    }
  });
});

// ── detectProjectStack ──────────────────────────────────────────────────

describe('detectProjectStack', () => {
  it('returns empty items and signals for empty directory', () => {
    const result = detectProjectStack(projectDir);
    expect(result.items).toEqual([]);
    expect(result.signals).toEqual({});
  });

  it('detects react from package.json dependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('react');
    expect(result.signals['react']).toContain('package.json');
  });

  it('detects react from next dependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('react');
    expect(result.signals['react']).toContain('next');
  });

  it('detects typescript from tsconfig.json', () => {
    writeFileSync(path.join(projectDir, 'tsconfig.json'), '{}');
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('typescript');
    expect(result.signals['typescript']).toContain('tsconfig.json');
  });

  it('detects cloudflare from wrangler.toml', () => {
    writeFileSync(path.join(projectDir, 'wrangler.toml'), 'name = "test"');
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('cloudflare');
    expect(result.signals['cloudflare']).toContain('wrangler.toml');
  });

  it('detects cloudflare from wrangler.json', () => {
    writeFileSync(path.join(projectDir, 'wrangler.json'), '{}');
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('cloudflare');
    expect(result.signals['cloudflare']).toContain('wrangler.json');
  });

  it('detects testing from vitest devDependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('testing');
    expect(result.signals['testing']).toContain('vitest');
  });

  it('detects testing from jest dependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('testing');
    expect(result.signals['testing']).toContain('jest');
  });

  it('detects hono from package.json dependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { hono: '^4.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('hono');
    expect(result.signals['hono']).toContain('hono');
  });

  it('detects drizzle from drizzle-orm dependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { 'drizzle-orm': '^0.30.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('drizzle');
    expect(result.signals['drizzle']).toContain('drizzle-orm');
  });

  it('detects tailwind from tailwindcss dependency', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ devDependencies: { tailwindcss: '^3.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('tailwind');
    expect(result.signals['tailwind']).toContain('tailwindcss');
  });

  it('detects multiple signals (react + typescript + tailwind)', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { tailwindcss: '^3.0.0' },
      }),
    );
    writeFileSync(path.join(projectDir, 'tsconfig.json'), '{}');

    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('react');
    expect(result.items).toContain('typescript');
    expect(result.items).toContain('tailwind');
    expect(Object.keys(result.signals)).toHaveLength(3);
  });

  it('handles invalid/corrupt package.json gracefully', () => {
    writeFileSync(path.join(projectDir, 'package.json'), 'not valid json {{{');
    const result = detectProjectStack(projectDir);
    // Should not crash, just skip package.json signals
    expect(result.items).toEqual([]);
    expect(result.signals).toEqual({});
  });

  it('detects postgres from prisma/schema.prisma', () => {
    mkdirSync(path.join(projectDir, 'prisma'), { recursive: true });
    writeFileSync(path.join(projectDir, 'prisma', 'schema.prisma'), 'generator client {}');
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('postgres');
    expect(result.signals['postgres']).toContain('prisma');
  });

  it('detects drizzle from drizzle.config.ts when no package.json dep', () => {
    writeFileSync(path.join(projectDir, 'drizzle.config.ts'), 'export default {}');
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('drizzle');
    expect(result.signals['drizzle']).toContain('drizzle config');
  });

  it('detects @tanstack/* as react', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { '@tanstack/react-query': '^5.0.0' } }),
    );
    const result = detectProjectStack(projectDir);
    expect(result.items).toContain('react');
    expect(result.signals['react']).toContain('@tanstack');
  });
});

// ── recommendDefaultSkills ──────────────────────────────────────────────

describe('recommendDefaultSkills', () => {
  it('returns only TIER1_SKILLS when no stack detected', () => {
    const result = recommendDefaultSkills(projectDir);
    expect(result.skills).toHaveLength(5);
    for (const skill of result.skills) {
      expect(skill.tier).toBe(1);
    }
  });

  it('returns Tier 1 + Tier 2 skills when stack detected', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    const result = recommendDefaultSkills(projectDir);
    const tier1Count = result.skills.filter(s => s.tier === 1).length;
    const tier2Count = result.skills.filter(s => s.tier === 2).length;
    expect(tier1Count).toBe(5);
    expect(tier2Count).toBeGreaterThan(0);
    // React stack has 3 skills
    expect(tier2Count).toBe(3);
  });

  it('returns only Tier 1 when tier=1', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    const result = recommendDefaultSkills(projectDir, { tier: 1 });
    expect(result.skills).toHaveLength(5);
    for (const skill of result.skills) {
      expect(skill.tier).toBe(1);
    }
  });

  it('returns only detected Tier 2 when tier=2', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    const result = recommendDefaultSkills(projectDir, { tier: 2 });
    expect(result.skills.length).toBeGreaterThan(0);
    for (const skill of result.skills) {
      expect(skill.tier).toBe(2);
    }
  });

  it('returns empty Tier 2 when tier=2 and no stack detected', () => {
    const result = recommendDefaultSkills(projectDir, { tier: 2 });
    expect(result.skills).toHaveLength(0);
  });

  it('deduplicates by repo+skill key (Tier 1 wins)', () => {
    const result = recommendDefaultSkills(projectDir);
    const keys = result.skills.map(s => `${s.repo}/${s.skill}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes stackKey on Tier 2 skills', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    const result = recommendDefaultSkills(projectDir);
    const tier2 = result.skills.filter(s => s.tier === 2);
    for (const skill of tier2) {
      expect(skill.stackKey).toBe('react');
    }
  });

  it('includes detectedStack in recommendation', () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    const result = recommendDefaultSkills(projectDir);
    expect(result.detectedStack.items).toContain('react');
  });
});
