/**
 * Tests for src/commands/init.ts — pilot init command.
 *
 * Covers:
 *   - --yes flag creates config with auto-detected defaults (non-interactive)
 *   - Existing config file prevents overwrite (returns early)
 *   - --force flag overwrites existing config
 *   - Written config has valid JSON with expected structure
 *   - Config file has 0o600 permissions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, statSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock providers to avoid real subprocess calls
vi.mock('../../src/core/providers.js', () => ({
  detectProviders: vi.fn().mockResolvedValue({
    providers: new Set(['anthropic', 'openai']),
    hasAnthropic: true,
    hasOpenai: true,
  }),
  getAvailableModes: vi.fn().mockReturnValue(['hybrid', 'claude-only', 'openai-only']),
  getDefaultMode: vi.fn().mockReturnValue('hybrid'),
}));

// Mock colors as identity functions
vi.mock('../../src/util/colors.js', () => ({
  bold: (s: string) => s,
  dim: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  red: (s: string) => s,
}));

import { initCommand } from '../../src/commands/init.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function createTempDir(): string {
  const base = path.join(os.tmpdir(), `pilot-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function cleanupTempDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('initCommand', () => {
  let tempDir: string;
  let tempConfigPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tempDir = createTempDir();
    tempConfigPath = path.join(tempDir, 'config.json');
    originalEnv = process.env.PILOT_CONFIG_FILE;
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PILOT_CONFIG_FILE = originalEnv;
    } else {
      delete process.env.PILOT_CONFIG_FILE;
    }
    cleanupTempDir(tempDir);
  });

  it('--yes creates config with auto-detected defaults', async () => {
    await initCommand({ yes: true });

    expect(existsSync(tempConfigPath)).toBe(true);
    const content = JSON.parse(readFileSync(tempConfigPath, 'utf-8'));

    // Verify structure
    expect(content.defaults).toBeDefined();
    expect(content.defaults.providerMode).toBe('hybrid');
    expect(content.defaults.modelProfile).toBe('balanced');
    expect(content.projectDir).toBe('~/dev');
  });

  it('written config has valid JSON with full structure', async () => {
    await initCommand({ yes: true });

    const content = JSON.parse(readFileSync(tempConfigPath, 'utf-8'));

    // Check all top-level sections exist
    expect(content.projectDir).toBeDefined();
    expect(content.runner).toBeDefined();
    expect(content.memory).toBeDefined();
    expect(content.defaults).toBeDefined();
    expect(content.notifications).toBeDefined();
    expect(content.logging).toBeDefined();

    // Check nested values
    expect(content.runner.maxParallel).toBeNull();
    expect(content.memory.sessionMaxMb).toBe(8192);
    expect(content.defaults.notifyTarget).toBeNull();
    expect(content.logging.level).toBe('INFO');
  });

  it('config file has 0o600 permissions', async () => {
    await initCommand({ yes: true });

    const stat = statSync(tempConfigPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('refuses to overwrite existing config without --force', async () => {
    // Create initial config
    await initCommand({ yes: true });
    expect(existsSync(tempConfigPath)).toBe(true);

    // Read initial content
    const initial = readFileSync(tempConfigPath, 'utf-8');

    // Try to run again without --force — should return early
    await initCommand({ yes: true });

    // Content should be unchanged (early return, not overwritten)
    const after = readFileSync(tempConfigPath, 'utf-8');
    expect(after).toBe(initial);
  });

  it('--force overwrites existing config', async () => {
    // Create initial config
    await initCommand({ yes: true });

    // Modify config manually to detect overwrite
    const modified = JSON.parse(readFileSync(tempConfigPath, 'utf-8'));
    modified.projectDir = '~/modified';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tempConfigPath, JSON.stringify(modified, null, 2) + '\n', 'utf-8');

    // Run with --force — should overwrite
    await initCommand({ yes: true, force: true });

    const content = JSON.parse(readFileSync(tempConfigPath, 'utf-8'));
    expect(content.projectDir).toBe('~/dev');  // Restored to default
  });

  it('creates parent directory if it does not exist', async () => {
    const nestedDir = path.join(tempDir, 'deep', 'nested');
    const nestedConfig = path.join(nestedDir, 'config.json');
    process.env.PILOT_CONFIG_FILE = nestedConfig;

    await initCommand({ yes: true });

    expect(existsSync(nestedConfig)).toBe(true);
  });
});
