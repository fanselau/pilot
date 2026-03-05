/**
 * Unit tests for core/skills.ts — resolveSkillsForJob, injectSkills, cleanupInjectedSkills.
 *
 * Uses temp directories for filesystem isolation. Mocks getConfig to point
 * pilotDir at a temp directory so manifest/skills are sandboxed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
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
  injectSkills,
  cleanupInjectedSkills,
  saveManifest,
  loadManifest,
} from '../../src/core/skills.js';
import type { SkillEntry, SkillManifest } from '../../src/core/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pilot-skills-test-'));
}

function makeSkillEntry(overrides: Partial<SkillEntry> & { name: string }): SkillEntry {
  const name = overrides.name;
  const skillPath = overrides.path ?? path.join(tmpPilotDir, 'skills', name);
  return {
    name,
    description: overrides.description ?? `${name} skill`,
    categories: overrides.categories ?? [],
    source: overrides.source ?? 'local',
    path: skillPath,
  };
}

function setupManifest(skills: SkillEntry[]): void {
  const manifest: SkillManifest = { version: 1, skills };
  saveManifest(manifest);
}

/**
 * Create a fake skill directory with SKILL.md in the temp pilot skills dir.
 */
function createFakeSkillDir(name: string, description = `${name} skill`): string {
  const skillDir = path.join(tmpPilotDir, 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: "${description}"\n---\n\n# ${name}\n\nContent here.\n`,
    'utf-8',
  );
  return skillDir;
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

// ── injectSkills ────────────────────────────────────────────────────────

describe('injectSkills', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    try {
      rmSync(projectDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('copies skill to .opencode/skills/<name>/', () => {
    const skillDir = createFakeSkillDir('my-skill');
    const skill = makeSkillEntry({ name: 'my-skill', path: skillDir });

    const result = injectSkills([skill], projectDir);

    expect(result).toEqual(['my-skill']);
    expect(existsSync(path.join(projectDir, '.opencode', 'skills', 'my-skill', 'SKILL.md'))).toBe(true);
  });

  it('writes .pilot-injected.json with list of injected names', () => {
    const skillDir = createFakeSkillDir('my-skill');
    const skill = makeSkillEntry({ name: 'my-skill', path: skillDir });

    injectSkills([skill], projectDir);

    const manifestPath = path.join(projectDir, '.opencode', 'skills', '.pilot-injected.json');
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.injected).toEqual(['my-skill']);
  });

  it('skips skills where project already has that skill directory', () => {
    const skillDir = createFakeSkillDir('existing-skill');
    const skill = makeSkillEntry({ name: 'existing-skill', path: skillDir });

    // Pre-create the skill in the project
    const projectSkillDir = path.join(projectDir, '.opencode', 'skills', 'existing-skill');
    mkdirSync(projectSkillDir, { recursive: true });
    writeFileSync(path.join(projectSkillDir, 'SKILL.md'), '# My project skill\n', 'utf-8');

    const result = injectSkills([skill], projectDir);

    expect(result).toEqual([]); // nothing injected
  });

  it('returns list of actually copied skill names only', () => {
    const dir1 = createFakeSkillDir('skill-a');
    const dir2 = createFakeSkillDir('skill-b');
    const skill1 = makeSkillEntry({ name: 'skill-a', path: dir1 });
    const skill2 = makeSkillEntry({ name: 'skill-b', path: dir2 });

    // Pre-create skill-a in project
    const existing = path.join(projectDir, '.opencode', 'skills', 'skill-a');
    mkdirSync(existing, { recursive: true });
    writeFileSync(path.join(existing, 'SKILL.md'), '# existing\n', 'utf-8');

    const result = injectSkills([skill1, skill2], projectDir);
    expect(result).toEqual(['skill-b']); // only skill-b was copied
  });
});

// ── cleanupInjectedSkills ───────────────────────────────────────────────

describe('cleanupInjectedSkills', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    try {
      rmSync(projectDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('removes injected skill directories and the manifest file', () => {
    // Set up: inject a skill
    const skillDir = createFakeSkillDir('injected-skill');
    const skill = makeSkillEntry({ name: 'injected-skill', path: skillDir });
    injectSkills([skill], projectDir);

    // Verify it was injected
    const injectedDir = path.join(projectDir, '.opencode', 'skills', 'injected-skill');
    expect(existsSync(injectedDir)).toBe(true);

    // Now cleanup
    cleanupInjectedSkills(projectDir);

    expect(existsSync(injectedDir)).toBe(false);
    expect(existsSync(path.join(projectDir, '.opencode', 'skills', '.pilot-injected.json'))).toBe(false);
  });

  it('leaves pre-existing project skills untouched', () => {
    // Pre-create a project skill
    const projectSkillDir = path.join(projectDir, '.opencode', 'skills', 'project-skill');
    mkdirSync(projectSkillDir, { recursive: true });
    writeFileSync(path.join(projectSkillDir, 'SKILL.md'), '# Project skill\n', 'utf-8');

    // Inject a different skill
    const skillDir = createFakeSkillDir('injected-skill');
    const skill = makeSkillEntry({ name: 'injected-skill', path: skillDir });
    injectSkills([skill], projectDir);

    // Cleanup
    cleanupInjectedSkills(projectDir);

    // Injected removed, project skill preserved
    expect(existsSync(path.join(projectDir, '.opencode', 'skills', 'injected-skill'))).toBe(false);
    expect(existsSync(path.join(projectDir, '.opencode', 'skills', 'project-skill', 'SKILL.md'))).toBe(true);
  });

  it('does not throw if .pilot-injected.json does not exist (idempotent)', () => {
    expect(() => cleanupInjectedSkills(projectDir)).not.toThrow();
  });

  it('is idempotent — calling twice does not throw', () => {
    const skillDir = createFakeSkillDir('temp-skill');
    const skill = makeSkillEntry({ name: 'temp-skill', path: skillDir });
    injectSkills([skill], projectDir);

    cleanupInjectedSkills(projectDir);
    // Second call — manifest and dirs already gone
    expect(() => cleanupInjectedSkills(projectDir)).not.toThrow();
  });
});
