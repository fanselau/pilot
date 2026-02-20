import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PilotConfig, ProjectStateResult } from '../../src/core/types.js';

// ── Test config ────────────────────────────────────────────────────────────

const testConfig: PilotConfig = {
  projectDir: '/test/projects',
  queueFile: '/test/QUEUE.md',
  logDir: '/tmp',
  stuckThreshold: 90,
  gsdDir: '/test/pilot-gsd',
  noColor: false,
};

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../src/core/projects.js', () => ({
  detectPlanningState: vi.fn(),
}));

vi.mock('../../src/core/queue-parser.js', () => ({
  parseQueueFile: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => testConfig),
}));

// ── Import subjects (will fail in RED — module doesn't exist yet) ──────────

import {
  detectScope,
  detectProjectState,
  parseRequirementsFile,
  generateRequirementsContent,
  resolveInternalMode,
} from '../../src/core/smart-add.js';

// ── Import mocked modules for setup ────────────────────────────────────────

import { access } from 'node:fs/promises';
import { detectPlanningState } from '../../src/core/projects.js';
import { parseQueueFile } from '../../src/core/queue-parser.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProjectState(overrides: Partial<ProjectStateResult> = {}): ProjectStateResult {
  return {
    exists: true,
    hasOpencode: true,
    hasPlanning: true,
    allPhasesDone: false,
    phasesIncomplete: false,
    isQueued: false,
    isRunning: false,
    queuedMode: null,
    runningPhase: null,
    needsSetup: false,
    needsInit: false,
    ...overrides,
  };
}

// ── detectScope ────────────────────────────────────────────────────────────

describe('detectScope', () => {
  it('classifies milestone from file with 10+ items and phase headers', () => {
    const content = [
      '# Big Project',
      '## Phase 1: Setup',
      '- [ ] item 1',
      '- [ ] item 2',
      '- [ ] item 3',
      '- [ ] item 4',
      '- [ ] item 5',
      '## Phase 2: Build',
      '- [ ] item 6',
      '- [ ] item 7',
      '- [ ] item 8',
      '- [ ] item 9',
      '- [ ] item 10',
      '- [ ] item 11',
      '- [ ] item 12',
    ].join('\n');

    const result = detectScope({ content, description: null, isDirectory: false });
    expect(result.scope).toBe('milestone');
    expect(result.itemCount).toBe(12);
    expect(result.hasPhaseHeaders).toBe(true);
    expect(result.isDirectory).toBe(false);
  });

  it('classifies milestone from file with multiple Must Have sections with 10+ items', () => {
    const content = [
      '# Feature Pack',
      '### Must Have',
      '- [ ] item 1',
      '- [ ] item 2',
      '- [ ] item 3',
      '- [ ] item 4',
      '- [ ] item 5',
      '### Must Have',
      '- [ ] item 6',
      '- [ ] item 7',
      '- [ ] item 8',
      '- [ ] item 9',
      '- [ ] item 10',
      '- [ ] item 11',
    ].join('\n');

    const result = detectScope({ content, description: null, isDirectory: false });
    expect(result.scope).toBe('milestone');
    expect(result.itemCount).toBe(11);
    expect(result.hasPhaseHeaders).toBe(true);
  });

  it('classifies phase from file with 3-10 items', () => {
    const content = [
      '# Feature',
      '## Requirements',
      '- [ ] item 1',
      '- [ ] item 2',
      '- [ ] item 3',
      '- [ ] item 4',
      '- [ ] item 5',
      '- [ ] item 6',
      '- [ ] item 7',
    ].join('\n');

    const result = detectScope({ content, description: null, isDirectory: false });
    expect(result.scope).toBe('phase');
    expect(result.itemCount).toBe(7);
    expect(result.hasPhaseHeaders).toBe(false);
  });

  it('classifies quick from short string description (no file)', () => {
    const result = detectScope({ content: null, description: 'fix the favicon 404', isDirectory: false });
    expect(result.scope).toBe('quick');
    expect(result.itemCount).toBe(0);
  });

  it('classifies quick from file with <3 items', () => {
    const content = [
      '# Small Fix',
      '- [ ] fix the button',
      '- [ ] update the color',
    ].join('\n');

    const result = detectScope({ content, description: null, isDirectory: false });
    expect(result.scope).toBe('quick');
    expect(result.itemCount).toBe(2);
  });

  it('classifies milestone from directory (isDirectory=true)', () => {
    const result = detectScope({ content: null, description: null, isDirectory: true });
    expect(result.scope).toBe('milestone');
    expect(result.isDirectory).toBe(true);
  });

  it('edge case: file with exactly 3 items → phase', () => {
    const content = '- [ ] a\n- [ ] b\n- [ ] c\n';
    const result = detectScope({ content, description: null, isDirectory: false });
    expect(result.scope).toBe('phase');
  });

  it('edge case: file with exactly 10 items but no phase headers → phase', () => {
    const items = Array.from({ length: 10 }, (_, i) => `- [ ] item ${i + 1}`).join('\n');
    const result = detectScope({ content: items, description: null, isDirectory: false });
    expect(result.scope).toBe('phase');
  });

  it('edge case: file with 10+ items AND phase headers → milestone', () => {
    const content = [
      '## Phase 1',
      ...Array.from({ length: 10 }, (_, i) => `- [ ] item ${i + 1}`),
    ].join('\n');
    const result = detectScope({ content, description: null, isDirectory: false });
    expect(result.scope).toBe('milestone');
  });
});

// ── parseRequirementsFile ──────────────────────────────────────────────────

describe('parseRequirementsFile', () => {
  it('counts checkbox items (- [ ] pattern)', () => {
    const content = [
      '- [ ] unchecked 1',
      '- [ ] unchecked 2',
      '- [ ] unchecked 3',
      '- [x] checked 1',
      '- [x] checked 2',
      '- plain list item',
    ].join('\n');

    const result = parseRequirementsFile(content);
    expect(result.itemCount).toBe(3);
  });

  it('detects phase section headers', () => {
    const content = [
      '# Project',
      '## Phase 1: Setup',
      '- [ ] item',
      '## Phase 2: Build',
      '- [ ] item',
    ].join('\n');

    const result = parseRequirementsFile(content);
    expect(result.hasPhaseHeaders).toBe(true);
  });

  it('detects multiple Must Have sections as phase indicators', () => {
    const content = [
      '### Must Have',
      '- [ ] item 1',
      '### Must Have',
      '- [ ] item 2',
    ].join('\n');

    const result = parseRequirementsFile(content);
    expect(result.hasPhaseHeaders).toBe(true);
  });

  it('single Must Have section does NOT trigger hasPhaseHeaders', () => {
    const content = [
      '### Must Have',
      '- [ ] item 1',
      '- [ ] item 2',
    ].join('\n');

    const result = parseRequirementsFile(content);
    expect(result.hasPhaseHeaders).toBe(false);
  });
});

// ── generateRequirementsContent ────────────────────────────────────────────

describe('generateRequirementsContent', () => {
  it('generates valid markdown from description string', () => {
    const result = generateRequirementsContent('add dark mode toggle to settings page');
    expect(result).toContain('# ');
    expect(result).toContain('## Requirements');
    expect(result).toContain('### Must Have');
    expect(result).toContain('- [ ]');
  });

  it('generates Do NOT section', () => {
    const result = generateRequirementsContent('fix the navbar z-index');
    expect(result).toContain('## Do NOT');
  });
});

// ── detectProjectState ─────────────────────────────────────────────────────

describe('detectProjectState', () => {
  const mockedAccess = vi.mocked(access);
  const mockedDetectPlanningState = vi.mocked(detectPlanningState);
  const mockedParseQueueFile = vi.mocked(parseQueueFile);

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: all access checks pass
    mockedAccess.mockResolvedValue(undefined);
    // Default: active planning state
    mockedDetectPlanningState.mockResolvedValue({
      state: 'active',
      progress: { done: 2, total: 5, percent: 40 },
    });
    // Default: empty queue
    mockedParseQueueFile.mockResolvedValue([]);
  });

  it('detects project directory does not exist', async () => {
    mockedAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await detectProjectState('myproject', testConfig);
    expect(result.exists).toBe(false);
    expect(result.needsSetup).toBe(false);
    expect(result.needsInit).toBe(false);
  });

  it('detects missing .opencode → needsSetup', async () => {
    // Project dir exists, .opencode does NOT
    mockedAccess.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.includes('.opencode')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return undefined;
    });

    const result = await detectProjectState('myproject', testConfig);
    expect(result.exists).toBe(true);
    expect(result.hasOpencode).toBe(false);
    expect(result.needsSetup).toBe(true);
  });

  it('detects missing .planning → needsInit', async () => {
    // Project dir + .opencode exist, .planning does NOT
    mockedAccess.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.includes('.planning')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return undefined;
    });

    const result = await detectProjectState('myproject', testConfig);
    expect(result.hasOpencode).toBe(true);
    expect(result.hasPlanning).toBe(false);
    expect(result.needsInit).toBe(true);
  });

  it('detects all phases done', async () => {
    mockedDetectPlanningState.mockResolvedValue({
      state: 'complete',
      progress: { done: 5, total: 5, percent: 100 },
    });

    const result = await detectProjectState('myproject', testConfig);
    expect(result.allPhasesDone).toBe(true);
    expect(result.phasesIncomplete).toBe(false);
  });

  it('detects incomplete phases', async () => {
    mockedDetectPlanningState.mockResolvedValue({
      state: 'active',
      progress: { done: 2, total: 5, percent: 40 },
    });

    const result = await detectProjectState('myproject', testConfig);
    expect(result.phasesIncomplete).toBe(true);
    expect(result.allPhasesDone).toBe(false);
  });

  it('detects project already queued in QUEUE.md', async () => {
    mockedParseQueueFile.mockResolvedValue([
      {
        lineNum: 1,
        project: 'myproject',
        status: 'pending',
        mode: 'build-full',
        args: '',
      },
    ]);

    const result = await detectProjectState('myproject', testConfig);
    expect(result.isQueued).toBe(true);
    expect(result.queuedMode).toBe('build-full');
  });

  it('detects project currently running in QUEUE.md', async () => {
    mockedParseQueueFile.mockResolvedValue([
      {
        lineNum: 1,
        project: 'myproject',
        status: 'running',
        mode: 'continue-all',
        args: 'Phase 3',
      },
    ]);

    const result = await detectProjectState('myproject', testConfig);
    expect(result.isRunning).toBe(true);
  });
});

// ── resolveInternalMode ────────────────────────────────────────────────────

describe('resolveInternalMode', () => {
  it("quick scope → 'quick' regardless of state", () => {
    const state = makeProjectState();
    expect(resolveInternalMode('quick', state)).toBe('quick');
  });

  it("milestone + no .planning → 'build-full'", () => {
    const state = makeProjectState({ hasPlanning: false });
    expect(resolveInternalMode('milestone', state)).toBe('build-full');
  });

  it("milestone + all done → 'build-full'", () => {
    const state = makeProjectState({ allPhasesDone: true });
    expect(resolveInternalMode('milestone', state)).toBe('build-full');
  });

  it("milestone + incomplete → 'continue-all'", () => {
    const state = makeProjectState({ phasesIncomplete: true });
    expect(resolveInternalMode('milestone', state)).toBe('continue-all');
  });

  it("phase + no .planning → 'build-full'", () => {
    const state = makeProjectState({ hasPlanning: false });
    expect(resolveInternalMode('phase', state)).toBe('build-full');
  });

  it("phase + all done → 'add-and-build'", () => {
    const state = makeProjectState({ allPhasesDone: true });
    expect(resolveInternalMode('phase', state)).toBe('add-and-build');
  });

  it("phase + incomplete → 'add-and-build'", () => {
    const state = makeProjectState({ phasesIncomplete: true });
    expect(resolveInternalMode('phase', state)).toBe('add-and-build');
  });

  it("project does not exist → 'build-full'", () => {
    const state = makeProjectState({ exists: false });
    expect(resolveInternalMode('milestone', state)).toBe('build-full');
  });
});
