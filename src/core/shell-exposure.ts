/**
 * Shell exposure: stable canonical launchers for pilot, node, pnpm.
 *
 * Creates/verifies symlinks in ~/.local/bin so that plain non-interactive
 * Bash/sh shells (e.g. `bash -lc 'pilot ...'`) can resolve pilot, node,
 * and pnpm without relying on fnm's fragile node-version-specific paths.
 *
 * fnm is explicitly NOT exposed — node and pnpm are the supported interface
 * for non-interactive contexts.
 *
 * Pure core module — no UI dependencies.
 */

import { lstat, symlink, unlink, mkdir, readlink, realpath } from 'node:fs/promises';
import { realpathSync, accessSync, constants } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { errMsg } from '../util/errors.js';

// ── Types ──────────────────────────────────────────────────────────────────

type ToolName = 'pilot' | 'node' | 'pnpm';

interface ShellExposureFinding {
  tool: ToolName;
  status: 'pass' | 'created' | 'refreshed' | 'fail';
  stablePath: string;       // ~/.local/bin/<tool>
  resolvedTarget: string;   // where the symlink points (or empty on fail)
  detail: string;           // human-readable explanation
}

interface ShellExposureResult {
  findings: ShellExposureFinding[];
  fnmNote: string;  // explanation that fnm is not supported in plain shells
}

// ── Constants ──────────────────────────────────────────────────────────────

const FNM_NOTE = 'fnm is not exposed in plain shells — node and pnpm are the supported interface for non-interactive contexts.';

const TOOLS: readonly ToolName[] = ['pilot', 'node', 'pnpm'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the real binary path for a tool.
 * For pilot: use import.meta.url resolution chain (same as resolvePilotBinary in service.ts).
 * For node/pnpm: use `which`.
 */
function resolveToolBinary(tool: ToolName): string {
  if (tool === 'pilot') {
    return resolvePilotBinaryReal();
  }
  // node and pnpm: `which` lookup
  const resolved = execSync(`which ${tool}`, { encoding: 'utf8', timeout: 5_000 }).trim();
  if (!resolved) throw new Error(`${tool} not found on PATH`);
  return resolved;
}

/**
 * Resolve the pilot binary through a deterministic chain and resolve
 * through all symlinks to the real file.
 *
 * Resolution order:
 *   1. Package root dist/index.js — derived from import.meta.url
 *   2. `which pilot` — PATH lookup fallback
 *   3. Throw
 */
function resolvePilotBinaryReal(): string {
  // 1. Package root dist/index.js — shell-exposure.ts is at src/core/shell-exposure.ts
  //    so package root is ../../ from this file's directory
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const packageRoot = path.resolve(path.dirname(thisFile), '..', '..');
    const distEntry = path.join(packageRoot, 'dist', 'index.js');
    accessSync(distEntry, constants.R_OK);
    // Resolve through any symlinks to the actual file
    return realpathSync(distEntry);
  } catch { /* fall through */ }

  // 2. PATH lookup via `which pilot`
  try {
    const resolved = execSync('which pilot', { encoding: 'utf8', timeout: 5_000 }).trim();
    if (resolved) {
      // Resolve through symlinks
      return realpathSync(resolved);
    }
  } catch { /* fall through */ }

  // 3. Nothing resolved
  throw new Error('Cannot resolve pilot binary. Ensure pilot is built (npm run build) or linked (bun link).');
}

// ── ensureShellExposure ────────────────────────────────────────────────────

/**
 * Ensure stable symlinks exist in ~/.local/bin for pilot, node, and pnpm.
 *
 * Creates or refreshes symlinks as needed. Safe to call repeatedly.
 * Does NOT touch real files (non-symlinks) at the target paths.
 */
async function ensureShellExposure(): Promise<ShellExposureResult> {
  const home = os.homedir();
  const localBin = path.join(home, '.local', 'bin');

  // Ensure ~/.local/bin exists
  await mkdir(localBin, { recursive: true });

  const findings: ShellExposureFinding[] = [];

  for (const tool of TOOLS) {
    const stablePath = path.join(localBin, tool);
    let resolvedTarget = '';

    try {
      // Step 1: Resolve the current canonical binary location
      resolvedTarget = resolveToolBinary(tool);
    } catch (err) {
      findings.push({
        tool,
        status: 'fail',
        stablePath,
        resolvedTarget: '',
        detail: `Cannot resolve ${tool}: ${errMsg(err)}`,
      });
      continue;
    }

    // Step 2: Check if stable path already exists
    try {
      const stats = await lstat(stablePath);

      if (stats.isSymbolicLink()) {
        // It's a symlink — check where it points
        const currentTarget = await readlink(stablePath);

        if (currentTarget === resolvedTarget) {
          // Already correct
          findings.push({
            tool,
            status: 'pass',
            stablePath,
            resolvedTarget,
            detail: `Symlink already correct: ${stablePath} → ${resolvedTarget}`,
          });
        } else {
          // Points to wrong target — refresh
          await unlink(stablePath);
          await symlink(resolvedTarget, stablePath);
          findings.push({
            tool,
            status: 'refreshed',
            stablePath,
            resolvedTarget,
            detail: `Refreshed: ${stablePath} → ${resolvedTarget} (was: ${currentTarget})`,
          });
        }
      } else {
        // Not a symlink — real file, don't touch
        findings.push({
          tool,
          status: 'pass',
          stablePath,
          resolvedTarget,
          detail: `Real file exists at ${stablePath} — not overwriting`,
        });
      }
    } catch {
      // Path doesn't exist — create symlink
      try {
        await symlink(resolvedTarget, stablePath);
        findings.push({
          tool,
          status: 'created',
          stablePath,
          resolvedTarget,
          detail: `Created: ${stablePath} → ${resolvedTarget}`,
        });
      } catch (err) {
        findings.push({
          tool,
          status: 'fail',
          stablePath,
          resolvedTarget,
          detail: `Failed to create symlink: ${errMsg(err)}`,
        });
      }
    }
  }

  return { findings, fnmNote: FNM_NOTE };
}

// ── verifyShellExposure ────────────────────────────────────────────────────

/**
 * Read-only verification of shell exposure symlinks.
 *
 * Checks that ~/.local/bin has working symlinks for pilot, node, and pnpm
 * but never creates or modifies anything.
 */
async function verifyShellExposure(): Promise<ShellExposureResult> {
  const home = os.homedir();
  const localBin = path.join(home, '.local', 'bin');
  const findings: ShellExposureFinding[] = [];

  for (const tool of TOOLS) {
    const stablePath = path.join(localBin, tool);

    try {
      const stats = await lstat(stablePath);

      if (stats.isSymbolicLink()) {
        // Check if symlink resolves (not dangling)
        try {
          const resolved = await realpath(stablePath);
          findings.push({
            tool,
            status: 'pass',
            stablePath,
            resolvedTarget: resolved,
            detail: `OK: ${stablePath} → ${resolved}`,
          });
        } catch {
          findings.push({
            tool,
            status: 'fail',
            stablePath,
            resolvedTarget: '',
            detail: 'Broken symlink — target does not exist',
          });
        }
      } else {
        // Real file — that's fine
        findings.push({
          tool,
          status: 'pass',
          stablePath,
          resolvedTarget: stablePath,
          detail: `Real file exists at ${stablePath}`,
        });
      }
    } catch {
      // Path doesn't exist
      findings.push({
        tool,
        status: 'fail',
        stablePath,
        resolvedTarget: '',
        detail: 'Not found — run: pilot doctor --fix',
      });
    }
  }

  return { findings, fnmNote: FNM_NOTE };
}

// ── Exports ────────────────────────────────────────────────────────────────

export { ensureShellExposure, verifyShellExposure };
export type { ShellExposureFinding, ShellExposureResult, ToolName };
