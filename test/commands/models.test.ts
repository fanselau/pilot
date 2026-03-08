/**
 * Tests for src/commands/models.ts — models CLI commands.
 *
 * Covers:
 *   - modelsShowCommand: display table, --json output
 *   - modelsResetCommand: reset all and per-mode
 *   - modelsAddProviderCommand: create with --clone
 *   - modelsRemoveProviderCommand: remove custom, block built-in
 *   - modelsDiffCommand: show customizations
 *   - modelsExportCommand: valid JSON export
 *
 * Uses in-memory database via _getTestDb() for isolation.
 * Mocks output.ts and colors.ts to capture command output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _getTestDb } from '../../src/core/db.js';
import { setModelEntry, addProviderMode, getAllEntriesForMode, getProviderMode } from '../../src/core/model-store.js';
import { AGENT_MODELS } from '../../src/core/models.js';
import type { ModelProfile } from '../../src/core/types.js';

// ── Mock output.ts ──────────────────────────────────────────────────────

const outputLines: string[] = [];
let jsonOutput: Record<string, unknown> | null = null;
let mockJsonMode = false;

vi.mock('../../src/util/output.js', () => ({
  outputHuman: (text: string) => { outputLines.push(text); },
  outputJson: (data: Record<string, unknown>) => { jsonOutput = data; },
  isJsonMode: () => mockJsonMode,
  setJsonMode: vi.fn(),
}));

// ── Mock colors as identity functions ───────────────────────────────────

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
  magenta: (s: string) => s,
  gray: (s: string) => s,
}));

// ── Mock config defaults ────────────────────────────────────────────────

vi.mock('../../src/core/config.js', () => ({
  getConfigFileDefaults: () => ({
    modelProfile: 'balanced' as const,
    providerMode: 'claude-only',
    scope: null,
  }),
  getConfig: () => ({
    pilotDir: '/tmp/test-pilot',
    pilotDbPath: ':memory:',
    projectDir: '/tmp/test-project',
    gsdDir: '/tmp/test-gsd',
    maxParallel: 1,
    queueGraceSeconds: 0,
    sessionMemoryMaxMb: 8192,
    reservedMemoryMb: 4096,
    memoryKillThresholdMb: 2048,
    logLevel: 'INFO',
    noColor: false,
    telegramBotToken: null,
    telegramChatId: null,
    openclawHooksUrl: null,
    openclawHooksToken: null,
    defaultNotifySessionKey: null,
  }),
  _resetConfigCache: vi.fn(),
}));

// ── Import commands after mocks ─────────────────────────────────────────

import {
  modelsShowCommand,
  modelsResetCommand,
  modelsAddProviderCommand,
  modelsRemoveProviderCommand,
  modelsDiffCommand,
  modelsExportCommand,
} from '../../src/commands/models.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function clearOutput(): void {
  outputLines.length = 0;
  jsonOutput = null;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('models commands', () => {
  let originalExit: typeof process.exit;

  beforeEach(() => {
    _getTestDb();
    clearOutput();
    mockJsonMode = false;
    // Mock process.exit to throw instead of terminating
    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => { throw new Error(`process.exit(${code})`); }) as never;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  // ── modelsShowCommand ────────────────────────────────────────────────

  describe('modelsShowCommand', () => {
    it('displays table with agent names', async () => {
      await modelsShowCommand({});
      const output = outputLines.join('\n');
      expect(output).toContain('gsd-executor');
      expect(output).toContain('gsd-planner');
      expect(output).toContain('claude-only');
    });

    it('--json outputs JSON with entries', async () => {
      mockJsonMode = true;
      await modelsShowCommand({ json: true });

      expect(jsonOutput).not.toBeNull();
      expect(jsonOutput!.providerMode).toBe('claude-only');
      expect(Array.isArray(jsonOutput!.entries)).toBe(true);
      const entries = jsonOutput!.entries as Array<{ agentOrScope: string; profile: string; model: string }>;
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.agentOrScope === 'gsd-executor')).toBe(true);
    });

    it('shows specific provider mode when requested', async () => {
      await modelsShowCommand({ providerMode: 'openai-only' });
      const output = outputLines.join('\n');
      expect(output).toContain('openai-only');
      expect(output).toContain('gsd-executor');
    });

    it('shows warning for unknown provider mode', async () => {
      await modelsShowCommand({ providerMode: 'nonexistent' });
      const output = outputLines.join('\n');
      expect(output).toContain('not found');
    });
  });

  // ── modelsResetCommand ───────────────────────────────────────────────

  describe('modelsResetCommand', () => {
    it('resets all model assignments', async () => {
      // Customize first
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/model-x');

      await modelsResetCommand();

      const output = outputLines.join('\n');
      expect(output).toContain('Reset all');

      // Verify entry is back to default
      const { getModelEntry } = await import('../../src/core/model-store.js');
      const entry = getModelEntry('claude-only', 'gsd-executor', 'balanced');
      expect(entry!.model).toBe(AGENT_MODELS['claude-only']['gsd-executor']['balanced'].model);
    });

    it('resets specific mode', async () => {
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/model-x');

      await modelsResetCommand('claude-only');

      const output = outputLines.join('\n');
      expect(output).toContain('Reset');
      expect(output).toContain('claude-only');
    });
  });

  // ── modelsAddProviderCommand ─────────────────────────────────────────

  describe('modelsAddProviderCommand', () => {
    it('creates a new custom provider mode', async () => {
      await modelsAddProviderCommand('test-mode', {});
      const output = outputLines.join('\n');
      expect(output).toContain('Created');
      expect(output).toContain('test-mode');

      const mode = getProviderMode('test-mode');
      expect(mode).not.toBeNull();
      expect(mode!.is_builtin).toBe(0);
    });

    it('with --clone copies entries from source', async () => {
      await modelsAddProviderCommand('cloned-mode', { clone: 'claude-only' });
      const output = outputLines.join('\n');
      expect(output).toContain('cloned');
      expect(output).toContain('cloned-mode');

      const entries = getAllEntriesForMode('cloned-mode');
      const sourceEntries = getAllEntriesForMode('claude-only');
      expect(entries.length).toBe(sourceEntries.length);
    });

    it('rejects invalid name format', async () => {
      await expect(
        modelsAddProviderCommand('INVALID NAME!!', {}),
      ).rejects.toThrow('process.exit(2)');
    });

    it('rejects duplicate name', async () => {
      await modelsAddProviderCommand('new-mode', {});
      clearOutput();

      await expect(
        modelsAddProviderCommand('new-mode', {}),
      ).rejects.toThrow('process.exit(2)');
    });
  });

  // ── modelsRemoveProviderCommand ──────────────────────────────────────

  describe('modelsRemoveProviderCommand', () => {
    it('removes custom provider mode', async () => {
      addProviderMode('to-remove', 'temp mode', false);
      expect(getProviderMode('to-remove')).not.toBeNull();

      await modelsRemoveProviderCommand('to-remove', {});
      const output = outputLines.join('\n');
      expect(output).toContain('Removed');

      expect(getProviderMode('to-remove')).toBeNull();
    });

    it('blocks built-in removal with exit code 2', async () => {
      await expect(
        modelsRemoveProviderCommand('claude-only', {}),
      ).rejects.toThrow('process.exit(2)');
    });

    it('blocks non-existent mode removal', async () => {
      await expect(
        modelsRemoveProviderCommand('nonexistent', {}),
      ).rejects.toThrow('process.exit(2)');
    });
  });

  // ── modelsDiffCommand ────────────────────────────────────────────────

  describe('modelsDiffCommand', () => {
    it('shows no diff on defaults', async () => {
      await modelsDiffCommand({});
      const output = outputLines.join('\n');
      expect(output).toContain('No customizations');
    });

    it('shows diff after customization', async () => {
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/diff-test');

      await modelsDiffCommand({});
      const output = outputLines.join('\n');
      expect(output).toContain('gsd-executor');
      expect(output).toContain('custom/diff-test');
    });

    it('--json outputs diff array', async () => {
      mockJsonMode = true;
      setModelEntry('claude-only', 'gsd-executor', 'balanced', 'custom/diff-test');

      await modelsDiffCommand({ json: true });

      expect(jsonOutput).not.toBeNull();
      expect(jsonOutput!.providerMode).toBe('claude-only');
      expect(Array.isArray(jsonOutput!.diffs)).toBe(true);
      const diffs = jsonOutput!.diffs as Array<{ agentOrScope: string }>;
      expect(diffs.some((d) => d.agentOrScope === 'gsd-executor')).toBe(true);
    });
  });

  // ── modelsExportCommand ──────────────────────────────────────────────

  describe('modelsExportCommand', () => {
    it('outputs valid JSON', async () => {
      // Capture stdout directly
      const chunks: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string | Buffer) => {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
        return true;
      }) as typeof process.stdout.write;

      try {
        await modelsExportCommand({});
      } finally {
        process.stdout.write = origWrite;
      }

      const rawOutput = chunks.join('');
      expect(rawOutput.length).toBeGreaterThan(0);

      const parsed = JSON.parse(rawOutput);
      expect(parsed.version).toBe(1);
      expect(Array.isArray(parsed.provider_modes)).toBe(true);
      expect(Array.isArray(parsed.model_profiles)).toBe(true);
      expect(parsed.provider_modes.length).toBeGreaterThanOrEqual(3);
      expect(parsed.model_profiles.length).toBeGreaterThan(0);
    });
  });
});
