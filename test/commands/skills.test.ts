/**
 * Smoke tests for `pilot skills` commands — list, remove, sync, recommend, bootstrap.
 *
 * Mocks core/skills.ts, core/default-skills.ts, and output.ts to verify
 * command output without touching the filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SkillEntry, SkillManifest } from '../../src/core/types.js';
import type { Recommendation, BootstrapResult } from '../../src/core/default-skills.js';

// ── Mock core/skills.ts ─────────────────────────────────────────────────

const mockListSkills = vi.fn<() => SkillEntry[]>(() => []);
const mockRemoveSkill = vi.fn<(name: string) => { removed: boolean }>(() => ({ removed: true }));
const mockSyncManifest = vi.fn<() => SkillManifest>(() => ({ version: 1, skills: [] }));
const mockAddSkill = vi.fn();
const mockTagSkill = vi.fn();

vi.mock('../../src/core/skills.js', () => ({
  listSkills: (...args: unknown[]) => mockListSkills(...(args as [])),
  removeSkill: (...args: unknown[]) => mockRemoveSkill(...(args as [string])),
  syncManifest: (...args: unknown[]) => mockSyncManifest(...(args as [])),
  addSkill: (...args: unknown[]) => mockAddSkill(...args),
  tagSkill: (...args: unknown[]) => mockTagSkill(...args),
  PREDEFINED_CATEGORIES: [
    'frontend', 'backend', 'api', 'database', 'devops', 'testing',
    'docs', 'ui-design', 'performance', 'security', 'prompting', 'general',
  ],
}));

// ── Mock core/default-skills.ts ─────────────────────────────────────────

const mockRecommendDefaultSkills = vi.fn<(projectDir: string, options?: { tier?: 1 | 2 | 'all' }) => Recommendation>();
const mockBootstrapDefaultSkills = vi.fn<(options: { projectDir: string; yes?: boolean; tier?: 1 | 2 | 'all' }) => Promise<BootstrapResult>>();

vi.mock('../../src/core/default-skills.js', () => ({
  recommendDefaultSkills: (...args: unknown[]) => mockRecommendDefaultSkills(...(args as [string, { tier?: 1 | 2 | 'all' }?])),
  bootstrapDefaultSkills: (...args: unknown[]) => mockBootstrapDefaultSkills(...(args as [{ projectDir: string; yes?: boolean; tier?: 1 | 2 | 'all' }])),
}));

// ── Mock output.ts ──────────────────────────────────────────────────────

const outputLines: string[] = [];

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (text: string) => { outputLines.push(text); },
  outputJson: vi.fn(),
  isJsonMode: () => false,
  setJsonMode: vi.fn(),
}));

// ── Mock colors as identity functions ───────────────────────────────────

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
  magenta: (s: string) => s,
  gray: (s: string) => s,
}));

// ── Import commands after mocks ─────────────────────────────────────────

import {
  skillsAddCommand,
  skillsListCommand,
  skillsRemoveCommand,
  skillsSyncCommand,
  skillsTagCommand,
  skillsRecommendCommand,
  skillsBootstrapCommand,
} from '../../src/commands/skills.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSkill(name: string, desc: string, cats: string[] = []): SkillEntry {
  return {
    name,
    description: desc,
    categories: cats,
    source: 'github:test/repo',
    path: `/tmp/skills/${name}`,
  };
}

// ── Setup/teardown ──────────────────────────────────────────────────────

let originalProcessExit: typeof process.exit;

beforeEach(() => {
  outputLines.length = 0;
  vi.clearAllMocks();
  originalProcessExit = process.exit;
  process.exit = vi.fn(((code?: number) => { throw new Error(`process.exit(${code})`); }) as typeof process.exit);
});

afterEach(() => {
  process.exit = originalProcessExit;
});

// ── skillsListCommand ───────────────────────────────────────────────────

describe('skillsListCommand', () => {
  it('prints "No skills installed" when manifest is empty', async () => {
    mockListSkills.mockReturnValue([]);
    await skillsListCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('No skills installed');
  });

  it('prints skill names and descriptions with 2 skills', async () => {
    mockListSkills.mockReturnValue([
      makeSkill('my-linter', 'Runs eslint on files', ['testing']),
      makeSkill('react-helper', 'Helps with React components'),
    ]);

    await skillsListCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('my-linter');
    expect(joined).toContain('Runs eslint on files');
    expect(joined).toContain('react-helper');
    expect(joined).toContain('Helps with React components');
  });
});

// ── skillsRemoveCommand ─────────────────────────────────────────────────

describe('skillsRemoveCommand', () => {
  it('prints "Removed: <name>" when removeSkill returns removed: true', async () => {
    mockRemoveSkill.mockReturnValue({ removed: true });
    await skillsRemoveCommand('old-skill');

    const joined = outputLines.join('\n');
    expect(joined).toContain('Removed: old-skill');
  });

  it('calls process.exit(1) when removeSkill returns removed: false', async () => {
    mockRemoveSkill.mockReturnValue({ removed: false });

    await expect(skillsRemoveCommand('nonexistent')).rejects.toThrow('process.exit(1)');
  });
});

// ── skillsSyncCommand ───────────────────────────────────────────────────

describe('skillsSyncCommand', () => {
  it('prints sync count from manifest', async () => {
    mockSyncManifest.mockReturnValue({
      version: 1,
      skills: [
        makeSkill('a', 'desc a'),
        makeSkill('b', 'desc b'),
        makeSkill('c', 'desc c'),
      ],
    });

    await skillsSyncCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('Synced: 3 skills found');
  });

  it('prints 0 skills when manifest is empty', async () => {
    mockSyncManifest.mockReturnValue({ version: 1, skills: [] });

    await skillsSyncCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('Synced: 0 skills found');
  });
});

// ── skillsAddCommand ────────────────────────────────────────────────────

describe('skillsAddCommand', () => {
  it('rejects empty --categories input', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(skillsAddCommand('owner/repo', { categories: ',,,' })).rejects.toThrow('process.exit(1)');

    expect(mockAddSkill).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map(([line]) => line as string).join('');
    expect(stderrOutput).toContain('--categories must include at least one category');

    stderrSpy.mockRestore();
  });

  it('parses and passes valid categories to addSkill', async () => {
    mockAddSkill.mockResolvedValue({ installed: ['my-skill'], skipped: [], available: [] });

    await skillsAddCommand('owner/repo', { categories: 'frontend, testing', skill: 'my-skill' });

    expect(mockAddSkill).toHaveBeenCalledWith('owner/repo', {
      categories: ['frontend', 'testing'],
      all: undefined,
      skill: 'my-skill',
    });
  });
});

// ── skillsTagCommand ────────────────────────────────────────────────────

describe('skillsTagCommand', () => {
  it('rejects empty categories payload for required tag flow', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(skillsTagCommand('my-skill', { categories: '   ,  ' })).rejects.toThrow('process.exit(1)');

    expect(mockTagSkill).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map(([line]) => line as string).join('');
    expect(stderrOutput).toContain('--categories must include at least one category');

    stderrSpy.mockRestore();
  });

  it('parses valid categories and forwards them to tagSkill', async () => {
    mockTagSkill.mockReturnValue({
      name: 'my-skill',
      description: 'desc',
      categories: ['frontend', 'testing'],
      source: 'github:test/repo',
      path: '/tmp/skills/my-skill',
    });

    await skillsTagCommand('my-skill', { categories: 'frontend, testing' });

    expect(mockTagSkill).toHaveBeenCalledWith('my-skill', ['frontend', 'testing']);
    expect(outputLines.join('\n')).toContain('Updated my-skill categories: frontend, testing');
  });
});

// ── skillsRecommendCommand ──────────────────────────────────────────────

describe('skillsRecommendCommand', () => {
  it('shows Tier 1 skills when no stack detected', async () => {
    mockRecommendDefaultSkills.mockReturnValue({
      skills: [
        { install: 'affaan-m/coding-standards', categories: ['general'], tier: 1 },
        { install: 'Shubhamsaboo/code-reviewer', categories: ['general', 'security'], tier: 1 },
        { install: 'obra/systematic-debugging', categories: ['general'], tier: 1 },
        { install: 'lobehub/typescript', categories: ['general'], tier: 1 },
        { install: 'affaan-m/security-review', categories: ['security'], tier: 1 },
      ],
      detectedStack: { items: [], signals: {} },
    });

    await skillsRecommendCommand('/tmp/project', {});

    const joined = outputLines.join('\n');
    expect(joined).toContain('Recommended skills (5)');
    expect(joined).toContain('affaan-m/coding-standards');
    expect(joined).toContain('Shubhamsaboo/code-reviewer');
    expect(joined).toContain('Tier 1 (Universal)');
  });

  it('shows Tier 1 + Tier 2 skills when stack detected', async () => {
    mockRecommendDefaultSkills.mockReturnValue({
      skills: [
        { install: 'affaan-m/coding-standards', categories: ['general'], tier: 1 },
        { install: 'affaan-m/frontend-patterns', categories: ['frontend'], tier: 2, stackKey: 'react' },
      ],
      detectedStack: { items: ['react'], signals: { react: 'package.json dependency: react' } },
    });

    await skillsRecommendCommand('/tmp/project', {});

    const joined = outputLines.join('\n');
    expect(joined).toContain('Detected stack: React');
    expect(joined).toContain('Tier 1 (Universal)');
    expect(joined).toContain('Tier 2 (Stack-specific)');
    expect(joined).toContain('affaan-m/frontend-patterns');
    expect(joined).toContain('(react)');
  });

  it('shows "no skills" message with tier=2 and no stack', async () => {
    mockRecommendDefaultSkills.mockReturnValue({
      skills: [],
      detectedStack: { items: [], signals: {} },
    });

    await skillsRecommendCommand('/tmp/project', { tier: '2' });

    const joined = outputLines.join('\n');
    expect(joined).toContain('No skills to recommend');
  });
});

// ── skillsBootstrapCommand ──────────────────────────────────────────────

describe('skillsBootstrapCommand', () => {
  it('installs all recommended skills with --yes', async () => {
    mockRecommendDefaultSkills.mockReturnValue({
      skills: [
        { install: 'affaan-m/coding-standards', categories: ['general'], tier: 1 },
        { install: 'Shubhamsaboo/code-reviewer', categories: ['general', 'security'], tier: 1 },
        { install: 'affaan-m/frontend-patterns', categories: ['frontend'], tier: 2, stackKey: 'react' },
      ],
      detectedStack: { items: ['react'], signals: { react: 'package.json dependency: react' } },
    });

    mockBootstrapDefaultSkills.mockResolvedValue({
      attempted: 3,
      installed: 3,
      skipped: 0,
      failed: 0,
      tagged: 3,
      detectedStack: { items: ['react'], signals: {} },
      errors: [],
    });

    await skillsBootstrapCommand('/tmp/project', { yes: true });

    const joined = outputLines.join('\n');
    expect(joined).toContain('Installing 3 recommended skills');
    expect(joined).toContain('✓');
    expect(joined).toContain('affaan-m/coding-standards');
    expect(joined).toContain('Installed 3/3 skills');
    expect(mockBootstrapDefaultSkills).toHaveBeenCalledWith({
      projectDir: '/tmp/project',
      yes: true,
      tier: 'all',
    });
  });

  it('shows failure summary when some installs fail', async () => {
    mockRecommendDefaultSkills.mockReturnValue({
      skills: [
        { install: 'affaan-m/coding-standards', categories: ['general'], tier: 1 },
        { install: 'obra/systematic-debugging', categories: ['general'], tier: 1 },
      ],
      detectedStack: { items: [], signals: {} },
    });

    mockBootstrapDefaultSkills.mockResolvedValue({
      attempted: 2,
      installed: 1,
      skipped: 0,
      failed: 1,
      tagged: 1,
      detectedStack: { items: [], signals: {} },
      errors: [{ skill: 'obra/systematic-debugging', error: 'npm ERR! 404 Not Found' }],
    });

    await skillsBootstrapCommand('/tmp/project', { yes: true });

    const joined = outputLines.join('\n');
    expect(joined).toContain('⚠');
    expect(joined).toContain('obra/systematic-debugging');
    expect(joined).toContain('npm ERR! 404 Not Found');
    expect(joined).toContain('Installed 1/2 skills (1 failed)');
  });

  it('skips prompt in non-TTY without --yes', async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    mockRecommendDefaultSkills.mockReturnValue({
      skills: [
        { install: 'affaan-m/coding-standards', categories: ['general'], tier: 1 },
      ],
      detectedStack: { items: [], signals: {} },
    });

    await skillsBootstrapCommand('/tmp/project', {});

    const joined = outputLines.join('\n');
    expect(joined).toContain('Non-interactive terminal');
    expect(joined).toContain('--yes');
    expect(mockBootstrapDefaultSkills).not.toHaveBeenCalled();

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
  });
});
