import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelEntry, ModelProfile, ProviderMode } from './types.js';

// ── Flat AGENT_MODELS lookup table ────────────────────────────────────────
//
// Maps (providerMode, agentOrScope, profile) → ModelEntry { model, variant? }
// Each cell IS the final answer — no tiers, no indirection.
//
// Agents: 11 GSD agents
// Scopes: phase, quick, milestone, judge (for resolveTopLevelModel)
// Profiles: quality, balanced, budget
// Provider modes: claude-only, openai-only, hybrid

type AgentOrScope = string;

const AGENT_MODELS: Record<ProviderMode, Record<AgentOrScope, Record<ModelProfile, ModelEntry>>> = {
  'claude-only': {
    // ── Agents ──
    'gsd-planner':              { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-opus-4-6' },   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-roadmapper':           { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-executor':             { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-phase-researcher':     { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-haiku-4-5' } },
    'gsd-project-researcher':   { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-haiku-4-5' } },
    'gsd-research-synthesizer': { quality: { model: 'anthropic/claude-sonnet-4-6' }, balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-haiku-4-5' } },
    'gsd-debugger':             { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-codebase-mapper':      { quality: { model: 'anthropic/claude-sonnet-4-6' }, balanced: { model: 'anthropic/claude-haiku-4-5' },  budget: { model: 'anthropic/claude-haiku-4-5' } },
    'gsd-verifier':             { quality: { model: 'anthropic/claude-sonnet-4-6' }, balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-haiku-4-5' } },
    'gsd-plan-checker':         { quality: { model: 'anthropic/claude-sonnet-4-6' }, balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-haiku-4-5' } },
    'gsd-integration-checker':  { quality: { model: 'anthropic/claude-sonnet-4-6' }, balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-haiku-4-5' } },
    // ── Scopes (for resolveTopLevelModel) ──
    'phase':     { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-opus-4-6' },   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'milestone': { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-opus-4-6' },   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'quick':     { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'judge':     { quality: { model: 'anthropic/claude-haiku-4-5' },  balanced: { model: 'anthropic/claude-haiku-4-5' },  budget: { model: 'anthropic/claude-haiku-4-5' } },
  },
  'openai-only': {
    // ── Agents (all use codex with variant 'high') ──
    'gsd-planner':              { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-roadmapper':           { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-executor':             { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-phase-researcher':     { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-project-researcher':   { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-research-synthesizer': { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-debugger':             { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-codebase-mapper':      { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-verifier':             { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-plan-checker':         { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-integration-checker':  { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    // ── Scopes ──
    'phase':     { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'milestone': { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'quick':     { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'judge':     { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' }, balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' }, budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
  },
  hybrid: {
    // ── Agents: opus/sonnet → Claude, haiku → Codex with variant 'high' ──
    'gsd-planner':              { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-opus-4-6' },                   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-roadmapper':           { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-executor':             { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-phase-researcher':     { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-project-researcher':   { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-research-synthesizer': { quality: { model: 'anthropic/claude-sonnet-4-6' },                 balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-debugger':             { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-codebase-mapper':      { quality: { model: 'anthropic/claude-sonnet-4-6' },                 balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' },       budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-verifier':             { quality: { model: 'anthropic/claude-sonnet-4-6' },                 balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-plan-checker':         { quality: { model: 'anthropic/claude-sonnet-4-6' },                 balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    'gsd-integration-checker':  { quality: { model: 'anthropic/claude-sonnet-4-6' },                 balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
    // ── Scopes: phase/milestone use planner tiers, quick uses executor tiers, judge always haiku (codex) ──
    'phase':     { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-opus-4-6' },                   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'milestone': { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-opus-4-6' },                   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'quick':     { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'judge':     { quality: { model: 'openai/gpt-5.3-codex', variant: 'high' },       balanced: { model: 'openai/gpt-5.3-codex', variant: 'high' },       budget: { model: 'openai/gpt-5.3-codex', variant: 'high' } },
  },
};

// ── Scope keys (excluded from agent iteration) ────────────────────────────

const SCOPE_KEYS = new Set(['phase', 'quick', 'milestone', 'judge']);

// ── Resolve functions ─────────────────────────────────────────────────────

function resolveAgentModel(
  agentName: string,
  profile: ModelProfile,
  providerMode: ProviderMode,
): ModelEntry {
  const providerTable = AGENT_MODELS[providerMode];
  const agentProfiles = providerTable[agentName];
  if (!agentProfiles) {
    throw new Error(`Unknown agent for model resolution: ${agentName}`);
  }

  const entry = agentProfiles[profile];
  if (!entry) {
    throw new Error(`No model mapping for ${agentName} (${profile}/${providerMode})`);
  }

  return entry;
}

function resolveAllAgentModels(
  profile: ModelProfile,
  providerMode: ProviderMode,
): Record<string, ModelEntry> {
  const models: Record<string, ModelEntry> = {};
  const providerTable = AGENT_MODELS[providerMode];
  for (const key of Object.keys(providerTable)) {
    if (SCOPE_KEYS.has(key)) continue; // Skip scope entries
    models[key] = resolveAgentModel(key, profile, providerMode);
  }
  return models;
}

/**
 * Resolve the top-level session model for --model flag based on scope.
 * Returns ModelEntry with model string and optional variant.
 *
 * - phase scope: orchestrator agent = uses planner tier (opus/sonnet per profile)
 * - quick scope: executor tier (opus/sonnet per profile)
 * - judge sessions: always haiku tier (cheapest — just parsing a transcript)
 * - milestone: same as phase (orchestrator)
 */
function resolveTopLevelModel(
  scope: 'phase' | 'quick' | 'milestone' | 'judge',
  profile: ModelProfile,
  providerMode: ProviderMode,
): ModelEntry {
  const providerTable = AGENT_MODELS[providerMode];
  const scopeProfiles = providerTable[scope];
  if (!scopeProfiles) {
    // Fallback: use executor tier for unknown scopes
    const fallback = providerTable['quick'];
    return fallback[profile];
  }

  return scopeProfiles[profile];
}

function patchAgentFrontmatter(projectDir: string, models: Record<string, ModelEntry>): void {
  for (const [agentName, entry] of Object.entries(models)) {
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
    const modelLine = `model: "${entry.model}"`;

    // Update or insert model line
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

    // Update or insert/remove variant line
    const existingVariantIndex = frontmatterLines.findIndex((line) => /^\s*variant\s*:/.test(line));
    if (entry.variant) {
      const variantLine = `variant: "${entry.variant}"`;
      if (existingVariantIndex >= 0) {
        frontmatterLines[existingVariantIndex] = variantLine;
      } else {
        // Insert after model line
        const modelIdx = frontmatterLines.findIndex((line) => /^\s*model\s*:/.test(line));
        if (modelIdx >= 0) {
          frontmatterLines.splice(modelIdx + 1, 0, variantLine);
        } else {
          frontmatterLines.push(variantLine);
        }
      }
    } else if (existingVariantIndex >= 0) {
      // Remove existing variant line when entry has no variant
      frontmatterLines.splice(existingVariantIndex, 1);
    }

    const updatedFrontmatter = frontmatterLines.join(newline);
    const updatedContent = `${match[1]}${updatedFrontmatter}${match[3]}${content.slice(match[0].length)}`;

    if (updatedContent !== content) {
      writeFileSync(agentPath, updatedContent, 'utf8');
    }
  }
}

export { resolveAgentModel, resolveAllAgentModels, resolveTopLevelModel, patchAgentFrontmatter, AGENT_MODELS };
