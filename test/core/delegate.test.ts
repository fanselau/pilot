import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

// ── Mock state ─────────────────────────────────────────────────────────────

// Sentinel value: when set, readFileSync throws ENOENT for ROADMAP.md
const THROW_ENOENT = '__THROW_ENOENT__';
const THROW_READDIRSYNC = '__THROW_READDIRSYNC__';

let mockRoadmapContent: string = '';
let mockRoadmapExists = true;
let mockPhaseDirs: string[] = [];
let mockRequirementDirFiles: string[] = [];
let mockRequirementIsDir = false;
// Map of requirement file path → content (for extractRequirementTitle mock)
let mockRequirementFileContent: Record<string, string> = {};

// ── Mock node:fs ───────────────────────────────────────────────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: string) => {
      if (typeof filePath === 'string' && filePath.includes('ROADMAP.md')) {
        if (mockRoadmapContent === THROW_ENOENT) {
          const err = new Error('ENOENT: no such file or directory');
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        return mockRoadmapContent;
      }
      // Requirement file reads (for extractRequirementTitle)
      if (typeof filePath === 'string' && filePath in mockRequirementFileContent) {
        return mockRequirementFileContent[filePath];
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
    existsSync: vi.fn((filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('ROADMAP.md')) {
        return mockRoadmapExists;
      }
      return actual.existsSync(filePath);
    }),
    readdirSync: vi.fn((dirPath: string) => {
      if (typeof dirPath === 'string' && dirPath.includes('.planning/phases')) {
        if (mockPhaseDirs as unknown === THROW_READDIRSYNC) {
          const err = new Error('ENOENT: no such file or directory');
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        return mockPhaseDirs;
      }
      // Requirement directory reads
      if (typeof dirPath === 'string' && dirPath.includes('requirements')) {
        return mockRequirementDirFiles;
      }
      return actual.readdirSync(dirPath);
    }),
    statSync: vi.fn((filePath: string) => {
      // For requirement paths in buildMilestonePlan
      if (typeof filePath === 'string' && filePath.includes('requirements')) {
        return {
          isDirectory: () => mockRequirementIsDir,
          isFile: () => !mockRequirementIsDir,
        };
      }
      return actual.statSync(filePath);
    }),
  };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────

import {
  parseDelegationOutput,
  resolvePhaseForFallback,
  fallbackPlan,
  buildNewProjectArgs,
  buildQuickArgs,
  buildPhaseArgs,
  getNextPhaseNumber,
  buildMilestonePlan,
  extractRequirementTitle,
  matchesBlocklist,
  GSD_INSTRUCTION_BLOCKLIST,
} from '../../src/core/delegate.js';

// ── Test helpers ───────────────────────────────────────────────────────────

function makeTestJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'test-project',
    scope: 'phase',
    description: 'Add dark mode support',
    requirementPath: null,
    status: 'pending',
    priority: 0,
    dependsOn: null,
    createdAt: '2026-02-22T00:00:00Z',
    startedAt: null,
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('parseDelegationOutput', () => {
  it('parses JSON from markdown code block', () => {
    const content = '```json\n{"steps":[{"command":"quick","args":"Fix the bug"}],"reasoning":"Quick task"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
    expect(plan.steps[0].args).toBe('Fix the bug');
    expect(plan.reasoning).toBe('Quick task');
  });

  it('parses raw JSON without code block', () => {
    const content = '{"steps":[{"command":"add-phase","args":"Dark mode"}],"reasoning":"Phase 17"}';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('Dark mode');
    expect(plan.reasoning).toBe('Phase 17');
  });

  it('parses multi-step phase plan', () => {
    const content = '```json\n{"steps":[{"command":"add-phase","args":"Add OAuth"},{"command":"plan-phase","args":"17 --auto"},{"command":"execute-phase","args":"17"},{"command":"verify-phase","args":"17"}],"reasoning":"Adding as phase 17"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps.map(s => s.command)).toEqual([
      'add-phase',
      'plan-phase',
      'execute-phase',
      'verify-phase',
    ]);
    expect(plan.steps[1].args).toBe('17 --auto');
    expect(plan.reasoning).toBe('Adding as phase 17');
  });

  it('throws on empty steps', () => {
    const content = '{"steps":[],"reasoning":"Nothing to do"}';
    expect(() => parseDelegationOutput(content)).toThrow('no steps');
  });

  it('throws on invalid JSON', () => {
    const content = 'This is not JSON at all';
    expect(() => parseDelegationOutput(content)).toThrow('Failed to parse');
  });

  it('throws on malformed step (missing command)', () => {
    const content = '{"steps":[{"args":"something"}],"reasoning":"Bad"}';
    expect(() => parseDelegationOutput(content)).toThrow('missing command or args');
  });

  it('throws on malformed step (missing args)', () => {
    const content = '{"steps":[{"command":"quick"}],"reasoning":"Bad"}';
    expect(() => parseDelegationOutput(content)).toThrow('missing command or args');
  });

  it('handles missing reasoning gracefully', () => {
    const content = '{"steps":[{"command":"quick","args":"Fix it"}]}';
    const plan = parseDelegationOutput(content);
    expect(plan.reasoning).toBe('');
    expect(plan.steps).toHaveLength(1);
  });

  it('handles surrounding text before/after JSON block', () => {
    const content = 'Here is the plan:\n\n```json\n{"steps":[{"command":"quick","args":"Do thing"}],"reasoning":"Simple"}\n```\n\nDone.';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
    expect(plan.steps[0].args).toBe('Do thing');
    expect(plan.reasoning).toBe('Simple');
  });

  it('parses milestone new-project step', () => {
    const content = '```json\n{"steps":[{"command":"new-project","args":"--auto Build a CRM tool"}],"reasoning":"New project, initializing with milestone scope"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[0].args).toBe('--auto Build a CRM tool');
  });

  it('parses milestone new-milestone step for existing project', () => {
    const content = '{"steps":[{"command":"new-milestone","args":"v2.0"}],"reasoning":"Existing project, creating new milestone"}';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-milestone');
    expect(plan.steps[0].args).toBe('v2.0');
  });

  it('throws when steps is not an array', () => {
    const content = '{"steps":"not-an-array","reasoning":"Bad"}';
    expect(() => parseDelegationOutput(content)).toThrow('no steps');
  });

  it('handles JSON with extra whitespace in code block', () => {
    const content = '```json\n  {\n    "steps": [\n      { "command": "quick", "args": "Fix bug" }\n    ],\n    "reasoning": "Formatted JSON"\n  }\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
  });
});

describe('getNextPhaseNumber', () => {
  beforeEach(() => {
    mockPhaseDirs = [];
  });

  it('returns 1 when phases dir is empty', () => {
    mockPhaseDirs = [];
    expect(getNextPhaseNumber('/tmp/project/.planning/phases')).toBe(1);
  });

  it('returns max+1 from existing dirs', () => {
    mockPhaseDirs = ['01-setup', '02-core', '03-ui'];
    expect(getNextPhaseNumber('/tmp/project/.planning/phases')).toBe(4);
  });

  it('handles gaps in phase numbering', () => {
    mockPhaseDirs = ['01-setup', '05-deploy', '10-testing'];
    expect(getNextPhaseNumber('/tmp/project/.planning/phases')).toBe(11);
  });

  it('ignores non-phase entries', () => {
    mockPhaseDirs = ['README.md', '01-setup', 'notes'];
    expect(getNextPhaseNumber('/tmp/project/.planning/phases')).toBe(2);
  });

  it('handles unpadded phase numbers', () => {
    mockPhaseDirs = ['1-setup', '2-core'];
    expect(getNextPhaseNumber('/tmp/project/.planning/phases')).toBe(3);
  });

  it('returns 1 when dir does not exist', () => {
    mockPhaseDirs = THROW_READDIRSYNC as unknown as string[];
    expect(getNextPhaseNumber('/nonexistent/.planning/phases')).toBe(1);
  });
});

describe('resolvePhaseForFallback', () => {
  beforeEach(() => {
    mockRoadmapContent = `# Roadmap

### Phase 1: Project setup
### Phase 2: Core engine
### Phase 3: UI components
### Phase 4: Testing
### Phase 5: Deployment
`;
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core', '03-ui', '04-testing', '05-deploy'];
    mockRequirementFileContent = {};
  });

  it('returns single phase step with --phase flag for numeric description', () => {
    const job = makeTestJob({ description: '3' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('--phase 3 --auto');
    expect(plan.reasoning).toContain('gsd-phase');
  });

  it('returns single phase step with --phase flag for numeric with whitespace', () => {
    const job = makeTestJob({ description: ' 12 ' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('--phase 12 --auto');
  });

  it('returns single phase step with description for non-numeric description', () => {
    mockPhaseDirs = ['01-setup', '02-core', '03-ui', '04-testing', '05-deploy'];
    const job = makeTestJob({ description: 'Add dark mode support' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Add dark mode support --auto');
    expect(plan.reasoning).toContain('gsd-phase');
  });

  it('uses @requirementPath in phase args when available', () => {
    mockRequirementFileContent['requirements/dark-mode.md'] = '# Dark Mode Support\n\nAdd dark mode to the app.';
    const job = makeTestJob({
      description: 'Dark mode',
      requirementPath: 'requirements/dark-mode.md',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('@requirements/dark-mode.md --auto');
  });

  it('uses @requirementPath even when file has no title heading', () => {
    mockRequirementFileContent['requirements/no-heading.md'] = 'Just some content without a heading.';
    const job = makeTestJob({
      description: 'No heading feature',
      requirementPath: 'requirements/no-heading.md',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('@requirements/no-heading.md --auto');
  });

  it('always produces a single step regardless of phase count', () => {
    mockPhaseDirs = ['01-setup', '03-engine', '10-deploy'];
    const job = makeTestJob({ description: 'New feature' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
  });

  it('returns single phase step even when phases dir is empty', () => {
    mockPhaseDirs = [];
    const job = makeTestJob({ description: 'Start fresh' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Start fresh --auto');
  });

  it('returns single phase step even when phases dir does not exist', () => {
    mockPhaseDirs = THROW_READDIRSYNC as unknown as string[];
    const job = makeTestJob({ description: 'Something' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Something --auto');
    expect(plan.reasoning).toContain('gsd-phase');
  });

  it('never passes requirement titles directly — always delegates to gsd-phase', () => {
    const job = makeTestJob({
      description: 'Pilot Requirement: Phase Execution Success Contract',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    // No execute-phase step at all — gsd-phase handles everything
    const executeStep = plan.steps.find(s => s.command === 'execute-phase');
    expect(executeStep).toBeUndefined();
  });
});

describe('fallbackPlan', () => {
  beforeEach(() => {
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core'];
    mockRequirementFileContent = {};
  });

  it('returns quick steps for quick scope with planning', () => {
    mockRoadmapExists = true;
    const job = makeTestJob({ scope: 'quick', description: 'Fix navbar' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('quick');
    expect(plan.reasoning).toContain('quick');
  });

  it('returns new-project + quick for uninitialized quick', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'quick', description: 'Fix bug' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[1].command).toBe('quick');
  });

  it('returns new-project + phase for uninitialized phase', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'phase', description: 'Add auth' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[1].command).toBe('phase');
    expect(plan.steps[1].args).toBe('Add auth --auto');
  });

  it('delegates to resolvePhaseForFallback for initialized phase — single step', () => {
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core', '03-ui'];
    const job = makeTestJob({ scope: 'phase', description: 'Add dark mode' });
    const plan = fallbackPlan(job, '/tmp/project');
    // Should produce single phase step via resolvePhaseForFallback
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Add dark mode --auto');
  });

  it('returns new-project + phase for uninitialized milestone', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'milestone', description: 'Build CRM' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[1].command).toBe('phase');
    expect(plan.steps[1].args).toBe('Build CRM --auto');
  });

  it('delegates to buildMilestonePlan for initialized milestone', () => {
    mockRoadmapExists = true;
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Big milestone',
      requirementPath: null,
    });
    const plan = fallbackPlan(job, '/tmp/project');
    // Without requirementPath, falls back to single phase command
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.reasoning).toContain('full phase lifecycle');
  });
});

describe('buildPhaseArgs', () => {
  it('uses @requirementPath when available', () => {
    const job = makeTestJob({ requirementPath: 'requirements/auth.md' });
    const result = buildPhaseArgs(job);
    expect(result).toBe('@requirements/auth.md --auto');
  });

  it('uses --phase N for numeric descriptions', () => {
    const job = makeTestJob({ description: '3', requirementPath: null });
    const result = buildPhaseArgs(job);
    expect(result).toBe('--phase 3 --auto');
  });

  it('uses --phase N for numeric with whitespace', () => {
    const job = makeTestJob({ description: ' 12 ', requirementPath: null });
    const result = buildPhaseArgs(job);
    expect(result).toBe('--phase 12 --auto');
  });

  it('uses description directly for non-numeric without requirementPath', () => {
    const job = makeTestJob({ description: 'Add dark mode', requirementPath: null });
    const result = buildPhaseArgs(job);
    expect(result).toBe('Add dark mode --auto');
  });

  it('prioritizes requirementPath over description', () => {
    const job = makeTestJob({ description: '3', requirementPath: 'requirements/auth.md' });
    const result = buildPhaseArgs(job);
    expect(result).toBe('@requirements/auth.md --auto');
  });

  // ── resumeHint tests ──────────────────────────────────────────────────

  it('does NOT append --resume when resumeHint is null', () => {
    const job = makeTestJob({ description: 'Add dark mode', requirementPath: null, resumeHint: null });
    const result = buildPhaseArgs(job);
    expect(result).toBe('Add dark mode --auto');
    expect(result).not.toContain('--resume');
  });

  it('appends --resume when resumeHint is set', () => {
    const job = makeTestJob({ description: 'Add dark mode', requirementPath: null, resumeHint: 'Resume from plan 04' });
    const result = buildPhaseArgs(job);
    expect(result).toBe('Add dark mode --auto --resume');
  });

  it('appends --resume with requirementPath when resumeHint is set', () => {
    const job = makeTestJob({ requirementPath: 'requirements/auth.md', resumeHint: 'Fix type errors' });
    const result = buildPhaseArgs(job);
    expect(result).toBe('@requirements/auth.md --auto --resume');
  });

  it('appends --resume with --phase N when resumeHint is set on bare number description', () => {
    const job = makeTestJob({ description: '5', requirementPath: null, resumeHint: 'Continue phase 5' });
    const result = buildPhaseArgs(job);
    expect(result).toBe('--phase 5 --auto --resume');
  });
});

describe('buildNewProjectArgs', () => {
  it('uses requirementPath with @ prefix when available', () => {
    const job = makeTestJob({ requirementPath: 'requirements/auth.md' });
    const result = buildNewProjectArgs(job);
    expect(result).toBe('@requirements/auth.md --auto');
  });

  it('uses description when no requirementPath', () => {
    const job = makeTestJob({ description: 'Build a CRM', requirementPath: null });
    const result = buildNewProjectArgs(job);
    expect(result).toBe('Build a CRM --auto');
  });

  it('appends --auto flag', () => {
    const job = makeTestJob({ description: 'Test' });
    const result = buildNewProjectArgs(job);
    expect(result).toContain('--auto');
    expect(result).toMatch(/--auto$/);
  });
});

describe('buildQuickArgs', () => {
  it('prefixes with file read instruction when requirementPath exists', () => {
    const job = makeTestJob({
      description: 'Fix navbar',
      requirementPath: 'requirements/navbar-fix.md',
    });
    const result = buildQuickArgs(job);
    expect(result).toContain('Read requirements/navbar-fix.md');
    expect(result).toContain('for full details');
    expect(result).toContain('Fix navbar');
  });

  it('returns description directly when no requirementPath', () => {
    const job = makeTestJob({ description: 'Fix the bug', requirementPath: null });
    const result = buildQuickArgs(job);
    expect(result).toBe('Fix the bug');
  });
});

describe('buildMilestonePlan', () => {
  beforeEach(() => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockRequirementDirFiles = [];
    mockRequirementIsDir = false;
    mockRequirementFileContent = {};
  });

  it('creates one phase command per .md file in requirement directory', () => {
    mockRequirementIsDir = true;
    mockRequirementDirFiles = ['01-auth.md', '02-payments.md', '03-ui.md'];
    mockPhaseDirs = ['01-setup', '02-core'];
    // Mock requirement file contents with titles
    mockRequirementFileContent['/tmp/requirements/milestone-v2/01-auth.md'] = '# Authentication\n\nAuth requirements.';
    mockRequirementFileContent['/tmp/requirements/milestone-v2/02-payments.md'] = '# Payment Integration\n\nPayment requirements.';
    mockRequirementFileContent['/tmp/requirements/milestone-v2/03-ui.md'] = '# UI Components\n\nUI requirements.';

    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/milestone-v2',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');

    // 3 files × 1 step (phase command) = 3 steps
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('@/tmp/requirements/milestone-v2/01-auth.md --auto');
    expect(plan.steps[1].command).toBe('phase');
    expect(plan.steps[1].args).toBe('@/tmp/requirements/milestone-v2/02-payments.md --auto');
    expect(plan.steps[2].command).toBe('phase');
    expect(plan.steps[2].args).toBe('@/tmp/requirements/milestone-v2/03-ui.md --auto');

    expect(plan.reasoning).toContain('3 requirement files');
  });

  it('uses @path for phase command even when no heading in file', () => {
    mockRequirementIsDir = true;
    mockRequirementDirFiles = ['01-auth.md'];
    mockPhaseDirs = ['01-setup'];
    // No heading in file content
    mockRequirementFileContent['/tmp/requirements/milestone-v2/01-auth.md'] = 'No heading here, just content.';

    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/milestone-v2',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('@/tmp/requirements/milestone-v2/01-auth.md --auto');
  });

  it('falls back to single add-phase with title when requirementPath is a file', () => {
    mockRequirementIsDir = false;
    mockRequirementFileContent['/tmp/requirements/single-req.md'] = '# Single Requirement\n\nDetails here.';
    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/single-req.md',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    // Uses file path with @ prefix and --auto
    expect(plan.steps[0].args).toBe('@/tmp/requirements/single-req.md --auto');
  });

  it('falls back to single add-phase when no .md files in dir', () => {
    mockRequirementIsDir = true;
    mockRequirementDirFiles = ['README.txt', 'notes.json'];

    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/empty-dir',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
  });

  it('falls back to single add-phase when no requirementPath', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Build everything',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Build everything --auto');
  });

  it('uses description when no requirementPath in single add-phase fallback', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Custom milestone description',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps[0].args).toBe('Custom milestone description --auto');
    expect(plan.reasoning).toContain('full phase lifecycle');
  });
});

describe('extractRequirementTitle', () => {
  beforeEach(() => {
    mockRequirementFileContent = {};
  });

  it('extracts # Title heading from first line', () => {
    mockRequirementFileContent['/tmp/req.md'] = '# TUI Visual Polish\n\nContent here.';
    expect(extractRequirementTitle('/tmp/req.md')).toBe('TUI Visual Polish');
  });

  it('extracts # Title heading from first non-empty line', () => {
    mockRequirementFileContent['/tmp/req.md'] = '\n\n# Delegate Phase Lifecycle Hardening\n\nBody.';
    expect(extractRequirementTitle('/tmp/req.md')).toBe('Delegate Phase Lifecycle Hardening');
  });

  it('returns null when file has no heading', () => {
    mockRequirementFileContent['/tmp/no-heading.md'] = 'Just some content.\nNo markdown heading.';
    expect(extractRequirementTitle('/tmp/no-heading.md')).toBeNull();
  });

  it('returns null when file does not exist', () => {
    // No entry in mockRequirementFileContent → will call actual readFileSync → ENOENT
    expect(extractRequirementTitle('/tmp/nonexistent-file.md')).toBeNull();
  });

  it('trims whitespace from title', () => {
    mockRequirementFileContent['/tmp/req.md'] = '#   Padded Title   \n\nBody.';
    expect(extractRequirementTitle('/tmp/req.md')).toBe('Padded Title');
  });

  it('matches ## heading but extracts only first # heading', () => {
    mockRequirementFileContent['/tmp/req.md'] = '## Sub Heading\n\n# Main Heading\n\nBody.';
    // The regex /^#\s+(.+)$/m matches first occurrence of any # heading
    // ## Sub Heading doesn't match /^#\s+/ because it starts with ##
    // Wait — actually ## matches ^# too. Let's check the actual behavior.
    // The regex /^#\s+(.+)$/m will match "## Sub Heading" because ^# matches the first #
    // But ## starts with "# " — no, ## is "##" followed by space, which matches /^#\s/ as # then #(as \s? no)
    // Actually /^#\s+(.+)$/m: ^ = start of line, # = literal hash, \s+ = one or more whitespace
    // "## Sub Heading" → first char is #, second is #, which is NOT \s → no match
    // "# Main Heading" → first char is #, second is space → match!
    const result = extractRequirementTitle('/tmp/req.md');
    expect(result).toBe('Main Heading');
  });

  it('handles file with only a heading', () => {
    mockRequirementFileContent['/tmp/req.md'] = '# Just A Title';
    expect(extractRequirementTitle('/tmp/req.md')).toBe('Just A Title');
  });
});

describe('matchesBlocklist', () => {
  it('returns matched phrase for title containing "add a new integer phase"', () => {
    const result = matchesBlocklist('Add a new integer phase to the end of the current milestone');
    expect(result).toBe('add a new integer phase');
  });

  it('returns matched phrase for titles containing "execute all plans"', () => {
    const result = matchesBlocklist('Execute all plans in the current milestone');
    expect(result).toBe('execute all plans');
  });

  it('returns null for legitimate titles like "Fix premature completion detection"', () => {
    expect(matchesBlocklist('Fix premature completion detection')).toBeNull();
  });

  it('returns null for another legitimate title', () => {
    expect(matchesBlocklist('TUI Visual Polish')).toBeNull();
  });

  it('returns null for "Harden add-phase reliability"', () => {
    expect(matchesBlocklist('Harden add-phase reliability')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(matchesBlocklist('ADD A NEW INTEGER PHASE to the end')).toBe('add a new integer phase');
    expect(matchesBlocklist('EXECUTE ALL PLANS for this milestone')).toBe('execute all plans');
  });

  it('returns matched phrase for "current milestone in the roadmap"', () => {
    expect(matchesBlocklist('current milestone in the roadmap')).toBe('current milestone in the roadmap');
  });

  it('returns matched phrase for "spawn subagents"', () => {
    expect(matchesBlocklist('spawn subagents for parallel execution')).toBe('spawn subagents');
  });

  it('returns null for partial matches that are not blocklisted', () => {
    // "phase" alone is fine — only full phrases are blocklisted
    expect(matchesBlocklist('Fix phase detection logic')).toBeNull();
    expect(matchesBlocklist('Add planned features')).toBeNull();
  });

  it('GSD_INSTRUCTION_BLOCKLIST is exported and non-empty', () => {
    expect(GSD_INSTRUCTION_BLOCKLIST).toBeDefined();
    expect(GSD_INSTRUCTION_BLOCKLIST.length).toBeGreaterThan(0);
    // Verify it contains the key phrases
    expect(GSD_INSTRUCTION_BLOCKLIST).toContain('add a new integer phase');
    expect(GSD_INSTRUCTION_BLOCKLIST).toContain('execute all plans');
  });
});
