import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getModelEntry, getAllEntriesForModeAndProfile } from './model-store.js';
import type { ModelEntry, ModelProfile, ProviderMode, DynamicProviderMode } from './types.js';

// ── Flat AGENT_MODELS lookup table ────────────────────────────────────────
//
// Maps (providerMode, agentOrScope, profile) → ModelEntry { model, variant? }
// Each cell IS the final answer — no tiers, no indirection.
//
// Agents: 11 GSD agents
// Scopes: _top:phase, _top:quick, _top:judge (for resolveTopLevelModel)
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
    '_top:phase': { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-opus-4-6' },   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    '_top:quick': { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    '_top:judge': { quality: { model: 'anthropic/claude-haiku-4-5' },  balanced: { model: 'anthropic/claude-haiku-4-5' },  budget: { model: 'anthropic/claude-haiku-4-5' } },
  },
  'openai-only': {
    // ── Agents (gpt-5.4 with high/medium variant defaults per spec) ──
    'gsd-planner':              { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'high' },   budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-roadmapper':           { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-executor':             { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-debugger':             { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-phase-researcher':     { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-project-researcher':   { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-research-synthesizer': { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-codebase-mapper':      { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-verifier':             { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-plan-checker':         { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-integration-checker':  { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    // ── Scopes ──
    '_top:phase': { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    '_top:quick': { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    '_top:judge': { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
  },
  // ── Hybrid: role-based separation ──
  // Build agents (planner, roadmapper, executor, debugger, researchers) → Claude (mirrors claude-only)
  // Check agents (verifier, plan-checker, integration-checker, codebase-mapper, judge) → GPT-5.4 (mirrors openai-only)
  // Two different models = two different perspectives on the same code.
  hybrid: {
    // ── Build role: mirrors claude-only (sonnet substituted for haiku on budget researchers) ──
    'gsd-planner':              { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-opus-4-6' },   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-roadmapper':           { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-executor':             { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-debugger':             { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-phase-researcher':     { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-project-researcher':   { quality: { model: 'anthropic/claude-opus-4-6' },   balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    'gsd-research-synthesizer': { quality: { model: 'anthropic/claude-sonnet-4-6' }, balanced: { model: 'anthropic/claude-sonnet-4-6' }, budget: { model: 'anthropic/claude-sonnet-4-6' } },
    // ── Check role: mirrors openai-only exactly ──
    'gsd-codebase-mapper':      { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-verifier':             { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-plan-checker':         { quality: { model: 'openai/gpt-5.4', variant: 'high' },   balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    'gsd-integration-checker':  { quality: { model: 'openai/gpt-5.4', variant: 'medium' }, balanced: { model: 'openai/gpt-5.4', variant: 'medium' }, budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
    // ── Scopes: phase/quick → Claude, judge → GPT-5.4 ──
    '_top:phase': { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-opus-4-6' },                   budget: { model: 'anthropic/claude-sonnet-4-6' } },
    '_top:quick': { quality: { model: 'anthropic/claude-opus-4-6' },                   balanced: { model: 'anthropic/claude-sonnet-4-6' },                 budget: { model: 'anthropic/claude-sonnet-4-6' } },
    '_top:judge': { quality: { model: 'openai/gpt-5.4', variant: 'high' },             balanced: { model: 'openai/gpt-5.4', variant: 'medium' },         budget: { model: 'openai/gpt-5.4', variant: 'medium' } },
  },
};

// ── Scope keys (excluded from agent iteration) ────────────────────────────
// Scope keys use _top: prefix — detected via startsWith instead of a Set.

// ── Resolve functions ─────────────────────────────────────────────────────

function resolveAgentModel(
  agentName: string,
  profile: ModelProfile,
  providerMode: DynamicProviderMode,
): ModelEntry {
  // Try DB first
  try {
    const row = getModelEntry(providerMode, agentName, profile);
    if (row) return { model: row.model, variant: row.variant ?? undefined };
  } catch {
    // DB unavailable — fall through to hardcoded
  }

  // Fallback to AGENT_MODELS
  const providerTable = AGENT_MODELS[providerMode as ProviderMode];
  const agentProfiles = providerTable?.[agentName];
  if (!agentProfiles) {
    throw new Error(`Unknown agent for model resolution: ${agentName} (${profile}/${providerMode})`);
  }

  const entry = agentProfiles[profile];
  if (!entry) {
    throw new Error(`No model mapping for ${agentName} (${profile}/${providerMode})`);
  }

  return entry;
}

function resolveAllAgentModels(
  profile: ModelProfile,
  providerMode: DynamicProviderMode,
): Record<string, ModelEntry> {
  // Try DB first
  try {
    const rows = getAllEntriesForModeAndProfile(providerMode, profile);
    if (rows.length > 0) {
      const models: Record<string, ModelEntry> = {};
      for (const row of rows) {
        if (row.agent_or_scope.startsWith('_top:')) continue; // Skip scope entries
        models[row.agent_or_scope] = { model: row.model, variant: row.variant ?? undefined };
      }
      return models;
    }
  } catch {
    // DB unavailable — fall through to hardcoded
  }

  // Fallback to AGENT_MODELS
  const models: Record<string, ModelEntry> = {};
  const providerTable = AGENT_MODELS[providerMode as ProviderMode];
  if (!providerTable) return models; // Custom mode with no hardcoded fallback
  for (const key of Object.keys(providerTable)) {
    if (key.startsWith('_top:')) continue; // Skip scope entries
    const agentProfiles = providerTable[key];
    const entry = agentProfiles?.[profile];
    if (entry) models[key] = entry;
  }
  return models;
}

/**
 * Resolve the top-level session model for --model flag based on scope.
 * Returns ModelEntry with model string and optional variant.
 *
 * Maps scope strings to _top: prefixed keys in the AGENT_MODELS table:
 * - 'phase' / 'milestone' → '_top:phase'
 * - 'quick' → '_top:quick'
 * - 'judge' → '_top:judge'
 */
function resolveTopLevelModel(
  scope: 'phase' | 'quick' | 'milestone' | 'judge',
  profile: ModelProfile,
  providerMode: DynamicProviderMode,
): ModelEntry {
  const key = scope === 'milestone' ? '_top:phase' : `_top:${scope}`;

  // Try DB first
  try {
    const row = getModelEntry(providerMode, key, profile);
    if (row) return { model: row.model, variant: row.variant ?? undefined };
  } catch {
    // DB unavailable — fall through to hardcoded
  }

  // Fallback to AGENT_MODELS
  const providerTable = AGENT_MODELS[providerMode as ProviderMode];
  const scopeProfiles = providerTable?.[key];
  if (!scopeProfiles) {
    // Fallback: use _top:quick for known modes, throw for custom modes
    const fallback = providerTable?.['_top:quick'];
    if (!fallback) {
      throw new Error(`No model mapping for scope ${scope} in provider mode ${providerMode}`);
    }
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
