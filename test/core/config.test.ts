/**
 * Tests for resolveProjectDir() and resource management config fields in src/core/config.ts.
 *
 * Covers all four resolution modes:
 *   1. Absolute path  → returned as-is
 *   2. Tilde path     → expanded to home dir
 *   3. Relative path  → resolved relative to process.cwd()
 *   4. Shorthand name → joined to configured projectDir (PILOT_PROJECT_DIR)
 *
 * Also covers the three resource management config fields:
 *   sessionMemoryMaxMb, reservedMemoryMb, memoryKillThresholdMb
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// resolveProjectDir calls getConfig() internally, and getConfig() reads
// PILOT_PROJECT_DIR from environment. We control it via env var so we don't
// need to mock the module internals.
const MOCK_PROJECT_DIR = '/home/test/projects';

beforeEach(() => {
  process.env.PILOT_PROJECT_DIR = MOCK_PROJECT_DIR;
});

afterEach(() => {
  delete process.env.PILOT_PROJECT_DIR;
});

// Import after setting env to ensure getConfig picks up the test value
import { resolveProjectDir, getConfig } from '../../src/core/config.js';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('resolveProjectDir', () => {
  it('returns absolute path as-is', () => {
    const result = resolveProjectDir('/opt/projects/foo');
    expect(result).toBe('/opt/projects/foo');
  });

  it('expands tilde to home directory', () => {
    const result = resolveProjectDir('~/clients/foo');
    expect(result).toBe(path.join(os.homedir(), 'clients/foo'));
  });

  it('resolves "." to current working directory', () => {
    const result = resolveProjectDir('.');
    expect(result).toBe(process.cwd());
  });

  it('resolves "./" relative paths relative to cwd', () => {
    const result = resolveProjectDir('./my-project');
    expect(result).toBe(path.resolve('./my-project'));
  });

  it('resolves "../" relative paths relative to cwd', () => {
    const result = resolveProjectDir('../other');
    expect(result).toBe(path.resolve('../other'));
  });

  it('joins shorthand name to configured projectDir', () => {
    const result = resolveProjectDir('my-project');
    expect(result).toBe(path.join(MOCK_PROJECT_DIR, 'my-project'));
  });

  it('absolute path is not modified even when projectDir differs', () => {
    // Make sure the absolute detection takes priority over any prefix logic
    const absPath = '/tmp/some-other-path';
    expect(resolveProjectDir(absPath)).toBe(absPath);
  });
});

// ── Resource management config fields ─────────────────────────────────────

describe('resource management config fields', () => {
  const ENV_VARS = [
    'PILOT_SESSION_MEMORY_MAX_MB',
    'PILOT_RESERVED_MEMORY_MB',
    'PILOT_MEMORY_KILL_THRESHOLD_MB',
  ] as const;

  afterEach(() => {
    for (const v of ENV_VARS) delete process.env[v];
  });

  it('returns correct defaults when env vars are not set', () => {
    for (const v of ENV_VARS) delete process.env[v];
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(8192);
    expect(config.reservedMemoryMb).toBe(4096);
    expect(config.memoryKillThresholdMb).toBe(2048);
  });

  it('PILOT_SESSION_MEMORY_MAX_MB overrides sessionMemoryMaxMb', () => {
    process.env.PILOT_SESSION_MEMORY_MAX_MB = '4096';
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(4096);
  });

  it('PILOT_RESERVED_MEMORY_MB overrides reservedMemoryMb', () => {
    process.env.PILOT_RESERVED_MEMORY_MB = '8192';
    const config = getConfig();
    expect(config.reservedMemoryMb).toBe(8192);
  });

  it('PILOT_MEMORY_KILL_THRESHOLD_MB overrides memoryKillThresholdMb', () => {
    process.env.PILOT_MEMORY_KILL_THRESHOLD_MB = '1024';
    const config = getConfig();
    expect(config.memoryKillThresholdMb).toBe(1024);
  });

  it('NaN env values fall back to defaults (non-numeric input)', () => {
    process.env.PILOT_SESSION_MEMORY_MAX_MB = 'not-a-number';
    process.env.PILOT_RESERVED_MEMORY_MB = 'invalid';
    process.env.PILOT_MEMORY_KILL_THRESHOLD_MB = 'xyz';
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(8192);
    expect(config.reservedMemoryMb).toBe(4096);
    expect(config.memoryKillThresholdMb).toBe(2048);
  });
});
