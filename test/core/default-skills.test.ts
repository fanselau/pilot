/**
 * Unit tests for core/default-skills.ts — catalog constants, stack detection,
 * recommendation builder, and bootstrap orchestrator.
 *
 * Uses temp directories for filesystem isolation. Mocks getConfig to point
 * pilotDir at a temp directory. Mocks execa for bootstrap tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── Mock config ─────────────────────────────────────────────────────────

let tmpPilotDir: string;

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({
    pilotDir: tmpPilotDir,
  }),
}));

// ── Mock execa ──────────────────────────────────────────────────────────

const mockExeca = vi.fn();
vi.mock('execa', () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

// ── Mock skills.ts (loadManifest, syncManifest, tagSkill) ───────────────

const mockLoadManifest = vi.fn();
const mockSyncManifest = vi.fn();
const mockTagSkill = vi.fn();

vi.mock('../../src/core/skills.js', () => ({
  loadManifest: (...args: unknown[]) => mockLoadManifest(...args),
  syncManifest: (...args: unknown[]) => mockSyncManifest(...args),
  tagSkill: (...args: unknown[]) => mockTagSkill(...args),
}));

// Must import AFTER vi.mock
import {
  TIER1_SKILLS,
  STACK_SKILLS,
  detectProjectStack,
  recommendDefaultSkills,
  bootstrapDefaultSkills,
} from '../../src/core/default-skills.js';
import type { SkillRef } from '../../src/core/default-skills.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pilot-default-skills-test-'));
}

// ── Setup / Teardown ────────────────────────────────────────────────────

let projectDir: string;

beforeEach(() => {
  tmpPilotDir = makeTmpDir();
  projectDir = makeTmpDir();
  vi.clearAllMocks();

  // Default: loadManifest returns empty manifest (no pre-installed skills)
  mockLoadManifest.mockReturnValue({ version: 1, skills: [] });
  // Default: syncManifest returns empty manifest
  mockSyncManifest.mockReturnValue({ version: 1, skills: [] });
  mockTagSkill.mockReturnValue(null);
});

afterEach(() => {
  try { rmSync(tmpPilotDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Catalog Constants ───────────────────────────────────────────────────

describe('Catalog constants', () => {
  it('TIER1_SKILLS has exactly 5 entries', () => {
    expect(TIER1_SKILLS).toHaveLength(5);
  });

  it('each TIER1_SKILLS entry has install and categories fields', () => {
    for (const skill of TIER1_SKILLS) {
      expect(skill).toHaveProperty('install');
      expect(skill).toHaveProperty('categories');
      expect(typeof skill.install).toBe('string');
      expect(Array.isArray(skill.categories)).toBe(true);
      expect(skill.install).toContain('/');
    }
  });

  it('TIER1_SKILLS contains expected skills', () => {
    const installs = TIER1_SKILLS.map(s => s.install);
    expect(installs).toContain('affaan-m/coding-standards');
    expect(installs).toContain('Shubhamsaboo/code-reviewer');
    expect(installs).toContain('obra/systematic-debugging');
    expect(installs).toContain('lobehub/typescript');
    expect(installs).toContain('affaan-m/security-review');
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

  it('no duplicate install values within TIER1_SKILLS', () => {
    const installs = TIER1_SKILLS.map(s => s.install);
    expect(new Set(installs).size).toBe(installs.length);
  });

  it('no duplicate install values within each STACK_SKILLS entry', () => {
    for (const [key, skills] of Object.entries(STACK_SKILLS)) {
      const installs = skills.map(s => s.install);
      expect(new Set(installs).size).toBe(installs.length);
    }
  });

  it('all STACK_SKILLS entries have valid install and categories', () => {
    for (const [key, skills] of Object.entries(STACK_SKILLS)) {
      for (const skill of skills) {
        expect(typeof skill.install).toBe('string');
        expect(Array.isArray(skill.categories)).toBe(true);
      }
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

  it('deduplicates by install field (Tier 1 wins)', () => {
    // This tests that if the same install ID appears in both tiers, only one entry
    const result = recommendDefaultSkills(projectDir);
    const installs = result.skills.map(s => s.install);
    expect(new Set(installs).size).toBe(installs.length);
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

// ── bootstrapDefaultSkills ──────────────────────────────────────────────

describe('bootstrapDefaultSkills', () => {
  it('calls npx skills install for each recommended skill', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [{ name: 'coding-standards', categories: [] }] });
    mockTagSkill.mockReturnValue({ name: 'coding-standards', categories: ['general'] });

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });

    // Should attempt 5 Tier 1 skills (empty dir = no stack)
    expect(result.attempted).toBe(5);

    // Verify npx skills install called for each
    const execaCalls = mockExeca.mock.calls;
    expect(execaCalls.length).toBe(5);
    for (const call of execaCalls) {
      expect(call[0]).toBe('npx');
      expect(call[1][0]).toBe('skills');
      expect(call[1][1]).toBe('install');
    }
  });

  it('calls syncManifest once after all installs complete (batch sync)', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    await bootstrapDefaultSkills({ projectDir, yes: true });

    // Single syncManifest call after batch (not per-install)
    expect(mockSyncManifest).toHaveBeenCalledTimes(1);
  });

  it('calls tagSkill with correct categories after successful install', async () => {
    // Return a manifest that includes the skill name matching the install ID
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({
      version: 1,
      skills: [
        { name: 'coding-standards', categories: [] },
        { name: 'code-reviewer', categories: [] },
        { name: 'systematic-debugging', categories: [] },
        { name: 'typescript', categories: [] },
        { name: 'security-review', categories: [] },
      ],
    });
    mockTagSkill.mockImplementation((name: string, categories: string[]) => ({
      name, categories,
    }));

    await bootstrapDefaultSkills({ projectDir, yes: true });

    // Should call tagSkill for each successful install
    expect(mockTagSkill).toHaveBeenCalledTimes(5);

    // Verify categories match TIER1_SKILLS
    const tagCalls = mockTagSkill.mock.calls as [string, string[]][];
    const codingStandardsCall = tagCalls.find(c => c[0] === 'coding-standards');
    expect(codingStandardsCall?.[1]).toEqual(['general']);

    const codeReviewerCall = tagCalls.find(c => c[0] === 'code-reviewer');
    expect(codeReviewerCall?.[1]).toEqual(['general', 'security']);
  });

  it('continues on per-item failure', async () => {
    // First install fails, rest succeed
    mockExeca
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ stdout: '', stderr: '' });

    mockSyncManifest.mockReturnValue({
      version: 1,
      skills: [
        { name: 'code-reviewer', categories: [] },
        { name: 'systematic-debugging', categories: [] },
        { name: 'typescript', categories: [] },
        { name: 'security-review', categories: [] },
      ],
    });
    mockTagSkill.mockImplementation((name: string, categories: string[]) => ({
      name, categories,
    }));

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });

    expect(result.attempted).toBe(5);
    expect(result.installed).toBe(4);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].skill).toBe('affaan-m/coding-standards');
    expect(result.errors[0].error).toContain('Network error');

    // All 5 npx calls attempted
    expect(mockExeca).toHaveBeenCalledTimes(5);
  });

  it('returns correct counts for all successful installs', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({
      version: 1,
      skills: [
        { name: 'coding-standards', categories: [] },
        { name: 'code-reviewer', categories: [] },
        { name: 'systematic-debugging', categories: [] },
        { name: 'typescript', categories: [] },
        { name: 'security-review', categories: [] },
      ],
    });
    mockTagSkill.mockImplementation((name: string, categories: string[]) => ({
      name, categories,
    }));

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });

    expect(result.attempted).toBe(5);
    expect(result.installed).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.tagged).toBe(5);
    expect(result.errors).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });

  it('respects tier option', async () => {
    // Add a stack signal so Tier 2 would have skills
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );

    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    const result = await bootstrapDefaultSkills({ projectDir, yes: true, tier: 1 });

    // Should only attempt Tier 1
    expect(result.attempted).toBe(5);
  });

  it('includes Tier 2 skills when stack detected and tier=all', async () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );

    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    const result = await bootstrapDefaultSkills({ projectDir, yes: true, tier: 'all' });

    // 5 Tier 1 + 3 react Tier 2
    expect(result.attempted).toBe(8);
  });

  it('includes detectedStack in result', async () => {
    writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );

    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });
    expect(result.detectedStack.items).toContain('react');
  });

  it('calls final syncManifest after all installs', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    await bootstrapDefaultSkills({ projectDir, yes: true });

    // Final call after all installs
    const lastCall = mockSyncManifest.mock.calls.length;
    expect(lastCall).toBeGreaterThan(0);
  });

  it('handles all installs failing gracefully', async () => {
    mockExeca.mockRejectedValue(new Error('All failed'));

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });

    expect(result.installed).toBe(0);
    expect(result.failed).toBe(5);
    expect(result.errors).toHaveLength(5);
    // Should still call final syncManifest
    expect(mockSyncManifest).toHaveBeenCalled();
  });
});

// ── bootstrapDefaultSkills — parallel execution ─────────────────────────

describe('bootstrapDefaultSkills — parallel execution', () => {
  it('installs skills concurrently, not sequentially', async () => {
    // Track call timestamps to detect overlap
    const callTimes: Array<{ start: number; end: number }> = [];
    mockExeca.mockImplementation(() => {
      const start = Date.now();
      return new Promise(resolve => {
        setTimeout(() => {
          callTimes.push({ start, end: Date.now() });
          resolve({ stdout: '', stderr: '' });
        }, 50); // 50ms delay per install
      });
    });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    await bootstrapDefaultSkills({ projectDir, yes: true });

    // With 5 skills at 50ms each:
    // Sequential would take ~250ms
    // Parallel with limit 5 should take ~50ms
    // Verify overlap: multiple calls should start before the first one ends
    expect(callTimes.length).toBe(5);
    // Sort by start time
    callTimes.sort((a, b) => a.start - b.start);
    // The last call should start before the first call finishes
    // (indicating parallel execution, not sequential)
    expect(callTimes[callTimes.length - 1].start).toBeLessThanOrEqual(callTimes[0].end + 10);
  });

  it('calls syncManifest only once after all installs', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    await bootstrapDefaultSkills({ projectDir, yes: true });

    // Single syncManifest call — NOT one per install
    expect(mockSyncManifest).toHaveBeenCalledTimes(1);
  });

  it('skips already-installed skills', async () => {
    // Mock loadManifest to return a manifest with one skill already present
    mockLoadManifest.mockReturnValue({
      version: 1,
      skills: [{ name: 'coding-standards', categories: ['general'] }],
    });
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });

    // Should skip the already-installed skill
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    // execa should NOT be called for the already-installed skill
    // coding-standards is the first TIER1 skill — should be skipped
    const execaCalls = mockExeca.mock.calls;
    const installArgs = execaCalls.map(call => (call[1] as string[])[2]);
    expect(installArgs).not.toContain('affaan-m/coding-standards');
    // Should have called for 4 remaining skills
    expect(execaCalls.length).toBe(4);
  });

  it('tags all successfully installed skills after batch sync', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });
    mockSyncManifest.mockReturnValue({
      version: 1,
      skills: [
        { name: 'coding-standards', categories: [] },
        { name: 'code-reviewer', categories: [] },
        { name: 'systematic-debugging', categories: [] },
        { name: 'typescript', categories: [] },
        { name: 'security-review', categories: [] },
      ],
    });
    mockTagSkill.mockImplementation((name: string, categories: string[]) => ({
      name, categories,
    }));

    await bootstrapDefaultSkills({ projectDir, yes: true });

    // tagSkill should be called for each successfully installed skill
    expect(mockTagSkill).toHaveBeenCalledTimes(5);

    // All tagSkill calls should happen AFTER the single syncManifest call
    // Verify ordering: syncManifest was called once, then tagSkill 5 times
    const syncOrder = mockSyncManifest.mock.invocationCallOrder[0];
    const tagOrders = mockTagSkill.mock.invocationCallOrder;
    for (const tagOrder of tagOrders) {
      expect(tagOrder).toBeGreaterThan(syncOrder);
    }
  });

  it('handles per-skill failures without blocking others', async () => {
    // First install fails, rest succeed
    mockExeca
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ stdout: '', stderr: '' });

    mockSyncManifest.mockReturnValue({
      version: 1,
      skills: [
        { name: 'code-reviewer', categories: [] },
        { name: 'systematic-debugging', categories: [] },
        { name: 'typescript', categories: [] },
        { name: 'security-review', categories: [] },
      ],
    });
    mockTagSkill.mockImplementation((name: string, categories: string[]) => ({
      name, categories,
    }));

    const result = await bootstrapDefaultSkills({ projectDir, yes: true });

    // Some installed, some failed
    expect(result.installed).toBeGreaterThan(0);
    expect(result.failed).toBeGreaterThan(0);
    // Errors should contain the failed skill
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toContain('Network error');
  });
});
