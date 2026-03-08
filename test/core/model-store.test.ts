/**
 * Tests for src/core/model-store.ts — CRUD operations for model_profiles and provider_modes.
 *
 * Covers:
 *   - Seeding: model_profiles rows, built-in provider modes, is_builtin flags
 *   - getModelEntry / setModelEntry: known/unknown combos, variant handling
 *   - getAllEntriesForMode / getAllEntriesForModeAndProfile: filtering
 *   - getProviderModes / getProviderMode: listing, lookup
 *   - addProviderMode / removeProviderMode: custom mode lifecycle
 *   - resetProviderMode / resetAllToDefaults: restore defaults
 *   - isCustomized: detect modifications
 *   - cloneProviderMode: copy entries between modes
 *
 * Uses in-memory database via _getTestDb() for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { _getTestDb, seedModelTables } from '../../src/core/db.js';
import {
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
} from '../../src/core/model-store.js';
import { AGENT_MODELS } from '../../src/core/models.js';
import type { ModelProfile, ProviderMode } from '../../src/core/types.js';

describe('model-store', () => {
  beforeEach(() => {
    _getTestDb();
  });

  // ── Seeding ──────────────────────────────────────────────────────────

  describe('seeding', () => {
    it('seeds model_profiles rows on fresh DB', () => {
      const entries = getAllEntriesForMode('claude-only');
      expect(entries.length).toBeGreaterThan(0);

      // Each built-in mode should have entries
      const openaiEntries = getAllEntriesForMode('openai-only');
      expect(openaiEntries.length).toBeGreaterThan(0);

      const hybridEntries = getAllEntriesForMode('hybrid');
      expect(hybridEntries.length).toBeGreaterThan(0);
    });

    it('seeds 3 built-in provider modes on fresh DB', () => {
      const modes = getProviderModes();
      const builtinModes = modes.filter((m) => m.is_builtin === 1);
      expect(builtinModes).toHaveLength(3);

      const names = builtinModes.map((m) => m.name).sort();
      expect(names).toEqual(['claude-only', 'hybrid', 'openai-only']);
    });

    it('all provider modes marked as built-in', () => {
      const modes = getProviderModes();
      for (const mode of modes) {
        expect(mode.is_builtin).toBe(1);
      }
    });

    it('seeding is idempotent — calling seedModelTables again does not double rows', () => {
      const countBefore = getAllEntriesForMode('claude-only').length;
      // seedModelTables checks if provider_modes is non-empty — should be a no-op
      const db = _getTestDb();
      seedModelTables(db);
      const countAfter = getAllEntriesForMode('claude-only').length;
      expect(countAfter).toBe(countBefore);
    });
  });

  // ── getModelEntry ────────────────────────────────────────────────────

  describe('getModelEntry', () => {
    it('returns correct entry for known agent/mode/profile', () => {
      const entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry).not.toBeNull();
      expect(entry!.model).toBe(AGENT_MODELS['claude-only']['gsd-executor']['balanced'].model);
      expect(entry!.provider_mode).toBe('claude-only');
      expect(entry!.agent_or_scope).toBe('gsd-executor');
      expect(entry!.profile).toBe('balanced');
    });

    it('returns null for non-existent agent', () => {
      const entry = getModelEntry('claude-only', 'gsd-nonexistent', 'balanced');
      expect(entry).toBeNull();
    });

    it('returns null for non-existent provider mode', () => {
      const entry = getModelEntry('nonexistent-mode', 'gsd-executor', 'balanced');
      expect(entry).toBeNull();
    });

    it('returns null for non-existent profile', () => {
      const entry = getModelEntry('claude-only', 'gsd-executor', 'nonexistent' as ModelProfile);
      expect(entry).toBeNull();
    });
  });

  // ── setModelEntry ────────────────────────────────────────────────────

  describe('setModelEntry', () => {
    it('updates existing entry', () => {
      const newModel = 'anthropic/claude-test-model';
      setModelEntry('claude-only', 'gsd-executor', 'balanced', newModel);

      const entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry).not.toBeNull();
      expect(entry!.model).toBe(newModel);
    });

    it('creates new entry for custom combo', () => {
      setModelEntry('claude-only', 'gsd-custom-agent', 'balanced', 'anthropic/claude-test');

      const entry = getModelEntry('claude-only', 'gsd-custom-agent', 'balanced');
      expect(entry).not.toBeNull();
      expect(entry!.model).toBe('anthropic/claude-test');
    });

    it('handles variant null and non-null', () => {
      // Set with variant
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'openai/gpt-5', 'high');
      let entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry!.variant).toBe('high');

      // Set without variant (null)
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'openai/gpt-5', null);
      entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry!.variant).toBeNull();

      // Set with undefined (should become null)
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'openai/gpt-5');
      entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry!.variant).toBeNull();
    });
  });

  // ── getAllEntriesForMode ──────────────────────────────────────────────

  describe('getAllEntriesForMode', () => {
    it('returns entries for claude-only', () => {
      const entries = getAllEntriesForMode('claude-only');
      expect(entries.length).toBeGreaterThan(0);

      // Should contain agents and scopes
      const agents = entries.filter((e) => !e.agent_or_scope.startsWith('_top:'));
      const scopes = entries.filter((e) => e.agent_or_scope.startsWith('_top:'));
      expect(agents.length).toBeGreaterThan(0);
      expect(scopes.length).toBeGreaterThan(0);
    });

    it('returns empty for unknown mode', () => {
      const entries = getAllEntriesForMode('nonexistent-mode');
      expect(entries).toHaveLength(0);
    });
  });

  // ── getAllEntriesForModeAndProfile ────────────────────────────────────

  describe('getAllEntriesForModeAndProfile', () => {
    it('returns entries for known mode/profile', () => {
      const entries = getAllEntriesForModeAndProfile('claude-only', 'balanced');
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.profile).toBe('balanced');
        expect(e.provider_mode).toBe('claude-only');
      }
    });

    it('returns empty for unknown', () => {
      const entries = getAllEntriesForModeAndProfile('nonexistent', 'balanced');
      expect(entries).toHaveLength(0);
    });
  });

  // ── getProviderModes / getProviderMode ───────────────────────────────

  describe('getProviderModes / getProviderMode', () => {
    it('lists built-in modes', () => {
      const modes = getProviderModes();
      expect(modes.length).toBeGreaterThanOrEqual(3);
      const names = modes.map((m) => m.name);
      expect(names).toContain('claude-only');
      expect(names).toContain('openai-only');
      expect(names).toContain('hybrid');
    });

    it('returns null for unknown mode', () => {
      const mode = getProviderMode('nonexistent');
      expect(mode).toBeNull();
    });

    it('returns correct mode details', () => {
      const mode = getProviderMode('claude-only');
      expect(mode).not.toBeNull();
      expect(mode!.name).toBe('claude-only');
      expect(mode!.is_builtin).toBe(1);
      expect(mode!.description).toBeTruthy();
    });
  });

  // ── addProviderMode ──────────────────────────────────────────────────

  describe('addProviderMode', () => {
    it('creates a custom mode', () => {
      addProviderMode('my-custom', 'A custom mode', false);

      const mode = getProviderMode('my-custom');
      expect(mode).not.toBeNull();
      expect(mode!.name).toBe('my-custom');
      expect(mode!.description).toBe('A custom mode');
    });

    it('custom has is_builtin=0', () => {
      addProviderMode('my-custom', 'A custom mode', false);

      const mode = getProviderMode('my-custom');
      expect(mode!.is_builtin).toBe(0);
    });

    it('throws on duplicate', () => {
      addProviderMode('my-custom', 'first', false);
      expect(() => addProviderMode('my-custom', 'second', false)).toThrow();
    });
  });

  // ── removeProviderMode ───────────────────────────────────────────────

  describe('removeProviderMode', () => {
    it('removes custom mode and its entries', () => {
      addProviderMode('my-custom', 'A custom mode', false);
      setModelEntry('my-custom', 'gsd-executor', 'balanced', 'test/model');
      expect(getAllEntriesForMode('my-custom')).toHaveLength(1);

      removeProviderMode('my-custom');

      expect(getProviderMode('my-custom')).toBeNull();
      expect(getAllEntriesForMode('my-custom')).toHaveLength(0);
    });

    it('throws on built-in removal', () => {
      expect(() => removeProviderMode('claude-only')).toThrow(/built-in/i);
    });

    it('throws on non-existent mode', () => {
      expect(() => removeProviderMode('nonexistent')).toThrow(/not found/i);
    });
  });

  // ── resetProviderMode ────────────────────────────────────────────────

  describe('resetProviderMode', () => {
    it('resets customized entries to defaults', () => {
      // Customize an entry
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/model-x');
      expect(getModelEntry('claude-only', 'gsd-executor', 'balanced')!.model).toBe('custom/model-x');

      // Reset
      resetProviderMode('claude-only');

      // Should be back to default
      const entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry).not.toBeNull();
      expect(entry!.model).toBe(AGENT_MODELS['claude-only']['gsd-executor']['balanced'].model);
    });

    it('clears all entries for custom mode (no AGENT_MODELS fallback)', () => {
      addProviderMode('my-custom', 'test', false);
      setModelEntry('my-custom', 'gsd-executor', 'balanced', 'test/model');
      expect(getAllEntriesForMode('my-custom')).toHaveLength(1);

      resetProviderMode('my-custom');

      // Custom mode not in AGENT_MODELS — entries deleted, nothing re-seeded
      expect(getAllEntriesForMode('my-custom')).toHaveLength(0);
    });
  });

  // ── resetAllToDefaults ───────────────────────────────────────────────

  describe('resetAllToDefaults', () => {
    it('restores all entries after customization', () => {
      // Customize
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/model-x');

      // Reset all
      resetAllToDefaults();

      // Should be back to default
      const entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry!.model).toBe(AGENT_MODELS['claude-only']['gsd-executor']['balanced'].model);
    });

    it('removes custom modes', () => {
      addProviderMode('my-custom', 'test', false);
      setModelEntry('my-custom', 'gsd-executor', 'balanced', 'test/model');

      resetAllToDefaults();

      expect(getProviderMode('my-custom')).toBeNull();
      expect(getAllEntriesForMode('my-custom')).toHaveLength(0);
    });

    it('preserves built-in modes after reset', () => {
      resetAllToDefaults();

      const modes = getProviderModes();
      const builtinNames = modes.map((m) => m.name).sort();
      expect(builtinNames).toEqual(['claude-only', 'hybrid', 'openai-only']);
    });
  });

  // ── isCustomized ─────────────────────────────────────────────────────

  describe('isCustomized', () => {
    it('returns false for unmodified', () => {
      // Fresh DB — entries match AGENT_MODELS
      expect(isCustomized('claude-only', 'gsd-executor', 'balanced')).toBe(false);
    });

    it('returns true after modification', () => {
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/model-x');
      expect(isCustomized('claude-only', 'gsd-executor', 'balanced')).toBe(true);
    });

    it('returns true for custom provider mode', () => {
      addProviderMode('my-custom', 'test', false);
      setModelEntry('my-custom', 'gsd-executor', 'balanced', 'test/model');
      // Custom provider — not in AGENT_MODELS — always customized
      expect(isCustomized('my-custom', 'gsd-executor', 'balanced')).toBe(true);
    });

    it('returns true for unknown agent in known mode', () => {
      setModelEntry('claude-only', 'gsd-unknown', 'balanced', 'test/model');
      expect(isCustomized('claude-only', 'gsd-unknown', 'balanced')).toBe(true);
    });
  });

  // ── cloneProviderMode ────────────────────────────────────────────────

  describe('cloneProviderMode', () => {
    it('copies entries from source to target', () => {
      addProviderMode('my-clone', 'Cloned mode', false);

      cloneProviderMode('claude-only', 'my-clone');

      const sourceEntries = getAllEntriesForMode('claude-only');
      const clonedEntries = getAllEntriesForMode('my-clone');
      expect(clonedEntries).toHaveLength(sourceEntries.length);

      // Verify cloned entries match source (except provider_mode)
      for (const source of sourceEntries) {
        const cloned = clonedEntries.find(
          (e) => e.agent_or_scope === source.agent_or_scope && e.profile === source.profile,
        );
        expect(cloned).toBeDefined();
        expect(cloned!.model).toBe(source.model);
        expect(cloned!.variant).toBe(source.variant);
        expect(cloned!.provider_mode).toBe('my-clone');
      }
    });

    it('cloning from empty mode produces no entries', () => {
      addProviderMode('empty-source', 'empty', false);
      addProviderMode('my-clone', 'target', false);

      cloneProviderMode('empty-source', 'my-clone');

      expect(getAllEntriesForMode('my-clone')).toHaveLength(0);
    });
  });

  // ── Custom Provider Mode Full Lifecycle ──────────────────────────────

  describe('custom provider mode lifecycle', () => {
    it('create → populate → customize → reset → remove', () => {
      // Create
      addProviderMode('lifecycle-test', 'Testing lifecycle', false);
      expect(getProviderMode('lifecycle-test')).not.toBeNull();

      // Populate via clone
      cloneProviderMode('claude-only', 'lifecycle-test');
      const initialCount = getAllEntriesForMode('lifecycle-test').length;
      expect(initialCount).toBeGreaterThan(0);

      // Customize
      setModelEntry('lifecycle-test', 'gsd-executor', 'balanced', 'custom/test-model');
      expect(getModelEntry('lifecycle-test', 'gsd-executor', 'balanced')!.model).toBe('custom/test-model');

      // Reset (custom mode — clears all entries since not in AGENT_MODELS)
      resetProviderMode('lifecycle-test');
      expect(getAllEntriesForMode('lifecycle-test')).toHaveLength(0);

      // Remove
      removeProviderMode('lifecycle-test');
      expect(getProviderMode('lifecycle-test')).toBeNull();
    });
  });
});
