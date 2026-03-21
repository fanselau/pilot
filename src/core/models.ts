import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMap, parseDocument } from 'yaml';
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

type FrontmatterParts = {
  frontmatter: string;
  body: string;
  newline: '\n' | '\r\n';
  separator: '' | '\n' | '\r\n';
};

type AgentFrontmatterPatchSummary = {
  patched: string[];
  unchanged: string[];
  skipped: string[];
  fallback: string[];
};

const GSD_AGENT_FILENAME_PATTERN = /^gsd-.*\.md$/;

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
 * - 'quick' / 'debug' / 'fast' → '_top:quick'
 * - 'judge' → '_top:judge'
 */
function resolveTopLevelModel(
  scope: 'phase' | 'quick' | 'milestone' | 'debug' | 'fast' | 'judge',
  profile: ModelProfile,
  providerMode: DynamicProviderMode,
): ModelEntry {
  let key: string;
  switch (scope) {
    case 'milestone': key = '_top:phase'; break;
    case 'debug':
    case 'fast':      key = '_top:quick'; break;
    default:          key = `_top:${scope}`;
  }

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

function discoverAgentFiles(projectDir: string): string[] {
  const agentsDir = path.join(projectDir, '.opencode', 'agents');

  try {
    return readdirSync(agentsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && GSD_AGENT_FILENAME_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
      .map((filename) => path.join(agentsDir, filename));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function splitFrontmatter(content: string): FrontmatterParts | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return null;
  }

  const match = content.match(/^---(\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) {
    return null;
  }

  const newline = match[1] === '\r\n' ? '\r\n' : '\n';
  return {
    frontmatter: match[2],
    body: content.slice(match[0].length),
    newline,
    separator: match[3] as FrontmatterParts['separator'],
  };
}

function parseFrontmatterDocument(frontmatter: string) {
  const doc = parseDocument(frontmatter);
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    return null;
  }
  return doc;
}

function patchModelFields(doc: ReturnType<typeof parseDocument>, entry: ModelEntry): void {
  doc.set('model', entry.model);
  if (entry.variant) {
    doc.set('variant', entry.variant);
    return;
  }
  doc.delete('variant');
}

function patchAgentFrontmatter(projectDir: string, models: Record<string, ModelEntry>): AgentFrontmatterPatchSummary {
  const summary: AgentFrontmatterPatchSummary = {
    patched: [],
    unchanged: [],
    skipped: [],
    fallback: [],
  };

  for (const agentPath of discoverAgentFiles(projectDir)) {
    const agentName = path.basename(agentPath, '.md');

    let content: string;
    try {
      content = readFileSync(agentPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        summary.skipped.push(agentName);
        continue;
      }
      throw err;
    }

    const parts = splitFrontmatter(content);
    if (!parts) {
      summary.skipped.push(agentName);
      continue;
    }

    const doc = parseFrontmatterDocument(parts.frontmatter);
    if (!doc) {
      summary.skipped.push(agentName);
      continue;
    }

    const fromMap = Object.hasOwn(models, agentName);
    const entry = fromMap ? models[agentName] : { model: 'inherit' };
    if (!fromMap) {
      summary.fallback.push(agentName);
    }

    patchModelFields(doc, entry);

    const renderedFrontmatter = String(doc)
      .trimEnd()
      .replace(/\r?\n/g, parts.newline);
    const updatedContent = `---${parts.newline}${renderedFrontmatter}${parts.newline}---${parts.separator}${parts.body}`;

    if (updatedContent === content) {
      summary.unchanged.push(agentName);
      continue;
    }

    writeFileSync(agentPath, updatedContent, 'utf8');
    summary.patched.push(agentName);
  }

  return summary;
}

export {
  resolveAgentModel,
  resolveAllAgentModels,
  resolveTopLevelModel,
  patchAgentFrontmatter,
  AGENT_MODELS,
  type AgentFrontmatterPatchSummary,
};
