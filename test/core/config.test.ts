/**
 * Tests for resolveProjectDir() in src/core/config.ts.
 *
 * Covers all four resolution modes:
 *   1. Absolute path  → returned as-is
 *   2. Tilde path     → expanded to home dir
 *   3. Relative path  → resolved relative to process.cwd()
 *   4. Shorthand name → joined to configured projectDir (PILOT_PROJECT_DIR)
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
import { resolveProjectDir } from '../../src/core/config.js';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('resolveProjectDir', () => {
  it('returns absolute path as-is', () => {
    const result = resolveProjectDir('/home/user/clients/foo');
    expect(result).toBe('/home/user/clients/foo');
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
