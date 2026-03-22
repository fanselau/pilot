import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job } from '../../src/core/types.js';
import { resolveTopLevelModel } from '../../src/core/models.js';

// ── Mock state ─────────────────────────────────────────────────────────────

// Sentinel value: when set, readFileSync throws ENOENT for ROADMAP.md
const THROW_ENOENT = '__THROW_ENOENT__';
const THROW_READDIRSYNC = '__THROW_READDIRSYNC__';

let mockPhaseDirs: string[] = [];
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
      if (typeof filePath !== 'string') {
        return actual.readFileSync(filePath as Parameters<typeof actual.readFileSync>[0], encoding as BufferEncoding);
      }
      // delegate.md is read at module initialization — pass through to actual fs
      if (filePath.includes('delegate.md') || filePath.includes('prompts/')) {
        return actual.readFileSync(filePath, encoding as BufferEncoding);
      }
      // Requirement file reads (for extractRequirementTitle) — access mockRequirementFileContent safely
      if (mockRequirementFileContent && filePath in mockRequirementFileContent) {
        return mockRequirementFileContent[filePath];
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
    existsSync: vi.fn((filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('delegate.md')) {
        return actual.existsSync(filePath);
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
      }
      return actual.readdirSync(dirPath);
    }),
    statSync: vi.fn((filePath: string) => {
      return actual.statSync(filePath);
    }),
  };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────

import {
  parseIntentOutput,
  buildNewProjectArgs,
  buildQuickArgs,
  getNextPhaseNumber,
  extractRequirementTitle,
  getPhaseState,
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
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackSessionKey: null,
    callbackUrl: null,
    notifyRoute: null,
    categories: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 2,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'delegation-intents',
);

function loadDelegationIntentFixture(filename: string): string {
  return readFileSync(path.join(FIXTURE_DIR, filename), 'utf8');
}

function asJsonCodeBlock(json: string): string {
  return `\`\`\`json\n${json}\n\`\`\``;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('parseIntentOutput', () => {
  it('parses quick intent from JSON code block', () => {
    const content = asJsonCodeBlock(loadDelegationIntentFixture('quick.json'));
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('quick');
    if (result.intent.type === 'quick') {
      expect(result.intent.description).toBe('Fix stale mobile notification toast behavior');
    }
    expect(result.reasoning).toContain('Scoped fix with uncertain reproduction');
  });

  it('parses quick intent with flags', () => {
    const content = '```json\n{"intent":{"type":"quick","description":"Research WebRTC","flags":["research"]},"reasoning":"Unfamiliar domain"}\n```';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('quick');
    if (result.intent.type === 'quick') {
      expect(result.intent.flags).toEqual(['research']);
    }
  });

  it('parses raw JSON without code block', () => {
    const content = '{"intent":{"type":"noop","reason":"Phase 42 complete"},"reasoning":"Done"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('noop');
    if (result.intent.type === 'noop') {
      expect(result.intent.reason).toBe('Phase 42 complete');
    }
  });

  it('parses init-project intent', () => {
    const content = '```json\n{"intent":{"type":"init-project","prdPath":"requirements/new.md"},"reasoning":"No .planning dir"}\n```';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('init-project');
    if (result.intent.type === 'init-project') {
      expect(result.intent.prdPath).toBe('requirements/new.md');
    }
  });

  it('parses new-milestone intent', () => {
    const content = '{"intent":{"type":"new-milestone","prdPath":"requirements/v2.md"},"reasoning":"No phases in roadmap"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('new-milestone');
    if (result.intent.type === 'new-milestone') {
      expect(result.intent.prdPath).toBe('requirements/v2.md');
    }
  });

  it('parses plan-and-execute intent with all fields', () => {
    const content = asJsonCodeBlock(loadDelegationIntentFixture('plan-and-execute.json'));
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('plan-and-execute');
    if (result.intent.type === 'plan-and-execute') {
      expect(result.intent.phaseNumber).toBe(72);
      expect(result.intent.prdPath).toBe('requirements/gsd-09-cleanup.md');
      expect(result.intent.addPhaseTitle).toBe('Cleanup Residual Fork Coupling');
    }
  });

  it('parses plan-and-execute with isGapClosure flag', () => {
    const content = '{"intent":{"type":"plan-and-execute","phaseNumber":5,"isGapClosure":true},"reasoning":"Gap closure retry"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('plan-and-execute');
    if (result.intent.type === 'plan-and-execute') {
      expect(result.intent.phaseNumber).toBe(5);
      expect(result.intent.isGapClosure).toBe(true);
    }
  });

  it('parses execute-only intent', () => {
    const content = loadDelegationIntentFixture('execute-only.json');
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('execute-only');
    if (result.intent.type === 'execute-only') {
      expect(result.intent.phaseNumber).toBe(72);
    }
  });

  it('parses audit-milestone intent', () => {
    const content = loadDelegationIntentFixture('audit-milestone.json');
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('audit-milestone');
    if (result.intent.type === 'audit-milestone') {
      expect(result.intent.version).toBe('cleanup-phase-72');
    }
  });

  it('handles missing reasoning gracefully', () => {
    const content = '{"intent":{"type":"noop","reason":"Already done"}}';
    const result = parseIntentOutput(content);
    expect(result.reasoning).toBe('');
    expect(result.intent.type).toBe('noop');
  });

  it('handles surrounding text before/after JSON block', () => {
    const content = 'Here is my analysis:\n\n```json\n{"intent":{"type":"quick","description":"Fix it"},"reasoning":"Simple"}\n```\n\nDone.';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('quick');
    if (result.intent.type === 'quick') {
      expect(result.intent.description).toBe('Fix it');
    }
  });

  it('throws on invalid JSON', () => {
    const content = 'This is not JSON at all';
    expect(() => parseIntentOutput(content)).toThrow('Failed to parse');
  });

  it('throws on missing intent field', () => {
    const content = '{"reasoning":"something"}';
    expect(() => parseIntentOutput(content)).toThrow('Invalid intent type');
  });

  it('throws on unknown intent type', () => {
    const content = '{"intent":{"type":"unknown-type"},"reasoning":"Bad"}';
    expect(() => parseIntentOutput(content)).toThrow('Invalid intent type');
  });

  it('throws on complete-milestone intent type (runner-internal only)', () => {
    const content = '{"intent":{"type":"complete-milestone","version":"v1"},"reasoning":"Done"}';
    expect(() => parseIntentOutput(content)).toThrow('Invalid intent type');
  });

  it('throws on quick intent without description', () => {
    const content = '{"intent":{"type":"quick"},"reasoning":"Missing desc"}';
    expect(() => parseIntentOutput(content)).toThrow('must have a string "description"');
  });

  it('throws on init-project without prdPath', () => {
    const content = '{"intent":{"type":"init-project"},"reasoning":"Missing prdPath"}';
    expect(() => parseIntentOutput(content)).toThrow('must have a string "prdPath"');
  });

  it('throws on plan-and-execute without phaseNumber', () => {
    const content = '{"intent":{"type":"plan-and-execute","prdPath":"foo.md"},"reasoning":"Missing number"}';
    expect(() => parseIntentOutput(content)).toThrow('must have a numeric "phaseNumber"');
  });

  it('throws on execute-only without phaseNumber', () => {
    const content = '{"intent":{"type":"execute-only"},"reasoning":"Missing number"}';
    expect(() => parseIntentOutput(content)).toThrow('must have a numeric "phaseNumber"');
  });

  it('throws on audit-milestone without version', () => {
    const content = '{"intent":{"type":"audit-milestone"},"reasoning":"Missing version"}';
    expect(() => parseIntentOutput(content)).toThrow('must have a string "version"');
  });

  it('throws on noop without reason', () => {
    const content = '{"intent":{"type":"noop"},"reasoning":"Missing reason"}';
    expect(() => parseIntentOutput(content)).toThrow('must have a string "reason"');
  });

  it('handles JSON with extra whitespace in code block', () => {
    const content = '```json\n  {\n    "intent": {\n      "type": "quick",\n      "description": "Fix bug"\n    },\n    "reasoning": "Formatted JSON"\n  }\n```';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('quick');
  });

  it('parses plan-and-execute with uiPhase: true', () => {
    const content = '{"intent":{"type":"plan-and-execute","phaseNumber":87,"uiPhase":true},"reasoning":"UI phase needed"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('plan-and-execute');
    if (result.intent.type === 'plan-and-execute') {
      expect(result.intent.uiPhase).toBe(true);
    }
  });

  it('parses plan-and-execute with uiPhase: false', () => {
    const content = '{"intent":{"type":"plan-and-execute","phaseNumber":42,"uiPhase":false},"reasoning":"No UI phase"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('plan-and-execute');
    if (result.intent.type === 'plan-and-execute') {
      expect(result.intent.uiPhase).toBe(false);
    }
  });

  it('parses plan-and-execute without uiPhase (backward compat)', () => {
    const content = '{"intent":{"type":"plan-and-execute","phaseNumber":5},"reasoning":"No uiPhase field"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('plan-and-execute');
    if (result.intent.type === 'plan-and-execute') {
      expect(result.intent.uiPhase).toBeUndefined();
    }
  });

  it('preserves uiPhase field on parsed plan-and-execute intent', () => {
    const content = '{"intent":{"type":"plan-and-execute","phaseNumber":10,"prdPath":"requirements/ui.md","uiPhase":true},"reasoning":"Has UI"}';
    const result = parseIntentOutput(content);
    expect(result.intent.type).toBe('plan-and-execute');
    if (result.intent.type === 'plan-and-execute') {
      expect(result.intent.phaseNumber).toBe(10);
      expect(result.intent.prdPath).toBe('requirements/ui.md');
      expect(result.intent.uiPhase).toBe(true);
    }
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
    const result = getPhaseState('/tmp/clearly-not-a-real-path/.planning/phases', 'nonexistent-phase-xyz');
    expect(result.planCount).toBe(0);
    expect(result.summaryCount).toBe(0);
    expect(result.isComplete).toBe(false);
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

// ── attemptDelegation model enforcement ────────────────────────────────────
// These tests verify the model resolution logic used in attemptDelegation:
// - resolveTopLevelModel('phase', ...) is always used (planner tier)
// - The correct model is selected based on modelProfile + providerMode

describe('attemptDelegation model enforcement', () => {
  it('delegation passes --model resolved to planner tier for balanced/claude-only job', () => {
    // balanced profile → gsd-planner uses opus tier → anthropic/claude-opus-4-6
    const entry = resolveTopLevelModel('phase', 'balanced', 'claude-only');
    expect(entry.model).toBe('anthropic/claude-opus-4-6');
    expect(entry.variant).toBeUndefined();
  });

  it('delegation uses planner tier regardless of job scope (quick-scoped job still gets planner model)', () => {
    // Even if job.scope = 'quick', delegation always calls resolveTopLevelModel('phase', ...)
    // Verify: 'phase' scope → planner tier (opus for balanced)
    const delegationEntry = resolveTopLevelModel('phase', 'balanced', 'claude-only');
    // 'quick' scope → executor tier (sonnet for balanced)
    const executorEntry = resolveTopLevelModel('quick', 'balanced', 'claude-only');
    // Delegation must use the planner tier, not the executor tier
    expect(delegationEntry.model).toBe('anthropic/claude-opus-4-6');
    expect(executorEntry.model).toBe('anthropic/claude-sonnet-4-6');
    // They differ — confirms delegation uses a distinct (higher) tier than a quick job would
    expect(delegationEntry.model).not.toBe(executorEntry.model);
  });

  it('budget profile uses sonnet for delegation (planner tier budget = sonnet)', () => {
    // budget profile → gsd-planner uses sonnet tier → anthropic/claude-sonnet-4-6
    const entry = resolveTopLevelModel('phase', 'budget', 'claude-only');
    expect(entry.model).toBe('anthropic/claude-sonnet-4-6');
  });

  it('quality profile uses opus for delegation', () => {
    const entry = resolveTopLevelModel('phase', 'quality', 'claude-only');
    expect(entry.model).toBe('anthropic/claude-opus-4-6');
  });

  it('openai-only provider mode resolves to openai models with variant for delegation', () => {
    const entry = resolveTopLevelModel('phase', 'balanced', 'openai-only');
    // balanced/openai-only planner defaults to GPT-5.4 medium
    expect(entry.model).toBe('openai/gpt-5.4');
    expect(entry.variant).toBe('medium');
  });
});
