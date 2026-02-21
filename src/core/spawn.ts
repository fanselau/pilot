/**
 * AI session spawning with pre-spawn checks.
 *
 * Implements all 5 pre-spawn checks from spec §5 (pilot run):
 *   1. Disable git gc on snapshot repos (including global)
 *   2. Memory check via /proc/meminfo
 *   3. Config validation (opencode.json)
 *   4. Binary check (opencode in PATH or default location)
 *   5. Title truncation (80 char max)
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import type { SpawnOptions, SpawnResult } from './types.js';
import { writePidFile } from './process.js';

// ── Module-level state ─────────────────────────────────────────────────────

/** Cached resolved binary path after first preSpawnChecks call. */
let resolvedBinary: string | null = null;

// ── truncateTitle ──────────────────────────────────────────────────────────

/**
 * Build a session title from project, command, and optional args.
 * Sanitizes non-alphanumeric characters to hyphens and truncates to 80 chars.
 *
 * This prevents ENAMETOOLONG on log files — the #1 cause of silent failures
 * in the bash version (spec §5).
 */
function truncateTitle(project: string, command: string, args?: string): string {
  const sanitizedArgs = args
    ? '-' + args.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : '';
  const raw = `${project}-${command}${sanitizedArgs}`;
  return raw.slice(0, 80);
}

// ── Pre-spawn check 1: Disable git gc on snapshot repos ────────────────────

/**
 * Disable git gc on ALL snapshot repos including the global one.
 *
 * The global repo at ~/.local/share/opencode/snapshot/global is NOT matched
 * by the star-slash glob and has caused 2.6GB RAM spikes from git pack-objects.
 * This is the #1 silent performance killer (spec §5).
 */
async function disableSnapshotGc(): Promise<void> {
  const snapshotBase = path.join(os.homedir(), '.local', 'share', 'opencode', 'snapshot');

  // Disable gc on all subdirectory repos
  try {
    const entries = await readdir(snapshotBase, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const repoPath = path.join(snapshotBase, entry.name);
        try {
          await execa('git', ['-C', repoPath, 'config', 'gc.auto', '0']);
        } catch {
          // Swallow errors — repo may not be a valid git repo
        }
      }
    }
  } catch {
    // Snapshot directory may not exist — that's fine
  }

  // CRITICAL: Also disable on the global repo explicitly
  // It is NOT matched by the directory iteration if it doesn't exist as a subdirectory
  const globalRepo = path.join(snapshotBase, 'global');
  try {
    await execa('git', ['-C', globalRepo, 'config', 'gc.auto', '0']);
  } catch {
    // Global repo may not exist
  }
}

// ── Pre-spawn check 2: Memory check ───────────────────────────────────────

/**
 * Check system available memory via /proc/meminfo.
 * If < 500MB, wait (polling every 30s) up to 10 minutes.
 * Throws if memory never frees.
 */
async function checkMemory(): Promise<void> {
  const MAX_POLLS = 20; // 20 × 30s = 10 minutes
  const POLL_INTERVAL_MS = 30_000;
  const MIN_AVAILABLE_MB = 500;

  for (let attempt = 0; attempt <= MAX_POLLS; attempt++) {
    const availableMb = await getSystemFreeMem();

    if (availableMb === null) {
      // Can't read /proc/meminfo (non-Linux?) — skip check
      return;
    }

    if (availableMb >= MIN_AVAILABLE_MB) {
      return;
    }

    if (attempt === MAX_POLLS) {
      throw new Error(
        `System memory too low: ${availableMb}MB available (need ${MIN_AVAILABLE_MB}MB). ` +
        `Waited ${MAX_POLLS * 30}s without improvement.`,
      );
    }

    // Log the wait so operators know why nothing is launching
    process.stderr.write(
      `[spawn] Low memory: ${availableMb}MB available (need ${MIN_AVAILABLE_MB}MB). ` +
      `Waiting 30s... (attempt ${attempt + 1}/${MAX_POLLS})\n`,
    );

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Read MemAvailable from /proc/meminfo.
 * Returns MB or null if unreadable.
 */
async function getSystemFreeMem(): Promise<number | null> {
  try {
    const content = await readFile('/proc/meminfo', 'utf8');
    const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(content);
    if (match === null) {
      return null;
    }
    return Math.floor(parseInt(match[1]!, 10) / 1024);
  } catch {
    return null;
  }
}

// ── Pre-spawn check 3: Config validation ───────────────────────────────────

/**
 * Validate the AI tool config JSON in the project directory.
 *
 * Checks (from spec §5):
 *   - File exists (opencode.json)
 *   - Valid JSON
 *   - `permission` field exists (NOT `permissions` — singular!)
 *   - All required permission types have `"**": "allow"`
 *   - If `instructions` field exists, it must be an array (NOT string — silent crash)
 */
async function validateConfig(projectDir: string): Promise<void> {
  const configPath = path.join(projectDir, 'opencode.json');
  let configContent: string;

  try {
    configContent = await readFile(configPath, 'utf8');
  } catch {
    throw new Error(
      `No opencode.json found in ${projectDir}. Run: pilot setup ${projectDir}`,
    );
  }

  let config: unknown;
  try {
    config = JSON.parse(configContent);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  if (typeof config !== 'object' || config === null) {
    throw new Error(`${configPath}: expected object at root`);
  }

  const obj = config as Record<string, unknown>;

  // Check permission (singular, NOT permissions)
  if (!('permission' in obj) || typeof obj.permission !== 'object' || obj.permission === null) {
    throw new Error(
      `${configPath}: missing "permission" field (note: singular, not "permissions")`,
    );
  }

  const permission = obj.permission as Record<string, unknown>;
  const requiredTypes = ['read', 'write', 'edit', 'bash', 'external_directory'];
  for (const permType of requiredTypes) {
    const typeObj = permission[permType];
    if (typeof typeObj !== 'object' || typeObj === null) {
      throw new Error(`${configPath}: permission.${permType} missing or not an object`);
    }
    const permMap = typeObj as Record<string, unknown>;
    if (permMap['**'] !== 'allow') {
      throw new Error(
        `${configPath}: permission.${permType}["**"] must be "allow" (got ${JSON.stringify(permMap['**'])})`,
      );
    }
  }

  // Check instructions field if present — must be array, not string
  if ('instructions' in obj && obj.instructions !== undefined) {
    if (!Array.isArray(obj.instructions)) {
      throw new Error(
        `${configPath}: "instructions" must be an array, not ${typeof obj.instructions}. ` +
        `String instructions cause silent crashes ("expected array, received string").`,
      );
    }
  }
}

// ── Pre-spawn check 4: Binary check ───────────────────────────────────────

/**
 * Find the opencode binary.
 *
 * Checks in order:
 *   1. `which opencode` (in current PATH)
 *   2. ~/.opencode/bin/opencode (default install location)
 *
 * Stores resolved path at module level for reuse.
 * Throws if not found.
 */
async function checkBinary(): Promise<string> {
  // Check PATH first
  try {
    const result = await execa('which', ['opencode']);
    if (result.stdout.trim().length > 0) {
      resolvedBinary = result.stdout.trim();
      return resolvedBinary;
    }
  } catch {
    // Not in PATH
  }

  // Check default install location
  const candidate = path.join(os.homedir(), '.opencode', 'bin', 'opencode');
  try {
    await execa(candidate, ['--version']);
    resolvedBinary = candidate;
    return resolvedBinary;
  } catch {
    // Not available at this path
  }

  throw new Error(
    'Error: opencode not found in PATH or ~/.opencode/bin/. Install opencode first.',
  );
}

// ── preSpawnChecks (combined) ──────────────────────────────────────────────

/**
 * Run ALL 5 pre-spawn checks before launching an AI session.
 *
 * Checks run sequentially in this order:
 *   1. Disable git gc on snapshot repos
 *   2. Memory check (may wait up to 10 minutes)
 *   3. Config validation
 *   4. Binary check
 *
 * Title truncation (check 5) is handled by the truncateTitle function
 * which callers use when building SpawnOptions.
 *
 * Throws descriptive error if any check fails.
 */
async function preSpawnChecks(projectDir: string): Promise<void> {
  await disableSnapshotGc();
  await checkMemory();
  await validateConfig(projectDir);
  await checkBinary();
}

// ── spawnSession ───────────────────────────────────────────────────────────

/**
 * Spawn a detached AI session process.
 *
 * - Detached: true (setsid equivalent — never use nohup per spec)
 * - stdin: 'ignore' (equivalent to < /dev/null — prevents hanging)
 * - stdout/stderr: appended to log file
 * - PID file written via process.ts writePidFile
 * - Child is unref'd so parent can exit if needed
 */
async function spawnSession(opts: SpawnOptions): Promise<SpawnResult> {
  const binary = resolvedBinary;
  if (binary === null) {
    throw new Error(
      'Binary not resolved. Call preSpawnChecks() before spawnSession().',
    );
  }

  const execaArgs = [
    'run',
    '--format', 'default',
    '--title', opts.title,
    '--command', opts.command.startsWith('gsd-') ? opts.command : `gsd-${opts.command}`,
    ...(opts.args ? [opts.args] : []),
  ];

  // execa v9 file redirect: appends stdout/stderr to log file
  const proc = execa(binary, execaArgs, {
    cwd: opts.projectDir,
    stdin: 'ignore',
    stdout: { file: opts.logFile },
    stderr: { file: opts.logFile },
    detached: true,
    cleanup: false,
  });

  const pid = proc.pid;
  if (pid === undefined) {
    throw new Error(`Failed to spawn AI session: no PID returned for ${opts.title}`);
  }

  // Unref so parent can exit without waiting for child
  proc.unref();

  // Write PID file
  await writePidFile(opts.title, pid);

  return {
    pid,
    title: opts.title,
    logFile: opts.logFile,
    process: proc,
  };
}

// ── getResolvedBinary ──────────────────────────────────────────────────────

/**
 * Get the resolved binary path after preSpawnChecks has been called.
 * Returns null if preSpawnChecks hasn't run yet.
 */
function getResolvedBinary(): string | null {
  return resolvedBinary;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
  truncateTitle,
  preSpawnChecks,
  spawnSession,
  getResolvedBinary,
};
