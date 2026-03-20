/**
 * Smoke tests for `pilot skills` commands — list, register, remove, categories, tag.
 *
 * Mocks core/skills.ts and output.ts to verify
 * command output without touching the filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SkillEntry } from '../../src/core/types.js';

// ── Mock core/skills.ts ─────────────────────────────────────────────────

const mockListSkills = vi.fn<() => SkillEntry[]>(() => []);
const mockRegisterSkill = vi.fn<(repo: string, skill: string, categories: string[]) => SkillEntry>();
const mockUnregisterSkill = vi.fn<(name: string) => { removed: boolean }>(() => ({ removed: true }));
const mockTagSkill = vi.fn();
const mockLoadManifest = vi.fn(() => ({ version: 1 as const, skills: [] as SkillEntry[] }));

vi.mock('../../src/core/skills.js', () => ({
  listSkills: (...args: unknown[]) => mockListSkills(...(args as [])),
  registerSkill: (...args: unknown[]) => mockRegisterSkill(...(args as [string, string, string[]])),
  unregisterSkill: (...args: unknown[]) => mockUnregisterSkill(...(args as [string])),
  tagSkill: (...args: unknown[]) => mockTagSkill(...args),
  loadManifest: (...args: unknown[]) => mockLoadManifest(...(args as [])),
  PREDEFINED_CATEGORIES: [
    'frontend', 'backend', 'api', 'database', 'devops', 'deployment',
    'testing', 'docs', 'ui-design', 'performance', 'security',
    'accessibility', 'architecture', 'prompting', 'general',
  ],
  CATEGORY_INFO: {
    frontend: 'React, UI components, layouts, client-side logic',
    backend: 'Server logic, workers, middleware, auth',
    api: 'REST/GraphQL endpoints, request handling, validation',
    database: 'Schema, migrations, queries, ORM (Drizzle, Prisma)',
    devops: 'CI/CD, GitHub Actions, Docker, infrastructure',
    deployment: 'Cloudflare Workers, Wrangler, Vercel, edge deploys',
    testing: 'Unit tests, E2E, vitest, playwright',
    docs: 'README, changelogs, documentation, comments',
    'ui-design': 'Design systems, Tailwind, styling, responsive',
    performance: 'Lighthouse, bundle size, caching, optimization',
    security: 'Auth, input validation, OWASP, secrets management',
    accessibility: 'WCAG, screen readers, focus management, ARIA',
    architecture: 'Component patterns, refactoring, code organization',
    prompting: 'LLM prompts, agent instructions, system prompts',
    general: 'Catch-all — coding standards, debugging, review',
  },
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
  skillsListCommand,
  skillsRegisterCommand,
  skillsRemoveCommand,
  skillsCategoriesCommand,
  skillsTagCommand,
} from '../../src/commands/skills.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSkill(name: string, desc: string, cats: string[] = []): SkillEntry {
  return {
    name,
    description: desc,
    categories: cats,
    repo: 'https://github.com/test/repo',
    skill: name,
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
  it('prints "No skills" message when manifest is empty', async () => {
    mockListSkills.mockReturnValue([]);
    await skillsListCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('No skills registered');
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

// ── skillsRegisterCommand ───────────────────────────────────────────────

describe('skillsRegisterCommand', () => {
  it('registers a new skill with repo, skill, and categories', async () => {
    mockRegisterSkill.mockReturnValue({
      name: 'my-skill',
      description: '',
      categories: ['frontend', 'testing'],
      repo: 'https://github.com/owner/repo',
      skill: 'my-skill',
    });

    await skillsRegisterCommand('https://github.com/owner/repo', {
      skill: 'my-skill',
      categories: 'frontend, testing',
    });

    expect(mockRegisterSkill).toHaveBeenCalledWith(
      'https://github.com/owner/repo',
      'my-skill',
      ['frontend', 'testing'],
    );
    const joined = outputLines.join('\n');
    expect(joined).toContain('Registered: my-skill');
    expect(joined).toContain('frontend, testing');
  });

  it('rejects empty categories for register', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(
      skillsRegisterCommand('https://github.com/owner/repo', {
        skill: 'my-skill',
        categories: ',,,',
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(mockRegisterSkill).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map(([line]) => line as string).join('');
    expect(stderrOutput).toContain('--categories must include at least one category');

    stderrSpy.mockRestore();
  });
});

// ── skillsRemoveCommand ─────────────────────────────────────────────────

describe('skillsRemoveCommand', () => {
  it('prints "Removed: <name>" when unregisterSkill returns removed: true', async () => {
    mockUnregisterSkill.mockReturnValue({ removed: true });
    await skillsRemoveCommand('old-skill');

    const joined = outputLines.join('\n');
    expect(joined).toContain('Removed: old-skill');
  });

  it('calls process.exit(1) when unregisterSkill returns removed: false', async () => {
    mockUnregisterSkill.mockReturnValue({ removed: false });

    await expect(skillsRemoveCommand('nonexistent')).rejects.toThrow('process.exit(1)');
  });
});

// ── skillsCategoriesCommand ─────────────────────────────────────────────

describe('skillsCategoriesCommand', () => {
  it('shows all CATEGORY_INFO descriptions', async () => {
    mockLoadManifest.mockReturnValue({ version: 1 as const, skills: [] });

    await skillsCategoriesCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('Available Categories');
    expect(joined).toContain('React, UI components');
    expect(joined).toContain('Cloudflare Workers');
    expect(joined).toContain('WCAG');
  });

  it('shows registered skills grouped by category', async () => {
    mockLoadManifest.mockReturnValue({
      version: 1 as const,
      skills: [
        makeSkill('my-linter', 'Linter', ['testing']),
        makeSkill('react-help', 'React helper', ['frontend']),
      ],
    });

    await skillsCategoriesCommand();

    const joined = outputLines.join('\n');
    expect(joined).toContain('Registered Skills');
    expect(joined).toContain('2 total');
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
      repo: 'https://github.com/test/repo',
      skill: 'my-skill',
    });

    await skillsTagCommand('my-skill', { categories: 'frontend, testing' });

    expect(mockTagSkill).toHaveBeenCalledWith('my-skill', ['frontend', 'testing']);
    expect(outputLines.join('\n')).toContain('Updated my-skill categories: frontend, testing');
  });
});
