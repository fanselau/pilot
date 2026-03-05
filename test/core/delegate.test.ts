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

// Map of phase subdir path → file list (for getPhaseState testing)
// Key: the phase dir path suffix (e.g., '01-setup'), value: array of files
let mockPhaseSubdirFiles: Record<string, string[]> = {};

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
      if (typeof dirPath === 'string') {
        // Check for phase subdir reads first (more specific match)
        // e.g., '/tmp/project/.planning/phases/01-setup'
        for (const [subdirKey, files] of Object.entries(mockPhaseSubdirFiles)) {
          if (dirPath.includes('.planning/phases/') && dirPath.endsWith(subdirKey)) {
            return files;
          }
        }

        // Top-level phases dir
        if (dirPath.includes('.planning/phases')) {
          if (mockPhaseDirs as unknown === THROW_READDIRSYNC) {
            const err = new Error('ENOENT: no such file or directory');
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            throw err;
          }
          return mockPhaseDirs;
        }
        // Requirement directory reads
        if (dirPath.includes('requirements')) {
          return mockRequirementDirFiles;
        }
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
  extractRequirementTitle,
  findExistingPhaseDir,
  getPhaseState,
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
    parentJobId: null,
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
    actualModels: null,
    callbackSessionKey: null,
    callbackUrl: null,
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

  it('parses multi-step phase plan and strips verify-phase and --auto', () => {
    // AI might output verify-phase and --auto, but parser strips them:
    // - verify-phase: runner handles verification separately
    // - --auto: triggers broken Task() auto-advance in plan-phase
    const content = '```json\n{"steps":[{"command":"add-phase","args":"Add OAuth"},{"command":"plan-phase","args":"17 --auto"},{"command":"execute-phase","args":"17"},{"command":"verify-phase","args":"17"}],"reasoning":"Adding as phase 17"}\n```';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(3);  // verify-phase stripped
    expect(plan.steps.map(s => s.command)).toEqual([
      'add-phase',
      'plan-phase',
      'execute-phase',
    ]);
    expect(plan.steps[1].args).toBe('17');  // --auto stripped
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

  it('passes { command: "phase" } through as-is (no decomposition)', () => {
    // phase command passes through without conversion — GSD orchestrates lifecycle internally
    const content = '{"steps":[{"command":"phase","args":"Document Management UI --auto"}],"reasoning":"New format"}';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Document Management UI --auto');
  });

  it('passes { command: "phase" } with requirement path through as-is', () => {
    const content = '{"steps":[{"command":"phase","args":"@requirements/foo.md --auto"}],"reasoning":"With path"}';
    const plan = parseDelegationOutput(content);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('@requirements/foo.md --auto');
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
    mockPhaseSubdirFiles = {};
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

// ── findExistingPhaseDir ──────────────────────────────────────────────────

describe('findExistingPhaseDir', () => {
  beforeEach(() => {
    mockPhaseDirs = [];
    mockPhaseSubdirFiles = {};
  });

  it('finds phase dir by slug match', () => {
    mockPhaseDirs = ['01-setup', '21-tui-visual-polish', '22-delegate'];
    const result = findExistingPhaseDir('/tmp/.planning/phases', 'TUI Visual Polish');
    expect(result).not.toBeNull();
    expect(result!.phaseNumber).toBe(21);
    expect(result!.dirName).toBe('21-tui-visual-polish');
  });

  it('returns null when no match', () => {
    mockPhaseDirs = ['01-setup', '02-core', '03-ui'];
    const result = findExistingPhaseDir('/tmp/.planning/phases', 'Some Nonexistent Feature');
    expect(result).toBeNull();
  });

  it('handles empty phases dir', () => {
    mockPhaseDirs = [];
    const result = findExistingPhaseDir('/tmp/.planning/phases', 'Something');
    expect(result).toBeNull();
  });

  it('handles missing phases dir (ENOENT)', () => {
    mockPhaseDirs = THROW_READDIRSYNC as unknown as string[];
    const result = findExistingPhaseDir('/nonexistent/.planning/phases', 'Something');
    expect(result).toBeNull();
  });

  it('finds phase by number prefix slug match', () => {
    mockPhaseDirs = ['01-foundation', '02-auth', '03-payments'];
    // "Auth System" slug is "auth-system", "auth" is in dirSlug "auth"
    // dirSlug "auth" includes titleSlug "auth" — partial match
    const result = findExistingPhaseDir('/tmp/.planning/phases', 'auth');
    expect(result).not.toBeNull();
    expect(result!.phaseNumber).toBe(2);
  });

  it('finds phase by word overlap (at least 2 words >3 chars)', () => {
    mockPhaseDirs = ['29-phase-delegation-revert-to-multi-step-spawning'];
    const result = findExistingPhaseDir('/tmp/.planning/phases', 'Phase Delegation: Revert to Multi-Step Spawning');
    expect(result).not.toBeNull();
    expect(result!.phaseNumber).toBe(29);
  });
});

// ── getPhaseState ──────────────────────────────────────────────────────────

describe('getPhaseState', () => {
  beforeEach(() => {
    mockPhaseDirs = [];
    mockPhaseSubdirFiles = {};
  });

  it('returns correct plan and summary counts', () => {
    // Phase dir with 3 PLAN.md and 2 SUMMARY.md
    mockPhaseSubdirFiles['01-setup'] = [
      '01-01-PLAN.md',
      '01-01-SUMMARY.md',
      '01-02-PLAN.md',
      '01-02-SUMMARY.md',
      '01-03-PLAN.md',
    ];
    mockPhaseDirs = ['01-setup'];
    const result = getPhaseState('/tmp/.planning/phases', '01-setup');
    expect(result.planCount).toBe(3);
    expect(result.summaryCount).toBe(2);
    expect(result.isComplete).toBe(false);
  });

  it('returns isComplete=true when plan and summary counts match', () => {
    mockPhaseSubdirFiles['02-core'] = [
      '02-01-PLAN.md',
      '02-01-SUMMARY.md',
      '02-02-PLAN.md',
      '02-02-SUMMARY.md',
      '02-03-PLAN.md',
      '02-03-SUMMARY.md',
    ];
    mockPhaseDirs = ['02-core'];
    const result = getPhaseState('/tmp/.planning/phases', '02-core');
    expect(result.planCount).toBe(3);
    expect(result.summaryCount).toBe(3);
    expect(result.isComplete).toBe(true);
  });

  it('returns isComplete=false when no plans', () => {
    mockPhaseSubdirFiles['03-ui'] = [];
    mockPhaseDirs = ['03-ui'];
    const result = getPhaseState('/tmp/.planning/phases', '03-ui');
    expect(result.planCount).toBe(0);
    expect(result.summaryCount).toBe(0);
    expect(result.isComplete).toBe(false);
  });

  it('returns zero counts for missing dir (ENOENT)', () => {
    // No mockPhaseSubdirFiles entry — will fall through to actual readdirSync which throws
    // But the dir doesn't exist in mock, and it's not in mockPhaseDirs so mock won't match
    // We need to force ENOENT for the phase subdir
    // The mock checks: dirPath.endsWith(subdirKey) — so if subdirKey is 'missing-phase' it will match
    mockPhaseSubdirFiles['missing-phase'] = THROW_READDIRSYNC as unknown as string[];
    mockPhaseDirs = [];
    // getPhaseState builds path as join(phasesDir, phaseDirName) and calls readdirSync
    // Since 'missing-phase' is the subdirKey and the path ends with it, mock throws ENOENT
    // But wait — the mock checks mockPhaseSubdirFiles for the key and if it's THROW_READDIRSYNC,
    // we'd need to check for that sentinel. Let's use a different approach:
    // The mock's readdirSync for phase subdirs uses the actual THROW_READDIRSYNC sentinel in mockPhaseDirs,
    // but for subdirs we use mockPhaseSubdirFiles. For ENOENT, we simply don't add an entry,
    // and the path won't match any mockPhaseSubdirFiles key, so it falls through to actual.
    // Actually the actual will throw ENOENT for /tmp/.planning/phases/nonexistent-phase.
    // Let's test with a dir that clearly doesn't exist on the filesystem.
    const result = getPhaseState('/tmp/clearly-not-a-real-path/.planning/phases', 'nonexistent-phase-xyz');
    expect(result.planCount).toBe(0);
    expect(result.summaryCount).toBe(0);
    expect(result.isComplete).toBe(false);
  });
});

// ── resolvePhaseForFallback ───────────────────────────────────────────────

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
    mockPhaseSubdirFiles = {};
    mockRequirementFileContent = {};
  });

  it('produces single phase command for new requirement (no existing phase)', () => {
    mockPhaseDirs = ['01-setup', '02-core', '03-ui', '04-testing', '05-deploy'];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ description: 'Add dark mode support' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // No existing phase for "Add dark mode support" → single phase command (GSD orchestrates internally)
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toContain('--auto');
  });

  it('skips add-phase when phase dir exists, produces [plan-phase, execute-phase]', () => {
    // "TUI Visual Polish" matches '21-tui-visual-polish'
    mockPhaseDirs = ['01-setup', '21-tui-visual-polish'];
    // Phase dir exists but has no plans (no PLAN.md files)
    mockPhaseSubdirFiles['21-tui-visual-polish'] = [];
    const job = makeTestJob({ description: 'TUI Visual Polish' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].command).toBe('plan-phase');
    expect(plan.steps[1].command).toBe('execute-phase');
  });

  it('skips add-phase and plan-phase when plans exist, produces [execute-phase]', () => {
    mockPhaseDirs = ['01-setup', '21-tui-visual-polish'];
    // Phase dir has 2 PLAN.md files but 0 SUMMARY.md → not complete
    mockPhaseSubdirFiles['21-tui-visual-polish'] = [
      '21-01-PLAN.md',
      '21-02-PLAN.md',
    ];
    const job = makeTestJob({ description: 'TUI Visual Polish' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('execute-phase');
    expect(plan.steps[0].args).toBe('21');
  });

  it('returns empty steps when phase is complete (all plans have summaries)', () => {
    mockPhaseDirs = ['01-setup', '21-tui-visual-polish'];
    // Phase dir has 2 PLAN.md and 2 SUMMARY.md → complete
    mockPhaseSubdirFiles['21-tui-visual-polish'] = [
      '21-01-PLAN.md',
      '21-01-SUMMARY.md',
      '21-02-PLAN.md',
      '21-02-SUMMARY.md',
    ];
    const job = makeTestJob({ description: 'TUI Visual Polish' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(0);
  });

  it('uses @requirementPath as phase command args when requirementPath provided', () => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
    mockRequirementFileContent['requirements/dark-mode.md'] = '# Dark Mode Support\n\nAdd dark mode to the app.';
    const job = makeTestJob({
      description: 'Dark mode',
      requirementPath: 'requirements/dark-mode.md',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // No existing phase → single phase command with @requirementPath
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('@requirements/dark-mode.md --auto');
  });

  it('uses title as phase command args when no requirementPath', () => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
    mockRequirementFileContent['requirements/auth.md'] = '# Auth System\n\nAuth requirements.';
    const job = makeTestJob({
      description: 'Auth System',
      requirementPath: null,
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Auth System --auto');
  });

  it('handles bare number description — checks existing phase state', () => {
    // "3" means phase 3 exists at "03-ui" in phases dir
    mockPhaseDirs = ['01-setup', '02-core', '03-ui', '04-testing', '05-deploy'];
    // Phase 3 has 2 plans, 1 summary → not complete, skip plan-phase
    mockPhaseSubdirFiles['03-ui'] = [
      '03-01-PLAN.md',
      '03-01-SUMMARY.md',
      '03-02-PLAN.md',
    ];
    const job = makeTestJob({ description: '3' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // Phase dir "03-ui" found, has plans → only execute-phase
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('execute-phase');
    expect(plan.steps[0].args).toBe('3');
  });

  it('includes --auto in phase command args (GSD needs it for autonomous execution)', () => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ description: 'Add some feature' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // phase command includes --auto (unlike plan-phase where --auto triggers broken Task() auto-advance)
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toContain('--auto');
  });

  it('produces { command: "phase" } for new phases (passthrough to GSD)', () => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ description: 'New feature for the app' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
  });

  it('produces single phase command when no existing phase found', () => {
    mockPhaseDirs = ['01-setup', '03-engine', '10-deploy'];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ description: 'New feature' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('New feature --auto');
  });

  it('produces single phase command when phases dir is empty', () => {
    mockPhaseDirs = [];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ description: 'Start fresh' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Start fresh --auto');
  });

  it('produces single phase command when phases dir does not exist', () => {
    mockPhaseDirs = THROW_READDIRSYNC as unknown as string[];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ description: 'Something' });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // No existing phase found → single phase command
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toBe('Something --auto');
  });

  it('produces single phase command for Pilot Requirement title (no blocklist match → normal phase)', () => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({
      description: 'Pilot Requirement: Phase Execution Success Contract',
    });
    const plan = resolvePhaseForFallback('/tmp/project', job);
    // No existing phase → single phase command (GSD orchestrates lifecycle)
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toContain('--auto');
  });
});

// ── fallbackPlan ──────────────────────────────────────────────────────────

describe('fallbackPlan', () => {
  beforeEach(() => {
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
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
  });

  it('includes --auto in phase step for uninitialized phase', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'phase', description: 'Add auth' });
    const plan = fallbackPlan(job, '/tmp/project');
    // new-project and phase both get --auto
    expect(plan.steps[0].args).toContain('--auto'); // new-project
    expect(plan.steps[1].args).toContain('--auto'); // phase
  });

  it('delegates to resolvePhaseForFallback for initialized phase — single phase command for new phase', () => {
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup', '02-core', '03-ui'];
    mockPhaseSubdirFiles = {};
    const job = makeTestJob({ scope: 'phase', description: 'Add dark mode' });
    const plan = fallbackPlan(job, '/tmp/project');
    // No existing phase for "Add dark mode" → single phase command via resolvePhaseForFallback
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('phase');
    expect(plan.steps[0].args).toContain('--auto');
  });

  it('returns new-project (single step) for uninitialized milestone', () => {
    mockRoadmapExists = false;
    const job = makeTestJob({ scope: 'milestone', description: 'Build CRM' });
    const plan = fallbackPlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-project');
  });

  it('delegates to buildMilestonePlan (new-milestone coordinator) for initialized milestone', () => {
    mockRoadmapExists = true;
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Big milestone',
      requirementPath: null,
    });
    const plan = fallbackPlan(job, '/tmp/project');
    // Milestone coordinator: single new-milestone step
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-milestone');
    expect(plan.reasoning).toContain('coordinator');
  });

  it('produces { command: "phase" } for new phase lifecycle (initialized and uninitialized)', () => {
    // Initialized project, no existing phase dir — produces phase command
    mockRoadmapExists = true;
    mockPhaseDirs = ['01-setup'];
    mockPhaseSubdirFiles = {};
    const job1 = makeTestJob({ scope: 'phase', description: 'New feature' });
    const plan1 = fallbackPlan(job1, '/tmp/project');
    const phaseStep1 = plan1.steps.find(s => s.command === 'phase');
    expect(phaseStep1).toBeDefined();
    expect(phaseStep1!.args).toContain('--auto');

    // Uninitialized project — produces new-project + phase
    mockRoadmapExists = false;
    const job2 = makeTestJob({ scope: 'phase', description: 'Another feature' });
    const plan2 = fallbackPlan(job2, '/tmp/project');
    const phaseStep2 = plan2.steps.find(s => s.command === 'phase');
    expect(phaseStep2).toBeDefined();
    expect(phaseStep2!.args).toContain('--auto');

    // Milestone never produces phase steps (different orchestration path)
    mockRoadmapExists = false;
    const job3 = makeTestJob({ scope: 'milestone', description: 'Big thing' });
    const plan3 = fallbackPlan(job3, '/tmp/project');
    expect(plan3.steps.find(s => s.command === 'phase')).toBeUndefined();
  });
});

// ── buildNewProjectArgs ───────────────────────────────────────────────────

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

// ── buildQuickArgs ────────────────────────────────────────────────────────

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

// ── buildMilestonePlan ────────────────────────────────────────────────────
// buildMilestonePlan now produces a simple coordinator plan (new-milestone step).
// Child phase jobs are spawned by the runner after the coordinator completes.

describe('buildMilestonePlan', () => {
  beforeEach(() => {
    mockPhaseDirs = ['01-setup', '02-core'];
    mockPhaseSubdirFiles = {};
    mockRequirementDirFiles = [];
    mockRequirementIsDir = false;
    mockRequirementFileContent = {};
  });

  it('returns single new-milestone step for initialized project with requirementPath', () => {
    const job = makeTestJob({
      scope: 'milestone',
      requirementPath: '/tmp/requirements/milestone-v2',
      description: 'Milestone V2',
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-milestone');
    expect(plan.steps[0].args).toBe('@/tmp/requirements/milestone-v2 --auto');
    expect(plan.reasoning).toContain('coordinator');
  });

  it('returns single new-milestone step with description when no requirementPath', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Build everything',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe('new-milestone');
    expect(plan.steps[0].args).toBe('Build everything --auto');
  });

  it('never produces { command: "phase" } steps', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Test milestone',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    const phaseStep = plan.steps.find(s => s.command === 'phase');
    expect(phaseStep).toBeUndefined();
  });

  it('args include --auto flag', () => {
    const job = makeTestJob({
      scope: 'milestone',
      description: 'Launch v2',
      requirementPath: null,
    });
    const plan = buildMilestonePlan(job, '/tmp/project');
    expect(plan.steps[0].args).toContain('--auto');
  });
});

// ── extractRequirementTitle ───────────────────────────────────────────────

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
    // The regex /^#\s+(.+)$/m: ^ = start of line, # = literal hash, \s+ = one or more whitespace
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

// ── matchesBlocklist ──────────────────────────────────────────────────────

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
