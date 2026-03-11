/**
 * Tests for resolveOpencodeBinary() — the binary path resolution fallback chain.
 *
 * Candidates are checked in order:
 *   1. ~/.opencode/bin/opencode (accessSync with X_OK)
 *   2. 'opencode' via PATH lookup (execSync 'which opencode')
 *
 * Falls back to bare 'opencode' if nothing resolves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// ── Mock state ─────────────────────────────────────────────────────────────

let mockAccessiblePaths: Set<string> = new Set();
let mockWhichResult: string | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock node:fs — we need accessSync, constants, readFileSync, readdirSync
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    // Pass through everything from actual
    ...actual,
    // Override accessSync
    accessSync: (filePath: unknown, _mode?: unknown) => {
      if (mockAccessiblePaths.has(String(filePath))) return undefined;
      const err = new Error(`EACCES: permission denied, access '${filePath}'`);
      (err as NodeJS.ErrnoException).code = 'EACCES';
      throw err;
    },
  };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execSync: (cmd: unknown, _opts?: unknown) => {
      if (String(cmd) === 'which opencode' && mockWhichResult !== null) {
        return mockWhichResult;
      }
      throw new Error(`Command failed: ${cmd}`);
    },
  };
});

// ── Import after mocks ────────────────────────────────────────────────────

import { resolveOpencodeBinary } from '../../src/core/delegate.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('resolveOpencodeBinary', () => {
  beforeEach(() => {
    mockAccessiblePaths = new Set();
    mockWhichResult = null;
  });

  it('returns hardcoded path when it exists and is executable', () => {
    // process.env.HOME is set to /nonexistent/pilot-suite-home by test/setup.ts
    const home = process.env['HOME'] || '';
    const hardcodedPath = path.join(home, '.opencode', 'bin', 'opencode');
    mockAccessiblePaths.add(hardcodedPath);
    const result = resolveOpencodeBinary();
    expect(result).toBe(hardcodedPath);
  });

  it('falls through to PATH-resolved opencode when hardcoded path missing', () => {
    mockWhichResult = '/usr/bin/opencode\n';
    const result = resolveOpencodeBinary();
    expect(result).toBe('/usr/bin/opencode');
  });

  it('returns bare "opencode" fallback when nothing resolves', () => {
    const result = resolveOpencodeBinary();
    expect(result).toBe('opencode');
  });
});
