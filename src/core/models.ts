import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelProfile, ProviderMode } from './types.js';

type ModelTier = 'opus' | 'sonnet' | 'haiku';

const AGENT_PROFILE_TIERS: Record<string, Record<ModelProfile, ModelTier>> = {
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

const PROVIDER_MODELS: Record<ProviderMode, Record<ModelTier, string>> = {
  'claude-only': {
    opus: 'anthropic/claude-opus-4-6',
    sonnet: 'anthropic/claude-sonnet-4-6',
    haiku: 'anthropic/claude-haiku-4-5',
  },
  'openai-only': {
    opus: 'openai/gpt-5.3-codex',
    sonnet: 'openai/gpt-5.1-codex-mini',
    haiku: 'openai/gpt-4.1-mini',
  },
  hybrid: {
    opus: 'openai/gpt-5.3-codex',
    sonnet: 'openai/gpt-5.1-codex-mini',
    haiku: 'openai/gpt-4.1-nano',
  },
};

function resolveAgentModel(
  agentName: string,
  profile: ModelProfile,
  providerMode: ProviderMode,
): string {
  const tiers = AGENT_PROFILE_TIERS[agentName];
  if (!tiers) {
    throw new Error(`Unknown agent for model resolution: ${agentName}`);
  }

  const tier = tiers[profile];
  const model = PROVIDER_MODELS[providerMode][tier];
  if (!model) {
    throw new Error(`No model mapping for ${agentName} (${profile}/${providerMode})`);
  }

  return model;
}

function resolveAllAgentModels(
  profile: ModelProfile,
  providerMode: ProviderMode,
): Record<string, string> {
  const models: Record<string, string> = {};
  for (const agentName of Object.keys(AGENT_PROFILE_TIERS)) {
    models[agentName] = resolveAgentModel(agentName, profile, providerMode);
  }
  return models;
}

function patchAgentFrontmatter(projectDir: string, models: Record<string, string>): void {
  for (const [agentName, modelId] of Object.entries(models)) {
    const agentPath = path.join(projectDir, '.opencode', 'agents', `${agentName}.md`);

    let content: string;
    try {
      content = readFileSync(agentPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw err;
    }

    const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
    if (!match) {
      continue;
    }

    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const currentFrontmatter = match[2];
    const frontmatterLines = currentFrontmatter.split(/\r?\n/);
    const modelLine = `model: "${modelId}"`;

    const existingModelIndex = frontmatterLines.findIndex((line) => /^\s*model\s*:/.test(line));
    if (existingModelIndex >= 0) {
      frontmatterLines[existingModelIndex] = modelLine;
    } else {
      const descriptionIndex = frontmatterLines.findIndex((line) => /^\s*description\s*:/.test(line));
      if (descriptionIndex >= 0) {
        frontmatterLines.splice(descriptionIndex + 1, 0, modelLine);
      } else {
        frontmatterLines.push(modelLine);
      }
    }

    const updatedFrontmatter = frontmatterLines.join(newline);
    const updatedContent = `${match[1]}${updatedFrontmatter}${match[3]}${content.slice(match[0].length)}`;

    if (updatedContent !== content) {
      writeFileSync(agentPath, updatedContent, 'utf8');
    }
  }
}

/**
 * Resolve the top-level session model for --model flag based on scope.
 * - phase scope: orchestrator agent = uses planner tier (opus/sonnet per profile)
 * - quick scope: executor tier (opus/sonnet per profile)
 * - judge sessions: always haiku tier (cheapest — just parsing a transcript)
 * - milestone: same as phase (orchestrator)
 */
function resolveTopLevelModel(
  scope: 'phase' | 'quick' | 'milestone' | 'judge',
  profile: ModelProfile,
  providerMode: ProviderMode,
): string {
  // Map scope to the equivalent agent tier lookup
  const SCOPE_TIER_MAP: Record<string, Record<ModelProfile, ModelTier>> = {
    'phase':     AGENT_PROFILE_TIERS['gsd-planner']!,    // Orchestrator = planner tier
    'milestone': AGENT_PROFILE_TIERS['gsd-planner']!,   // Same as phase
    'quick':     AGENT_PROFILE_TIERS['gsd-executor']!,   // Direct executor
    'judge': { quality: 'haiku', balanced: 'haiku', budget: 'haiku' },  // Always cheapest
  };

  const tiers = SCOPE_TIER_MAP[scope];
  if (!tiers) {
    // Fallback: use executor tier for unknown scopes
    const fallbackTiers = AGENT_PROFILE_TIERS['gsd-executor']!;
    const tier = fallbackTiers[profile];
    return PROVIDER_MODELS[providerMode][tier];
  }

  const tier = tiers[profile];
  return PROVIDER_MODELS[providerMode][tier];
}

export { resolveAgentModel, resolveAllAgentModels, resolveTopLevelModel, patchAgentFrontmatter, PROVIDER_MODELS };
