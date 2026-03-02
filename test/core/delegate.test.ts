import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDelegationOutput, resolvePhaseForFallback } from '../../src/core/delegate.js';
import type { Job } from '../../src/core/types.js';

// Sentinel value: when set, readFileSync throws ENOENT for ROADMAP.md
const THROW_ENOENT = '__THROW_ENOENT__';

// Mock fs.readFileSync for resolvePhaseForFallback tests
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
  };
});

let mockRoadmapContent: string = '';
let mockRoadmapExists = true;

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
    const job = makeTestJob({ description: 'Add dark mode support' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].command).toBe('add-phase');
    expect(plan.steps[0].args).toBe('Add dark mode support');
    expect(plan.steps[1].command).toBe('plan-phase');
    expect(plan.steps[1].args).toBe('6 --auto'); // next after 5
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
    mockRoadmapContent = `# Roadmap

### Phase 1: Setup
### Phase 3: Engine
### Phase 10: Deploy
`;
    const job = makeTestJob({ description: 'New feature' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // Max phase is 10, next is 11
    expect(plan.steps[1].args).toBe('11 --auto');
    expect(plan.steps[2].args).toBe('11');
  });

  it('defaults to phase 1 when ROADMAP has no phases', () => {
    mockRoadmapContent = '# Empty Roadmap\n\nNo phases yet.\n';
    const job = makeTestJob({ description: 'Start fresh' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps[1].args).toBe('1 --auto');
    expect(plan.steps[2].args).toBe('1');
  });

  it('falls back gracefully when ROADMAP.md is missing', () => {
    mockRoadmapContent = THROW_ENOENT;
    const job = makeTestJob({ description: 'Something' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // Should still produce a valid plan (fallback to execute-phase 1)
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.reasoning).toContain('ROADMAP.md not found');
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
