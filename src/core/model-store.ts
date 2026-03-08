/**
 * Model store — CRUD operations for model_profiles and provider_modes tables.
 *
 * Provides the data layer for dynamic model configuration.
 * All functions are synchronous (better-sqlite3 is sync).
 *
 * Pure core module — no UI dependencies.
 */

import { getDb, seedModelTables } from './db.js';
import { AGENT_MODELS } from './models.js';
import type { ModelProfile } from './types.js';
import type { ModelProfileRow, ProviderModeRow } from './types.js';

// ── Model Profile CRUD ───────────────────────────────────────────────────

/**
 * Get a single model entry by (providerMode, agentOrScope, profile).
 * Returns null if not found.
 */
function getModelEntry(
  providerMode: string,
  agentOrScope: string,
  profile: ModelProfile,
): ModelProfileRow | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM model_profiles WHERE provider_mode = ? AND agent_or_scope = ? AND profile = ?',
  ).get(providerMode, agentOrScope, profile) as ModelProfileRow | undefined;
  return row ?? null;
}

/**
 * Insert or replace a model entry.
 * This is how `pilot models edit` writes changes.
 */
function setModelEntry(
  providerMode: string,
  agentOrScope: string,
  profile: ModelProfile,
  model: string,
  variant?: string | null,
): void {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO model_profiles (provider_mode, agent_or_scope, profile, model, variant) VALUES (?, ?, ?, ?, ?)',
  ).run(providerMode, agentOrScope, profile, model, variant ?? null);
}

/**
 * Get all model entries for a provider mode.
 * Used by `pilot models show` and `pilot models export`.
 */
function getAllEntriesForMode(providerMode: string): ModelProfileRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM model_profiles WHERE provider_mode = ? ORDER BY agent_or_scope, profile',
  ).all(providerMode) as ModelProfileRow[];
}

/**
 * Get all model entries for a provider mode and profile.
 * Used by resolveAllAgentModels.
 */
function getAllEntriesForModeAndProfile(
  providerMode: string,
  profile: ModelProfile,
): ModelProfileRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM model_profiles WHERE provider_mode = ? AND profile = ? ORDER BY agent_or_scope',
  ).all(providerMode, profile) as ModelProfileRow[];
}

// ── Provider Mode CRUD ───────────────────────────────────────────────────

/**
 * Get all provider modes, built-in first, then by name.
 */
function getProviderModes(): ProviderModeRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM provider_modes ORDER BY is_builtin DESC, name ASC',
  ).all() as ProviderModeRow[];
}

/**
 * Get a single provider mode by name.
 * Returns null if not found.
 */
function getProviderMode(name: string): ProviderModeRow | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM provider_modes WHERE name = ?',
  ).get(name) as ProviderModeRow | undefined;
  return row ?? null;
}

/**
 * Add a new provider mode.
 * Throws if name already exists (PRIMARY KEY constraint).
 */
function addProviderMode(name: string, description: string, isBuiltin: boolean): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO provider_modes (name, description, is_builtin) VALUES (?, ?, ?)',
  ).run(name, description, isBuiltin ? 1 : 0);
}

/**
 * Remove a custom provider mode and all its model_profiles entries.
 * Throws if the mode is built-in (is_builtin=1).
 */
function removeProviderMode(name: string): void {
  const existing = getProviderMode(name);
  if (!existing) {
    throw new Error(`Provider mode '${name}' not found`);
  }
  if (existing.is_builtin === 1) {
    throw new Error(`Cannot remove built-in provider mode '${name}'`);
  }

  const db = getDb();
  db.prepare('DELETE FROM model_profiles WHERE provider_mode = ?').run(name);
  db.prepare('DELETE FROM provider_modes WHERE name = ?').run(name);
}

/**
 * Reset a provider mode to defaults from AGENT_MODELS.
 * Deletes all model_profiles rows for this mode, then re-seeds from constant.
 * If the mode is not in AGENT_MODELS (user-created), just deletes rows.
 */
function resetProviderMode(providerMode: string): void {
  const db = getDb();
  db.prepare('DELETE FROM model_profiles WHERE provider_mode = ?').run(providerMode);

  // Re-seed from AGENT_MODELS if this is a built-in mode
  const agentMap = (AGENT_MODELS as Record<string, Record<string, Record<string, { model: string; variant?: string }>>>)[providerMode];
  if (!agentMap) return;

  const insertProfile = db.prepare(
    'INSERT INTO model_profiles (provider_mode, agent_or_scope, profile, model, variant) VALUES (?, ?, ?, ?, ?)',
  );
  for (const [agentOrScope, profileMap] of Object.entries(agentMap)) {
    for (const [profile, entry] of Object.entries(profileMap)) {
      insertProfile.run(providerMode, agentOrScope, profile, entry.model, entry.variant ?? null);
    }
  }
}

/**
 * Reset everything to defaults:
 * - Delete all model_profiles rows
 * - Delete custom (non-built-in) provider_modes
 * - Re-seed all built-in modes from AGENT_MODELS
 */
function resetAllToDefaults(): void {
  const db = getDb();
  db.prepare('DELETE FROM model_profiles').run();
  db.prepare('DELETE FROM provider_modes WHERE is_builtin = 0').run();

  // Re-seed — seedModelTables checks for empty provider_modes, so we need
  // to clear built-in entries too, then re-seed everything
  db.prepare('DELETE FROM provider_modes').run();
  seedModelTables(db);
}

/**
 * Check if a specific model entry has been customized from its default.
 * Compares the DB value against AGENT_MODELS[providerMode]?.[agentOrScope]?.[profile].
 * Returns true if:
 * - The provider mode doesn't exist in AGENT_MODELS (custom provider)
 * - The model or variant differs from the hardcoded default
 * - The entry doesn't exist in AGENT_MODELS for that agent/scope/profile
 */
function isCustomized(
  providerMode: string,
  agentOrScope: string,
  profile: ModelProfile,
): boolean {
  const agentMap = (AGENT_MODELS as Record<string, Record<string, Record<string, { model: string; variant?: string }>>>)[providerMode];
  if (!agentMap) return true; // Custom provider — always "customized"

  const profileMap = agentMap[agentOrScope];
  if (!profileMap) return true; // Unknown agent/scope — customized

  const defaultEntry = profileMap[profile];
  if (!defaultEntry) return true; // Unknown profile — customized

  const dbEntry = getModelEntry(providerMode, agentOrScope, profile);
  if (!dbEntry) return true; // No DB entry — customized (missing)

  if (dbEntry.model !== defaultEntry.model) return true;
  if ((dbEntry.variant ?? null) !== (defaultEntry.variant ?? null)) return true;

  return false;
}

/**
 * Clone all model_profiles rows from one provider mode to another.
 * Used by `pilot models add-provider` when cloning from existing.
 */
function cloneProviderMode(sourceName: string, targetName: string): void {
  const db = getDb();
  const sourceEntries = getAllEntriesForMode(sourceName);

  const insert = db.prepare(
    'INSERT INTO model_profiles (provider_mode, agent_or_scope, profile, model, variant) VALUES (?, ?, ?, ?, ?)',
  );
  for (const entry of sourceEntries) {
    insert.run(targetName, entry.agent_or_scope, entry.profile, entry.model, entry.variant);
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  getModelEntry,
  setModelEntry,
  getAllEntriesForMode,
  getAllEntriesForModeAndProfile,
  getProviderModes,
  getProviderMode,
  addProviderMode,
  removeProviderMode,
  resetProviderMode,
  resetAllToDefaults,
  isCustomized,
  cloneProviderMode,
};
