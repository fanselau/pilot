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
  getNextPhaseNumber,
  buildMilestonePlan,
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
    attempts: 0,
    maxAttempts: 3,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
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
  });

  it('returns execute-phase when description is numeric', () => {
    const job = makeTestJob({ description: '3' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('execute-phase');
    expect(plan.steps[0].args).toBe('3');
    expect(plan.reasoning).toContain('numeric phase identifier');
  });

  it('returns execute-phase for numeric with whitespace', () => {
    const job = makeTestJob({ description: ' 12 ' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('execute-phase');
    expect(plan.steps[0].args).toBe('12');
  });

  it('builds add→plan→execute lifecycle for non-numeric description', () => {
    mockPhaseDirs = ['01-setup', '02-core', '03-ui', '04-testing', '05-deploy'];
    const job = makeTestJob({ description: 'Add dark mode support' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('Add dark mode support');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[1].args).toBe('6 --auto'); // next after 5 dirs
    expect(plan.steps[2].command).toBe('execute-phase');
    expect(plan.steps[2].args).toBe('6');
    expect(plan.reasoning).toContain('phase 6');
  });

  it('uses requirementPath in add-phase args when available', () => {
    const job = makeTestJob({
      description: 'Dark mode',
      requirementPath: 'requirements/dark-mode.md',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('@requirements/dark-mode.md');
  });

  it('calculates next phase correctly with gaps in phase numbers', () => {
    mockPhaseDirs = ['01-setup', '03-engine', '10-deploy'];
    const job = makeTestJob({ description: 'New feature' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // Max phase is 10, next is 11
    expect(plan.steps[1].args).toBe('11 --auto');
    expect(plan.steps[2].args).toBe('11');
  });

  it('defaults to phase 1 when phases dir is empty', () => {
    mockPhaseDirs = [];
    const job = makeTestJob({ description: 'Start fresh' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps[1].args).toBe('1 --auto');
    expect(plan.steps[2].args).toBe('1');
  });

  it('defaults to phase 1 when phases dir does not exist', () => {
    mockPhaseDirs = THROW_READDIRSYNC as unknown as string[];
    const job = makeTestJob({ description: 'Something' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // Should still produce a valid plan with phase 1
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[1].args).toBe('1 --auto');
    expect(plan.steps[2].args).toBe('1');
    expect(plan.reasoning).toContain('phase 1');
  });

  it('uses filesystem scan not ROADMAP heading count', () => {
    // ROADMAP has 5 phases but filesystem has only 2 dirs
    mockRoadmapContent = `# Roadmap
### Phase 1: Setup
### Phase 2: Core
### Phase 3: UI
### Phase 4: Testing
### Phase 5: Deploy
`;
    mockPhaseDirs = ['01-setup', '02-core'];
    const job = makeTestJob({ description: 'New feature' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // Should be phase 3 (from filesystem scan), NOT phase 6 (from ROADMAP headings)
    expect(plan.steps[1].args).toBe('3 --auto');
    expect(plan.steps[2].args).toBe('3');
  });

  it('never passes requirement titles directly to execute-phase for non-numeric descriptions', () => {
    const job = makeTestJob({
      description: 'Pilot Requirement: Phase Execution Success Contract',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // The key assertion: execute-phase should NOT get the title string
    const executeStep = plan.steps.find(s => s.command === 'execute-phase');
    expect(executeStep).toBeDefined();
    // execute-phase args should be numeric
    expect(executeStep!.args).toMatch(/^\d+$/);
  });
});

describe('fallbackPlan', () => {
  beforeEach(() => {
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core'];
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

  it('returns new-project + plan + execute for uninitialized phase', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'phase', description: 'Add auth' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[1].args).toBe('1 --auto');
    expect(plan.steps[2].command).toBe('execute-phase');
    expect(plan.steps[2].args).toBe('1');
  });

  it('delegates to resolvePhaseForFallback for initialized phase', () => {
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core', '03-ui'];
    const job = makeTestJob({ scope: 'phase', description: 'Add dark mode' });
    const plan = fallbackPlan(job, '/tmp/project');
    // Should produce add→plan→execute lifecycle via resolvePhaseForFallback
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[1].args).toBe('4 --auto');
    expect(plan.steps[2].command).toBe('execute-phase');
  });

  it('returns new-project lifecycle for uninitialized milestone', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'milestone', description: 'Build CRM' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('new-project');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[2].command).toBe('execute-phase');
  });

  it('delegates to buildMilestonePlan for initialized milestone', () => {
    mockRoadmapExists = true;
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Big milestone',
      requirementPath: null,
    });
    const plan = fallbackPlan(job, '/tmp/project');
    // Without requirementPath, falls back to single add-phase
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.reasoning).toContain('adding as new phase');
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
  });

  it('creates one phase per .md file in requirement directory', () => {
    mockRequirementIsDir = true;
    mockRequirementDirFiles = ['01-auth.md', '02-payments.md', '03-ui.md'];
    mockPhaseDirs = ['01-setup', '02-core'];

    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/milestone-v2',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');

    // 3 files × 3 steps (add + plan + execute) = 9 steps
    expect(plan.steps).toHaveLength(9);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toContain('01-auth.md');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[1].args).toBe('3 --auto'); // next after 02-core
    expect(plan.steps[2].command).toBe('execute-phase');
    expect(plan.steps[2].args).toBe('3');

    expect(plan.steps[3].command).toBe('add-phase');
    expect(plan.steps[3].args).toContain('02-payments.md');
    expect(plan.steps[4].args).toBe('4 --auto');
    expect(plan.steps[5].args).toBe('4');

    expect(plan.steps[6].command).toBe('add-phase');
    expect(plan.steps[6].args).toContain('03-ui.md');
    expect(plan.steps[7].args).toBe('5 --auto');
    expect(plan.steps[8].args).toBe('5');

    expect(plan.reasoning).toContain('3 requirement files');
  });

  it('falls back to single add-phase when requirementPath is a file', () => {
    mockRequirementIsDir = false;
    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/single-req.md',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('@/tmp/requirements/single-req.md');
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
    expect(plan.steps[0].command).toBe('add-phase');
  });

  it('falls back to single add-phase when no requirementPath', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Build everything',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('Build everything');
  });

  it('uses description when no requirementPath in single add-phase fallback', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Custom milestone description',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps[0].args).toBe('Custom milestone description');
    expect(plan.reasoning).toContain('adding as new phase');
  });
});
