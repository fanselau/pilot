import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { patchAgentFrontmatter, resolveAgentModel, resolveAllAgentModels, resolveVariant } from '../../src/core/models.js';
import type { ModelProfile, ProviderMode } from '../../src/core/types.js';

const AGENT_TIERS: Record<string, Record<ModelProfile, 'opus' | 'sonnet' | 'haiku'>> = {
  'gsd-planner': { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'gsd-roadmapper': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-phase-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-project-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-codebase-mapper': { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'gsd-verifier': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-plan-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-integration-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};

const PROVIDER_MODELS: Record<ProviderMode, Record<'opus' | 'sonnet' | 'haiku', string>> = {
  'claude-only': {
    opus: 'anthropic/claude-opus-4-6',
    sonnet: 'anthropic/claude-sonnet-4-6',
    haiku: 'anthropic/claude-haiku-4-5',
  },
  'openai-only': {
    opus: 'openai/gpt-5.3-codex',
    sonnet: 'openai/gpt-5.3-codex',
    haiku: 'openai/gpt-5.3-codex',
  },
  hybrid: {
    opus: 'anthropic/claude-opus-4-6',
    sonnet: 'anthropic/claude-sonnet-4-6',
    haiku: 'openai/gpt-5.3-codex',
  },
};

describe('resolveAgentModel', () => {
  it('resolves all 99 profile/provider combinations', () => {
    const profiles: ModelProfile[] = ['quality', 'balanced', 'budget'];
    const providers: ProviderMode[] = ['claude-only', 'openai-only', 'hybrid'];

    for (const [agentName, profileMap] of Object.entries(AGENT_TIERS)) {
      for (const profile of profiles) {
        for (const provider of providers) {
          const expectedTier = profileMap[profile];
          const expectedModel = PROVIDER_MODELS[provider][expectedTier];
          expect(resolveAgentModel(agentName, profile, provider)).toBe(expectedModel);
        }
      }
    }
  });

  it('resolves the full agent map', () => {
    const models = resolveAllAgentModels('balanced', 'hybrid');
    expect(Object.keys(models)).toHaveLength(11);
    expect(models['gsd-planner']).toBe('anthropic/claude-opus-4-6');
    expect(models['gsd-executor']).toBe('anthropic/claude-sonnet-4-6');
    expect(models['gsd-phase-researcher']).toBe('anthropic/claude-sonnet-4-6');
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

    patchAgentFrontmatter(projectDir, { 'gsd-planner': 'openai/gpt-5.2-codex' });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('description: Planner agent\nmodel: "openai/gpt-5.2-codex"\n---');
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

    patchAgentFrontmatter(projectDir, { 'gsd-executor': 'anthropic/claude-opus-4-6' });
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('model: "anthropic/claude-opus-4-6"');
    expect(content).not.toContain('model: "anthropic/claude-haiku-4-5"');
  });

  it('skips missing agent files without throwing', () => {
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'pilot-models-'));
    mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });

    expect(() => {
      patchAgentFrontmatter(projectDir, { 'gsd-verifier': 'openai/gpt-4.1-mini' });
    }).not.toThrow();
  });
});

describe('resolveVariant', () => {
  it('returns null for Claude models in all scopes', () => {
    expect(resolveVariant('anthropic/claude-opus-4-6', 'phase')).toBeNull();
    expect(resolveVariant('anthropic/claude-opus-4-6', 'quick')).toBeNull();
    expect(resolveVariant('anthropic/claude-opus-4-6', 'milestone')).toBeNull();
    expect(resolveVariant('anthropic/claude-opus-4-6', 'judge')).toBeNull();
  });

  it('returns high for codex models in phase scope', () => {
    expect(resolveVariant('openai/gpt-5.3-codex', 'phase')).toBe('high');
  });

  it('returns high for codex models in quick scope', () => {
    expect(resolveVariant('openai/gpt-5.3-codex', 'quick')).toBe('high');
  });

  it('returns high for codex models in milestone scope', () => {
    expect(resolveVariant('openai/gpt-5.3-codex', 'milestone')).toBe('high');
  });

  it('returns low for codex models in judge scope', () => {
    expect(resolveVariant('openai/gpt-5.3-codex', 'judge')).toBe('low');
  });

  it('returns null for non-codex non-gpt-5 models', () => {
    expect(resolveVariant('anthropic/claude-haiku-4-5', 'phase')).toBeNull();
    expect(resolveVariant('openai/gpt-4.1-mini', 'phase')).toBeNull();
    expect(resolveVariant('openai/gpt-4.1-nano', 'quick')).toBeNull();
  });

  it('returns high for gpt-5 models without codex in name', () => {
    expect(resolveVariant('openai/gpt-5.1-codex-mini', 'phase')).toBe('high');
  });
});
