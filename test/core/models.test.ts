import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { patchAgentFrontmatter, resolveAgentModel, resolveAllAgentModels, resolveTopLevelModel, AGENT_MODELS } from '../../src/core/models.js';
import { _getTestDb } from '../../src/core/db.js';
import { setModelEntry, addProviderMode } from '../../src/core/model-store.js';
import type { ModelProfile, ProviderMode } from '../../src/core/types.js';

const isScopeKey = (key: string) => key.startsWith('_top:');

describe('resolveAgentModel', () => {
  it('resolves all agent/profile/provider combinations from AGENT_MODELS', () => {
    const profiles: ModelProfile[] = ['quality', 'balanced', 'budget'];
    const providers: ProviderMode[] = ['claude-only', 'openai-only', 'hybrid'];

    for (const provider of providers) {
      for (const agentName of Object.keys(AGENT_MODELS[provider])) {
        if (isScopeKey(agentName)) continue;
        for (const profile of profiles) {
          const expected = AGENT_MODELS[provider][agentName][profile];
          expect(resolveAgentModel(agentName, profile, provider)).toEqual(expected);
        }
      }
    }
  });

  it('throws for unknown agent', () => {
    expect(() => resolveAgentModel('gsd-unknown', 'balanced', 'claude-only')).toThrow('Unknown agent');
  });
});

describe('resolveAllAgentModels', () => {
  it('resolves the full agent map with ModelEntry objects', () => {
    const models = resolveAllAgentModels('balanced', 'hybrid');
    expect(Object.keys(models)).toHaveLength(11);
    expect(models['gsd-planner'].model).toBe('anthropic/claude-opus-4-6');
    expect(models['gsd-executor'].model).toBe('anthropic/claude-sonnet-4-6');
    expect(models['gsd-phase-researcher'].model).toBe('anthropic/claude-sonnet-4-6');
    expect(models['gsd-codebase-mapper'].model).toBe('openai/gpt-5.3-codex');
    expect(models['gsd-codebase-mapper'].variant).toBe('high');
    expect(models['gsd-verifier'].variant).toBe('high');
  });

  it('excludes scope keys from agent map', () => {
    const models = resolveAllAgentModels('balanced', 'claude-only');
    expect(models['_top:phase']).toBeUndefined();
    expect(models['_top:quick']).toBeUndefined();
    expect(models['_top:judge']).toBeUndefined();
  });

  it('includes variant for openai-only models', () => {
    const models = resolveAllAgentModels('balanced', 'openai-only');
    expect(models['gsd-planner'].variant).toBe('xhigh');
    expect(models['gsd-executor'].variant).toBe('high');
  });

  it('has no variant for claude-only models', () => {
    const models = resolveAllAgentModels('balanced', 'claude-only');
    expect(models['gsd-planner'].variant).toBeUndefined();
    expect(models['gsd-executor'].variant).toBeUndefined();
  });
});

describe('openai-only xhigh variant differentiation', () => {
  it('uses xhigh variant for quality profile on planner', () => {
    expect(resolveAgentModel('gsd-planner', 'quality', 'openai-only').variant).toBe('xhigh');
  });

  it('uses xhigh variant for balanced profile on planner', () => {
    expect(resolveAgentModel('gsd-planner', 'balanced', 'openai-only').variant).toBe('xhigh');
  });

  it('uses high variant for budget profile on planner', () => {
    expect(resolveAgentModel('gsd-planner', 'budget', 'openai-only').variant).toBe('high');
  });

  it('uses high variant for quality profile on executor (stays high)', () => {
    expect(resolveAgentModel('gsd-executor', 'quality', 'openai-only').variant).toBe('high');
  });
});

describe('resolveTopLevelModel with _top: keys', () => {
  it('resolves phase scope in openai-only to xhigh quality', () => {
    expect(resolveTopLevelModel('phase', 'quality', 'openai-only')).toEqual({
      model: 'openai/gpt-5.3-codex',
      variant: 'xhigh',
    });
  });

  it('resolves milestone scope same as phase (both map to _top:phase)', () => {
    expect(resolveTopLevelModel('milestone', 'quality', 'openai-only')).toEqual(
      resolveTopLevelModel('phase', 'quality', 'openai-only'),
    );
  });

  it('resolves quick scope in claude-only to balanced sonnet', () => {
    expect(resolveTopLevelModel('quick', 'balanced', 'claude-only')).toEqual({
      model: 'anthropic/claude-sonnet-4-6',
    });
  });

  it('resolves judge scope in hybrid to xhigh quality codex', () => {
    expect(resolveTopLevelModel('judge', 'quality', 'hybrid')).toEqual({
      model: 'openai/gpt-5.3-codex',
      variant: 'xhigh',
    });
  });
});

describe('hybrid role-based routing', () => {
  const buildAgents = [
    'gsd-planner',
    'gsd-roadmapper',
    'gsd-executor',
    'gsd-debugger',
    'gsd-phase-researcher',
    'gsd-project-researcher',
  ];

  const checkAgents = [
    'gsd-codebase-mapper',
    'gsd-verifier',
    'gsd-plan-checker',
    'gsd-integration-checker',
  ];

  const profiles: ModelProfile[] = ['quality', 'balanced', 'budget'];

  it('build-role agents in hybrid match their claude-only equivalents', () => {
    // Researchers' budget profile differs (sonnet in hybrid vs haiku in claude-only) — tested separately
    const researcherAgents = new Set(['gsd-phase-researcher', 'gsd-project-researcher']);

    for (const agent of buildAgents) {
      for (const profile of profiles) {
        if (researcherAgents.has(agent) && profile === 'budget') continue;
        expect(resolveAgentModel(agent, profile, 'hybrid')).toEqual(
          resolveAgentModel(agent, profile, 'claude-only'),
        );
      }
    }
  });

  it('research-synthesizer budget in hybrid uses sonnet (not haiku)', () => {
    const hybridBudget = resolveAgentModel('gsd-research-synthesizer', 'budget', 'hybrid');
    expect(hybridBudget.model).toBe('anthropic/claude-sonnet-4-6');
    // Verify it differs from claude-only budget (which uses haiku)
    const claudeOnlyBudget = resolveAgentModel('gsd-research-synthesizer', 'budget', 'claude-only');
    expect(claudeOnlyBudget.model).toBe('anthropic/claude-haiku-4-5');
    expect(hybridBudget.model).not.toBe(claudeOnlyBudget.model);
  });

  it('researcher budget in hybrid uses sonnet (not haiku)', () => {
    expect(resolveAgentModel('gsd-phase-researcher', 'budget', 'hybrid').model).toBe(
      'anthropic/claude-sonnet-4-6',
    );
    expect(resolveAgentModel('gsd-project-researcher', 'budget', 'hybrid').model).toBe(
      'anthropic/claude-sonnet-4-6',
    );
  });

  it('check-role agents in hybrid match their openai-only equivalents', () => {
    for (const agent of checkAgents) {
      for (const profile of profiles) {
        expect(resolveAgentModel(agent, profile, 'hybrid')).toEqual(
          resolveAgentModel(agent, profile, 'openai-only'),
        );
      }
    }
  });

  it('no haiku in hybrid table', () => {
    const hybridTable = AGENT_MODELS['hybrid'];
    for (const agentOrScope of Object.keys(hybridTable)) {
      for (const profile of profiles) {
        const entry = hybridTable[agentOrScope][profile as ModelProfile];
        expect(entry.model).not.toContain('haiku');
      }
    }
  });
});

describe('patchAgentFrontmatter', () => {
  it('adds model line when frontmatter has no model', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    const agentDir = path.join(projectDir, '.opencode', 'agents');
    mkdirSync(agentDir, { recursive: true });

    const filePath = path.join(agentDir, 'gsd-planner.md');
    writeFileSync(
      filePath,
      [
        '---',
        'name: gsd-planner',
        'description: Planner agent',
        '---',
        '',
        '# Planner',
      ].join('\n'),
      'utf8',
    );

    patchAgentFrontmatter(projectDir, { 'gsd-planner': { model: 'openai/gpt-5.2-codex', variant: 'high' } });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('description: Planner agent\nmodel: "openai/gpt-5.2-codex"\nvariant: "high"\n---');
  });

  it('updates existing model line', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    const agentDir = path.join(projectDir, '.opencode', 'agents');
    mkdirSync(agentDir, { recursive: true });

    const filePath = path.join(agentDir, 'gsd-executor.md');
    writeFileSync(
      filePath,
      [
        '---',
        'name: gsd-executor',
        'description: Executor agent',
        'model: "anthropic/claude-haiku-4-5"',
        '---',
        '',
        '# Executor',
      ].join('\n'),
      'utf8',
    );

    patchAgentFrontmatter(projectDir, { 'gsd-executor': { model: 'anthropic/claude-opus-4-6' } });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('model: "anthropic/claude-opus-4-6"');
    expect(content).not.toContain('model: "anthropic/claude-haiku-4-5"');
  });

  it('skips missing agent files without throwing', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });

    expect(() => {
      patchAgentFrontmatter(projectDir, { 'gsd-verifier': { model: 'openai/gpt-4.1-mini' } });
    }).not.toThrow();
  });

  it('writes variant line in frontmatter when entry has variant', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    const agentDir = path.join(projectDir, '.opencode', 'agents');
    mkdirSync(agentDir, { recursive: true });

    const filePath = path.join(agentDir, 'gsd-planner.md');
    writeFileSync(
      filePath,
      [
        '---',
        'name: gsd-planner',
        'description: Planner agent',
        '---',
        '',
        '# Planner',
      ].join('\n'),
      'utf8',
    );

    patchAgentFrontmatter(projectDir, { 'gsd-planner': { model: 'openai/gpt-5.3-codex', variant: 'high' } });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('model: "openai/gpt-5.3-codex"');
    expect(content).toContain('variant: "high"');
  });

  it('removes existing variant line when entry has no variant', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    const agentDir = path.join(projectDir, '.opencode', 'agents');
    mkdirSync(agentDir, { recursive: true });

    const filePath = path.join(agentDir, 'gsd-executor.md');
    writeFileSync(
      filePath,
      [
        '---',
        'name: gsd-executor',
        'description: Executor agent',
        'model: "openai/gpt-5.3-codex"',
        'variant: "high"',
        '---',
        '',
        '# Executor',
      ].join('\n'),
      'utf8',
    );

    // Entry without variant — should remove existing variant line
    patchAgentFrontmatter(projectDir, { 'gsd-executor': { model: 'anthropic/claude-sonnet-4-6' } });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('model: "anthropic/claude-sonnet-4-6"');
    expect(content).not.toContain('variant:');
  });

  it('updates existing variant line when entry has different variant', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    const agentDir = path.join(projectDir, '.opencode', 'agents');
    mkdirSync(agentDir, { recursive: true });

    const filePath = path.join(agentDir, 'gsd-planner.md');
    writeFileSync(
      filePath,
      [
        '---',
        'name: gsd-planner',
        'description: Planner agent',
        'model: "openai/gpt-5.3-codex"',
        'variant: "low"',
        '---',
        '',
        '# Planner',
      ].join('\n'),
      'utf8',
    );

    patchAgentFrontmatter(projectDir, { 'gsd-planner': { model: 'openai/gpt-5.3-codex', variant: 'high' } });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('variant: "high"');
    expect(content).not.toContain('variant: "low"');
  });
});

// ── DB-backed resolution tests ────────────────────────────────────────────
// These tests initialize a test DB so resolve functions read from the
// seeded model_profiles table instead of only AGENT_MODELS.

describe('DB-backed resolveAgentModel', () => {
  beforeEach(() => {
    _getTestDb();
  });

  it('resolveAgentModel returns seeded DB value matching AGENT_MODELS', () => {
    const result = resolveAgentModel('gsd-executor', 'balanced', 'claude-only');
    expect(result.model).toBe(AGENT_MODELS['claude-only']['gsd-executor']['balanced'].model);
  });

  it('resolveAgentModel returns updated value after DB change', () => {
    setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/test-model', 'xhigh');

    const result = resolveAgentModel('gsd-executor', 'balanced', 'claude-only');
    expect(result.model).toBe('custom/test-model');
    expect(result.variant).toBe('xhigh');
  });

  it('resolveAllAgentModels returns agents without scope entries', () => {
    const models = resolveAllAgentModels('balanced', 'claude-only');

    // No _top: keys should be present
    for (const key of Object.keys(models)) {
      expect(key.startsWith('_top:')).toBe(false);
    }

    // Should have 11 agents
    expect(Object.keys(models)).toHaveLength(11);
  });

  it('resolveTopLevelModel returns DB value for scopes', () => {
    const result = resolveTopLevelModel('phase', 'balanced', 'claude-only');
    expect(result.model).toBe(AGENT_MODELS['claude-only']['_top:phase']['balanced'].model);
  });

  it('resolveTopLevelModel maps milestone to _top:phase', () => {
    // Customize _top:phase
    setModelEntry('claude-only', '_top:phase', 'balanced', 'custom/milestone-model');

    // milestone should resolve to the same customized value
    const result = resolveTopLevelModel('milestone', 'balanced', 'claude-only');
    expect(result.model).toBe('custom/milestone-model');
  });

  it('resolve with custom provider mode', () => {
    addProviderMode('my-test-mode', 'Test mode', false);
    setModelEntry('my-test-mode', 'gsd-executor', 'balanced', 'custom/executor-v2', 'high');

    const result = resolveAgentModel('gsd-executor', 'balanced', 'my-test-mode');
    expect(result.model).toBe('custom/executor-v2');
    expect(result.variant).toBe('high');
  });

  it('resolveAllAgentModels returns empty for custom mode with no entries', () => {
    addProviderMode('empty-mode', 'Empty mode', false);

    const models = resolveAllAgentModels('balanced', 'empty-mode');
    expect(Object.keys(models)).toHaveLength(0);
  });
});
