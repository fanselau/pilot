/**
 * Tests for core/shell-exposure.ts — ensureShellExposure() and verifyShellExposure()
 *
 * Uses real temp directories for symlink verification (same pattern as setup.test.ts).
 * Mocks os.homedir() and execSync to control binary resolution paths.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink, readlink, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ── Mock state ──────────────────────────────────────────────────────────

let mockHomeDir: string;
let mockWhichResults: Record<string, string>;
let mockPilotBinaryPath: string | null;

// ── Mock os.homedir ─────────────────────────────────────────────────────

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => mockHomeDir,
    },
  };
});

// ── Mock child_process.execSync (which calls) ───────────────────────────

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: (cmd: string, _opts?: unknown) => {
      const match = /^which (\S+)$/.exec(cmd as string);
      if (match) {
        const tool = match[1];
        if (tool in mockWhichResults) {
          return mockWhichResults[tool] + '\n';
        }
        throw new Error(`${tool}: not found`);
      }
      return actual.execSync(cmd as string, _opts as Parameters<typeof actual.execSync>[1]);
    },
  };
});

// ── Mock fs.accessSync + fs.realpathSync for pilot binary resolution ────

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    accessSync: (filePath: string, mode?: number) => {
      // For pilot binary resolution: if mockPilotBinaryPath is set and the
      // path being checked matches the expected dist/index.js pattern, succeed
      if (mockPilotBinaryPath && String(filePath).endsWith('dist/index.js')) {
        return; // pretend it exists
      }
      return actual.accessSync(filePath, mode);
    },
    realpathSync: (filePath: string) => {
      // For pilot binary resolution: resolve to mock path
      if (mockPilotBinaryPath && String(filePath).endsWith('dist/index.js')) {
        return mockPilotBinaryPath;
      }
      return actual.realpathSync(filePath);
    },
  };
});

// Must import AFTER vi.mock
import { ensureShellExposure, verifyShellExposure } from '../../src/core/shell-exposure.js';

// ── Test setup ──────────────────────────────────────────────────────────

describe('shell-exposure', () => {
  let tmpHome: string;
  let mockNodeBin: string;
  let mockPnpmBin: string;
  let mockPilotBin: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(path.join(os.tmpdir(), 'pilot-shell-test-'));
    mockHomeDir = tmpHome;

    // Create mock binary files that symlinks can point to
    const mockBinDir = path.join(tmpHome, 'mock-bins');
    await mkdir(mockBinDir, { recursive: true });

    mockNodeBin = path.join(mockBinDir, 'node');
    mockPnpmBin = path.join(mockBinDir, 'pnpm');
    mockPilotBin = path.join(mockBinDir, 'pilot');

    await writeFile(mockNodeBin, '#!/bin/sh\necho node', { mode: 0o755 });
    await writeFile(mockPnpmBin, '#!/bin/sh\necho pnpm', { mode: 0o755 });
    await writeFile(mockPilotBin, '#!/bin/sh\necho pilot', { mode: 0o755 });

    // Default mock which results
    mockWhichResults = {
      node: mockNodeBin,
      pnpm: mockPnpmBin,
      pilot: mockPilotBin,
    };

    // Default: use import.meta.url resolution for pilot → mock pilot binary
    mockPilotBinaryPath = mockPilotBin;
  });

  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
    mockPilotBinaryPath = null;
  });

  // ── ensureShellExposure ─────────────────────────────────────────────

  describe('ensureShellExposure', () => {
    it('creates symlinks for all 3 tools when ~/.local/bin is empty', async () => {
      const result = await ensureShellExposure();

      expect(result.findings).toHaveLength(3);

      for (const finding of result.findings) {
        expect(finding.status).toBe('created');
        expect(finding.stablePath).toContain('.local/bin');
        expect(finding.resolvedTarget).toBeTruthy();
      }

      // Verify symlinks exist on disk
      const localBin = path.join(tmpHome, '.local', 'bin');
      for (const tool of ['pilot', 'node', 'pnpm']) {
        const linkPath = path.join(localBin, tool);
        const stats = await lstat(linkPath);
        expect(stats.isSymbolicLink()).toBe(true);
      }
    });

    it('returns pass when correct symlinks already exist', async () => {
      // First call: create
      await ensureShellExposure();

      // Second call: should all pass
      const result = await ensureShellExposure();

      expect(result.findings).toHaveLength(3);
      for (const finding of result.findings) {
        expect(finding.status).toBe('pass');
        expect(finding.detail).toContain('already correct');
      }
    });

    it('returns refreshed when symlink points to wrong target', async () => {
      const localBin = path.join(tmpHome, '.local', 'bin');
      await mkdir(localBin, { recursive: true });

      // Create a mock "old" node binary
      const oldBinDir = path.join(tmpHome, 'old-bins');
      await mkdir(oldBinDir, { recursive: true });
      const oldNodeBin = path.join(oldBinDir, 'node');
      await writeFile(oldNodeBin, '#!/bin/sh\necho old-node', { mode: 0o755 });

      // Create symlink pointing to OLD target
      await symlink(oldNodeBin, path.join(localBin, 'node'));

      // Also create correct symlinks for pilot and pnpm
      await symlink(mockPilotBin, path.join(localBin, 'pilot'));
      await symlink(mockPnpmBin, path.join(localBin, 'pnpm'));

      // Now run ensure — node should be refreshed
      const result = await ensureShellExposure();

      const nodeFinding = result.findings.find(f => f.tool === 'node');
      expect(nodeFinding).toBeDefined();
      expect(nodeFinding!.status).toBe('refreshed');
      expect(nodeFinding!.detail).toContain('was:');

      // Verify symlink now points to correct target
      const newTarget = await readlink(path.join(localBin, 'node'));
      expect(newTarget).toBe(mockNodeBin);
    });

    it('does not overwrite real files (non-symlink) — returns pass', async () => {
      const localBin = path.join(tmpHome, '.local', 'bin');
      await mkdir(localBin, { recursive: true });

      // Create a real file (not symlink) at the node path
      const realNodePath = path.join(localBin, 'node');
      await writeFile(realNodePath, '#!/bin/sh\necho real-node', { mode: 0o755 });

      const result = await ensureShellExposure();

      const nodeFinding = result.findings.find(f => f.tool === 'node');
      expect(nodeFinding).toBeDefined();
      expect(nodeFinding!.status).toBe('pass');
      expect(nodeFinding!.detail).toContain('Real file');

      // Verify it's still a real file, not a symlink
      const stats = await lstat(realNodePath);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    it('returns fail when source binary cannot be resolved', async () => {
      // Make node unresolvable
      const originalWhich = { ...mockWhichResults };
      delete mockWhichResults.node;

      const result = await ensureShellExposure();

      const nodeFinding = result.findings.find(f => f.tool === 'node');
      expect(nodeFinding).toBeDefined();
      expect(nodeFinding!.status).toBe('fail');
      expect(nodeFinding!.detail).toContain('Cannot resolve');

      // Other tools should still succeed
      const pilotFinding = result.findings.find(f => f.tool === 'pilot');
      expect(pilotFinding).toBeDefined();
      expect(['created', 'pass']).toContain(pilotFinding!.status);

      // Restore
      mockWhichResults = originalWhich;
    });

    it('creates ~/.local/bin directory if it does not exist', async () => {
      const localBin = path.join(tmpHome, '.local', 'bin');

      // Verify it doesn't exist
      let exists = false;
      try {
        await lstat(localBin);
        exists = true;
      } catch { /* doesn't exist */ }
      expect(exists).toBe(false);

      // Run ensure — should create the directory
      const result = await ensureShellExposure();

      // Verify directory was created
      const stats = await lstat(localBin);
      expect(stats.isDirectory()).toBe(true);

      // All tools should be created
      for (const finding of result.findings) {
        expect(['created', 'pass']).toContain(finding.status);
      }
    });

    it('fnmNote is always populated with the fnm exclusion message', async () => {
      const result = await ensureShellExposure();

      expect(result.fnmNote).toBeTruthy();
      expect(result.fnmNote).toContain('fnm is not exposed');
      expect(result.fnmNote).toContain('node and pnpm are the supported interface');
    });
  });

  // ── verifyShellExposure ─────────────────────────────────────────────

  describe('verifyShellExposure', () => {
    it('returns pass when all symlinks exist and resolve', async () => {
      // First create the symlinks
      await ensureShellExposure();

      // Then verify
      const result = await verifyShellExposure();

      expect(result.findings).toHaveLength(3);
      for (const finding of result.findings) {
        expect(finding.status).toBe('pass');
        expect(finding.resolvedTarget).toBeTruthy();
      }
    });

    it('returns fail when symlinks are missing', async () => {
      // Don't create anything — just verify
      const result = await verifyShellExposure();

      expect(result.findings).toHaveLength(3);
      for (const finding of result.findings) {
        expect(finding.status).toBe('fail');
        expect(finding.detail).toContain('Not found');
        expect(finding.detail).toContain('pilot doctor --fix');
      }
    });

    it('returns fail when symlinks are broken (dangling)', async () => {
      const localBin = path.join(tmpHome, '.local', 'bin');
      await mkdir(localBin, { recursive: true });

      // Create symlinks pointing to non-existent targets
      await symlink('/nonexistent/path/to/node', path.join(localBin, 'node'));
      await symlink('/nonexistent/path/to/pnpm', path.join(localBin, 'pnpm'));
      await symlink('/nonexistent/path/to/pilot', path.join(localBin, 'pilot'));

      const result = await verifyShellExposure();

      for (const finding of result.findings) {
        expect(finding.status).toBe('fail');
        expect(finding.detail).toContain('Broken symlink');
      }
    });

    it('never creates or modifies files (verify tmpdir unchanged after call)', async () => {
      const localBin = path.join(tmpHome, '.local', 'bin');

      // Ensure ~/.local/bin doesn't exist
      let existsBefore = false;
      try {
        await lstat(localBin);
        existsBefore = true;
      } catch { /* doesn't exist */ }

      // Call verify
      await verifyShellExposure();

      // Check if ~/.local/bin was created (it shouldn't be for the tool files)
      // Note: verifyShellExposure never creates the directory or symlinks
      if (!existsBefore) {
        let existsAfter = false;
        try {
          await lstat(localBin);
          existsAfter = true;
        } catch { /* doesn't exist */ }
        // The directory should NOT have been created by verify
        expect(existsAfter).toBe(false);
      }
    });

    it('returns pass for real files (non-symlinks)', async () => {
      const localBin = path.join(tmpHome, '.local', 'bin');
      await mkdir(localBin, { recursive: true });

      // Create real files at all three tool paths
      for (const tool of ['pilot', 'node', 'pnpm']) {
        await writeFile(path.join(localBin, tool), `#!/bin/sh\necho ${tool}`, { mode: 0o755 });
      }

      const result = await verifyShellExposure();

      for (const finding of result.findings) {
        expect(finding.status).toBe('pass');
        expect(finding.detail).toContain('Real file');
      }
    });

    it('fnmNote is always populated', async () => {
      const result = await verifyShellExposure();

      expect(result.fnmNote).toBeTruthy();
      expect(result.fnmNote).toContain('fnm is not exposed');
    });
  });
});
