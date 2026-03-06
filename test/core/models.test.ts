import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { patchAgentFrontmatter, resolveAgentModel, resolveAllAgentModels, AGENT_MODELS } from '../../src/core/models.js';
import type { ModelProfile, ProviderMode } from '../../src/core/types.js';

const SCOPE_KEYS = new Set(['phase', 'quick', 'milestone', 'judge']);

describe('resolveAgentModel', () => {
  it('resolves all agent/profile/provider combinations from AGENT_MODELS', () => {
    const profiles: ModelProfile[] = ['quality', 'balanced', 'budget'];
    const providers: ProviderMode[] = ['claude-only', 'openai-only', 'hybrid'];

    for (const provider of providers) {
      for (const agentName of Object.keys(AGENT_MODELS[provider])) {
        if (SCOPE_KEYS.has(agentName)) continue;
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
  });

  it('excludes scope keys from agent map', () => {
    const models = resolveAllAgentModels('balanced', 'claude-only');
    expect(models['phase']).toBeUndefined();
    expect(models['quick']).toBeUndefined();
    expect(models['milestone']).toBeUndefined();
    expect(models['judge']).toBeUndefined();
  });

  it('includes variant for openai-only models', () => {
    const models = resolveAllAgentModels('balanced', 'openai-only');
    expect(models['gsd-planner'].variant).toBe('high');
    expect(models['gsd-executor'].variant).toBe('high');
  });

  it('has no variant for claude-only models', () => {
    const models = resolveAllAgentModels('balanced', 'claude-only');
    expect(models['gsd-planner'].variant).toBeUndefined();
    expect(models['gsd-executor'].variant).toBeUndefined();
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
