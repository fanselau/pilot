/**
 * Queue runner event loop — the v2 automation engine.
 *
 * Simple loop: poll queue → delegate → spawn → poll completion → repeat.
 * No PID tracking, no /tmp logs, no process scanning, no lifecycle modes.
 * Three things: delegate → spawn → poll DB.
 *
 * Pre-spawn safety checks from SPAWN-LESSONS.md:
 *   1. Disable git gc on ALL opencode snapshot repos including global
 *   2. Check /proc/meminfo for 2GB+ available memory
 *   3. Enforce 5-second minimum between spawns
 *   4. Validate opencode.json has permission: allow
 *
 * Pure core module — no UI dependencies.
 */

import { execa } from 'execa';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { getConfig } from './config.js';
import {
  getNextPending,
  markRunning,
  markCompleted,
  markFailed,
  updateDelegationPlan,
  advanceStep,
  getJob,
  updateSessionTitles,
} from './db.js';
import { delegate, resolveOpencodeBinary } from './delegate.js';
import { findSessionByTitle, isSessionActive, getLastMessage } from './opencode-db.js';
import { truncateTitle } from '../util/format.js';
import type { Job, DelegationPlan } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface RunnerOptions {
  maxParallel: number;
  once: boolean;         // process queue once then exit
  pollInterval: number;  // seconds between queue checks
}

interface RunnerState {
  active: boolean;
  activeJobs: number;
  jobIds: string[];
}

// ── Spawn rate limiter (module-level) ──────────────────────────────────────

let lastSpawnTime = 0;
const MIN_SPAWN_INTERVAL_MS = 5_000;

// ── Runner Class ───────────────────────────────────────────────────────────

class Runner {
  private options: RunnerOptions;
  private running = false;
  private activeJobs: Map<string, { job: Job; title: string }> = new Map();
  private shuttingDown = false;

  constructor(options: Partial<RunnerOptions> = {}) {
    const config = getConfig();
    this.options = {
      maxParallel: options.maxParallel ?? config.maxParallel,
      once: options.once ?? false,
      pollInterval: options.pollInterval ?? config.pollInterval,
    };
  }

  /**
   * Start the runner event loop.
   * Polls for pending jobs, launches them up to maxParallel, waits, repeats.
   */
  async run(): Promise<void> {
    this.running = true;
    this.setupShutdownHandlers();

    while (this.running) {
      if (this.shuttingDown) break;

      // Check for launchable jobs if we have capacity
      if (this.activeJobs.size < this.options.maxParallel) {
        const job = getNextPending();
        if (job) {
          // Launch without awaiting — allows parallel jobs
          this.launch(job).catch(() => {
            // Error already handled in launch() via markFailed
          });
          continue; // Check for more immediately
        }
      }

      // If --once and no active jobs, exit
      if (this.options.once && this.activeJobs.size === 0) {
        break;
      }

      // Wait before next poll
      await this.sleep(this.options.pollInterval * 1000);
    }

    // Wait for active jobs to finish
    while (this.activeJobs.size > 0) {
      await this.sleep(5000);
    }
  }

  /**
   * Launch a job: mark running → delegate → execute steps → mark complete/failed.
   */
  private async launch(job: Job): Promise<void> {
    const config = getConfig();
    const projectDir = path.join(config.projectDir, job.project);

    try {
      markRunning(job.id);
      this.activeJobs.set(job.id, { job, title: '' });

      // Step 1: Delegation AI decides what GSD commands to run
      let plan: DelegationPlan;
      try {
        plan = await delegate(job, projectDir);
      } catch (err) {
        throw new Error(`Delegation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      updateDelegationPlan(job.id, plan);

      // Step 2: Execute each step sequentially
      for (let i = 0; i < plan.steps.length; i++) {
        if (this.shuttingDown) break;

        const step = plan.steps[i];
        const title = truncateTitle(`${job.project}-${step.command}-${job.id}`, 80);
        this.activeJobs.set(job.id, { job, title });

        await this.spawnAndWait(projectDir, step.command, step.args, title);
        updateSessionTitles(job.id, [title]);
        advanceStep(job.id);
      }

      markCompleted(job.id);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      markFailed(job.id, error);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Spawn an opencode session and wait for it to complete.
   * Runs pre-spawn safety checks, then polls opencode's SQLite DB for session completion.
   */
  private async spawnAndWait(
    cwd: string,
    command: string,
    args: string,
    title: string,
  ): Promise<void> {
    const config = getConfig();
    const opencodeBin = resolveOpencodeBinary();
    const timeoutMs = config.defaultTimeout * 60 * 1000;
    const start = Date.now();

    // CRITICAL: Pre-spawn safety checks from SPAWN-LESSONS.md
    await disableSnapshotGc();
    await checkMemory(2048);
    await enforceSpawnRateLimit();
    await validateProjectConfig(cwd);

    // Spawn detached opencode session (setsid via detached:true, NEVER nohup)
    const gsdCommand = command.startsWith('gsd-') ? command : `gsd-${command}`;
    const proc = execa(opencodeBin, [
      'run',
      '--format', 'default',
      '--title', title,
      '--command', gsdCommand,
      ...(args ? [args] : []),
    ], {
      cwd,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      detached: true,
      cleanup: false,
    });
    proc.unref();

    // Poll opencode DB for session completion
    const pollMs = 5000;
    let sessionFound = false;

    while (Date.now() - start < timeoutMs) {
      await this.sleep(pollMs);

      if (this.shuttingDown) {
        throw new Error('Runner shutting down');
      }

      const sessionId = findSessionByTitle(title);
      if (!sessionId) continue;
      sessionFound = true;

      // Check if session is still active
      const active = isSessionActive(sessionId);
      if (!active) {
        // Session finished — check if it was >60s since last message
        const lastMsg = getLastMessage(sessionId);
        if (lastMsg) {
          const ageMs = Date.now() - lastMsg.createdAt;
          if (ageMs > 60_000) {
            return; // Session done
          }
        } else {
          // No messages but session exists and isn't active — might just be starting
          if (Date.now() - start > 30_000) {
            return; // Been waiting 30s with no messages and no activity — done
          }
        }
      }
    }

    if (!sessionFound) {
      throw new Error(`Session never appeared in opencode DB: ${title}`);
    }

    throw new Error(`Session timed out after ${config.defaultTimeout}m: ${title}`);
  }

  /**
   * Set up SIGTERM/SIGINT handlers for graceful shutdown.
   */
  private setupShutdownHandlers(): void {
    const handler = () => {
      this.shuttingDown = true;
      this.running = false;
    };
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
  }

  /**
   * Get current runner state for status reporting.
   */
  getState(): RunnerState {
    return {
      active: this.running,
      activeJobs: this.activeJobs.size,
      jobIds: [...this.activeJobs.keys()],
    };
  }

  /**
   * Stop the runner gracefully.
   */
  stop(): void {
    this.shuttingDown = true;
    this.running = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

// ── Pre-spawn safety checks ────────────────────────────────────────────────

/**
 * SPAWN-LESSONS #1: Disable git gc on ALL opencode snapshot repos including global.
 * git pack-objects on the global repo consumed 2.6GB RAM and 93% CPU in production.
 * The global repo is NOT matched by wildcard glob and must be disabled separately.
 */
async function disableSnapshotGc(): Promise<void> {
  const home = homedir();
  const snapshotDir = path.join(home, '.local', 'share', 'opencode', 'snapshot');

  try {
    // Disable gc on all snapshot/* repos
    let entries: string[] = [];
    try {
      entries = readdirSync(snapshotDir);
    } catch {
      return; // No snapshot dir — nothing to do
    }

    for (const entry of entries) {
      const repoPath = path.join(snapshotDir, entry);
      try {
        const stat = statSync(repoPath);
        if (stat.isDirectory()) {
          await execa('git', ['-C', repoPath, 'config', 'gc.auto', '0'], {
            timeout: 5000,
            reject: false,
          });
        }
      } catch {
        // Skip entries we can't stat
      }
    }

    // CRITICAL: Also disable on the global repo which is NOT matched by */ glob
    const globalRepo = path.join(snapshotDir, 'global');
    try {
      await execa('git', ['-C', globalRepo, 'config', 'gc.auto', '0'], {
        timeout: 5000,
        reject: false,
      });
    } catch {
      // Global repo may not exist
    }
  } catch {
    // Best effort — don't fail spawn because gc disable failed
  }
}

/**
 * SPAWN-LESSONS #3: Check /proc/meminfo for available memory.
 * OOM kills are the #2 cause of stuck processes.
 * Wait (polling every 30s) until enough memory is available.
 */
async function checkMemory(requiredMb: number): Promise<void> {
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes max wait
  const pollMs = 30_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const availableMb = getAvailableMemoryMb();
    if (availableMb >= requiredMb) {
      return;
    }
    process.stderr.write(
      `[runner] Low memory: ${availableMb}MB available, need ${requiredMb}MB. Waiting...\n`,
    );
    await new Promise(r => setTimeout(r, pollMs));
  }

  // After max wait, proceed anyway with a warning
  process.stderr.write(
    `[runner] Memory still low after ${maxWaitMs / 60000}m wait, proceeding anyway\n`,
  );
}

/**
 * Read available memory from /proc/meminfo (Linux).
 * Returns available MB, or Infinity on non-Linux (skip the check).
 */
function getAvailableMemoryMb(): number {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (match) {
      return Math.round(parseInt(match[1], 10) / 1024);
    }
    return Infinity; // Can't parse — skip check
  } catch {
    return Infinity; // Not Linux or /proc not mounted — skip check
  }
}

/**
 * SPAWN-LESSONS #4: Enforce 5-second minimum between spawns.
 * Prevents thundering herd when multiple jobs become launchable simultaneously.
 */
async function enforceSpawnRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSpawnTime;

  if (elapsed < MIN_SPAWN_INTERVAL_MS) {
    const waitMs = MIN_SPAWN_INTERVAL_MS - elapsed;
    await new Promise(r => setTimeout(r, waitMs));
  }

  lastSpawnTime = Date.now();
}

/**
 * SPAWN-LESSONS #7: Validate opencode.json has permission: allow.
 * Must be SINGULAR "permission" not "permissions" — the latter crashes opencode silently.
 */
async function validateProjectConfig(cwd: string): Promise<void> {
  const configPath = path.join(cwd, 'opencode.json');

  try {
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content) as Record<string, unknown>;

    // Check for the "permission" field (singular!)
    if (!config.permission) {
      throw new Error(`opencode.json missing "permission" field (at ${configPath})`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      throw new Error(`opencode.json not found at ${configPath}. Run "pilot setup" first.`);
    }
    throw err;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

function createRunner(options?: Partial<RunnerOptions>): Runner {
  return new Runner(options);
}

// ── Exports ────────────────────────────────────────────────────────────────

export { Runner, createRunner };
export type { RunnerOptions, RunnerState };

// Export pre-spawn checks for direct testing
export {
  disableSnapshotGc,
  checkMemory,
  enforceSpawnRateLimit,
  validateProjectConfig,
  getAvailableMemoryMb,
};
