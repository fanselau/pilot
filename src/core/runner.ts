/**
 * Queue runner state machine — the automation heart of Pilot.
 *
 * Processes queue.json items through the cycle:
 *
 *   SCAN → LAUNCH → REAP → (repeat)
 *
 * Same-project items run sequentially. Cross-project items run in
 * parallel up to --max-parallel.
 *
 * Uses queue-store.ts for all queue CRUD (findLaunchable, markRunning,
 * markCompleted, markFailed, markQueued). Items tracked by short ID, not
 * line numbers.
 *
 * Success detection: new commits OR .planning changes OR clean exit 0.
 * (NOT ≥8 messages — phantom completion bug.)
 *
 * Pure core module — no UI dependencies.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { execa } from 'execa';
import treeKill from 'tree-kill';

import { getConfig } from './config.js';
import { findLaunchable, markRunning, markCompleted, markFailed, markQueued } from './queue-store.js';
import { preSpawnChecks, spawnSession, truncateTitle } from './spawn.js';
import { writePidFile, removePidFile, isProcessAlive } from './process.js';
import { logPostmortem } from './postmortem.js';
import { runLifecycleMode } from './lifecycle.js';
import type {
  QueueJsonItem,
  RunnerJob,
  RunnerOptions,
  SpawnOptions,
  PilotConfig,
} from './types.js';

// ── Lifecycle mode set ────────────────────────────────────────────────────

/** Modes handled by the lifecycle engine (NOT direct session spawning). */
const LIFECYCLE_MODES = new Set([
  'build-full',
  'continue',
  'continue-all',
  'build-to-phase',
  'add-and-build',
]);

/**
 * Counter for synthetic PIDs used to track lifecycle mode jobs.
 * Lifecycle modes are not a single detached process; they are
 * multi-step async operations managed by runLifecycleMode.
 * We assign negative PIDs so they never collide with real OS PIDs.
 */
let syntheticPidCounter = -1;

// ── Runner events ─────────────────────────────────────────────────────────

/**
 * Events emitted by the Runner for external consumers (logging, TUI, etc.).
 */
export interface RunnerEvents {
  scan: [];
  launch: [item: QueueJsonItem, pid: number];
  reap: [job: RunnerJob, exitCode: number];
  complete: [item: QueueJsonItem, result: string];
  error: [message: string];
  shutdown: [];
  'dry-run': [item: QueueJsonItem];
}

// ── Runner class ──────────────────────────────────────────────────────────

interface RunnerState {
  activeJobs: Map<number, RunnerJob>; // pid → job
  /** Exit codes captured from 'exit' events on child processes. */
  exitCodes: Map<number, number>;
  isShuttingDown: boolean;
}

class Runner extends EventEmitter<RunnerEvents> {
  private state: RunnerState;
  private opts: RunnerOptions;
  private config: PilotConfig;
  private queuePidFile: string;

  constructor(opts: RunnerOptions) {
    super();
    this.opts = opts;
    this.config = getConfig();
    this.queuePidFile = 'queue';
    this.state = {
      activeJobs: new Map(),
      exitCodes: new Map(),
      isShuttingDown: false,
    };
  }

  // ── Main loop ─────────────────────────────────────────────────────────

  /**
   * Start the runner main loop.
   *
   * 1. Write runner PID file
   * 2. Check for existing runner
   * 3. Set up SIGTERM handler
   * 4. Loop: reap → scan → launch/wait
   */
  async start(): Promise<void> {
    // Check for existing runner PID
    await this.checkExistingRunner();

    // Write our PID file: gsd-queue-pid
    await writePidFile(this.queuePidFile, process.pid);

    // Set up graceful shutdown on SIGTERM
    const sigHandler = () => {
      void this.shutdown();
    };
    process.on('SIGTERM', sigHandler);

    try {
      await this.mainLoop();
    } finally {
      process.off('SIGTERM', sigHandler);
      await removePidFile(this.queuePidFile);
    }
  }

  private async mainLoop(): Promise<void> {
    while (!this.state.isShuttingDown) {
      // Step 1: Reap dead processes
      await this.reap();

      // Step 2: Scan for next launchable item
      this.emit('scan');
      const item = await this.scan();

      if (item !== null) {
        if (this.state.activeJobs.size >= this.opts.maxParallel) {
          // At capacity — wait for any completion then rescan
          await this.waitForAnyCompletion();
          continue;
        }

        // Launch
        if (this.opts.dryRun) {
          this.emit('dry-run', item);
        } else {
          await this.launch(item);
        }

        // If --once and dry-run, process one item then check for more
        if (this.opts.once && this.opts.dryRun) {
          // Dry-run once mode: scan all launchable then exit
          continue;
        }
      } else {
        // No launchable item found

        if (this.opts.once) {
          // --once: done scanning, break to wait-for-all block below
          break;
        }

        if (this.state.activeJobs.size > 0) {
          // Jobs still running — wait for any to finish, then rescan
          await this.waitForAnyCompletion();
          continue;
        }

        // Queue empty and no jobs running — done
        break;
      }

      // Small delay to avoid CPU spin
      await sleep(1000);
    }

    // Wait for all running jobs to complete before exiting.
    // In --once mode, this drains launched jobs. In normal mode, the loop
    // only breaks when activeJobs is empty, so this is a no-op.
    if (!this.state.isShuttingDown) {
      while (this.state.activeJobs.size > 0) {
        await this.reap();
        if (this.state.activeJobs.size > 0) {
          await sleep(2000);
        }
      }
    }
  }

  // ── Scan ──────────────────────────────────────────────────────────────

  /**
   * Find the next launchable item from queue.json via queue-store.
   *
   * Launchability rules (spec §8):
   *   1. Status is 'queued'
   *   2. No other item for same project is in activeJobs
   *   3. dependsOn item is completed in history
   *   4. Active count < maxParallel
   */
  private async scan(): Promise<QueueJsonItem | null> {
    // Build set of projects currently running
    const runningProjects = new Set<string>();
    for (const job of this.state.activeJobs.values()) {
      runningProjects.add(job.item.project);
    }

    try {
      return await findLaunchable(
        runningProjects,
        this.opts.maxParallel,
        this.state.activeJobs.size,
      );
    } catch (err) {
      this.emit('error', `Failed to scan queue: ${String(err)}`);
      return null;
    }
  }

  // ── Launch ────────────────────────────────────────────────────────────

  /**
   * Launch a queue item.
   *
   * Dispatches based on mode:
   * - Lifecycle modes (build-full, continue, continue-all, etc.) →
   *   run via runLifecycleMode (multi-step, synchronous internally).
   *   Tracked with a synthetic PID since it's not a single OS process.
   * - run-command → direct session spawn via spawnSession (single
   *   detached process tracked by real OS PID).
   */
  private async launch(item: QueueJsonItem): Promise<void> {
    const projectDir = path.join(this.config.projectDir, item.project);

    // Pre-spawn checks (git gc, memory, config, binary)
    try {
      await preSpawnChecks(projectDir);
    } catch (err) {
      this.emit('error', `Pre-spawn checks failed for ${item.project}: ${String(err)}`);
      return;
    }

    // Count commits before spawn (for success detection)
    const preCommitCount = await countGitCommits(projectDir);

    // Mark item as running in queue.json
    try {
      await markRunning(item.id);
    } catch (err) {
      this.emit('error', `Failed to mark item as running: ${String(err)}`);
      return;
    }

    const title = truncateTitle(item.project, item.mode, item.description || undefined);
    const logFile = path.join(this.config.logDir, `gsd-${title}.log`);

    if (LIFECYCLE_MODES.has(item.mode)) {
      // ── Lifecycle mode: delegate to runLifecycleMode ──
      await this.launchLifecycleMode(item, projectDir, title, logFile, preCommitCount);
    } else {
      // ── run-command or unknown: direct session spawn ──
      await this.launchDirectSpawn(item, projectDir, title, logFile, preCommitCount);
    }
  }

  /**
   * Launch a lifecycle mode (build-full, continue, continue-all, etc.).
   *
   * Lifecycle modes are multi-step operations managed by runLifecycleMode.
   * They internally spawn and await multiple AI sessions. We track them
   * with a synthetic negative PID so the runner's reap/scan loop can
   * handle them uniformly.
   *
   * The lifecycle runs as an async fire-and-forget promise. When it
   * completes (or fails), we store the exit code for the reap cycle.
   */
  private async launchLifecycleMode(
    item: QueueJsonItem,
    projectDir: string,
    title: string,
    logFile: string,
    preCommitCount: number,
  ): Promise<void> {
    const syntheticPid = syntheticPidCounter--;

    const job: RunnerJob = {
      item,
      pid: syntheticPid,
      title,
      logFile,
      startTime: Date.now(),
      preCommitCount,
      retries: 0,
    };

    this.state.activeJobs.set(syntheticPid, job);
    this.emit('launch', item, syntheticPid);

    // Per-job timeout (default 60 min, use meta.timeout if set)
    const timeoutMinutes = typeof item.meta['timeout'] === 'number' ? item.meta['timeout'] : 60;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const timeoutId = setTimeout(() => {
      // For lifecycle modes, timeout means we mark as failed
      if (this.state.activeJobs.has(syntheticPid)) {
        this.state.exitCodes.set(syntheticPid, -1);
        this.emit('error', `Job ${title} timed out after ${timeoutMinutes} minutes`);
      }
    }, timeoutMs);

    // Fire and forget — lifecycle runs in background, stores exit code on completion
    void (async () => {
      try {
        await runLifecycleMode(projectDir, item.mode, item.description || '');
        this.state.exitCodes.set(syntheticPid, 0);
      } catch (err) {
        this.emit('error', `Lifecycle mode ${item.mode} failed for ${item.project}: ${String(err)}`);
        this.state.exitCodes.set(syntheticPid, 1);
      } finally {
        clearTimeout(timeoutId);
      }
    })();
  }

  /**
   * Launch a direct session spawn (run-command mode or any non-lifecycle mode).
   *
   * Spawns a single detached AI session and tracks it by real OS PID.
   */
  private async launchDirectSpawn(
    item: QueueJsonItem,
    projectDir: string,
    title: string,
    logFile: string,
    preCommitCount: number,
  ): Promise<void> {
    // For run-command mode, the command and args are extracted from description
    const desc = item.description || '';
    const spawnOpts: SpawnOptions = {
      project: item.project,
      projectDir,
      command: item.mode === 'run-command' && desc ? desc.split(' ')[0] : item.mode,
      args: item.mode === 'run-command' && desc ? desc.split(' ').slice(1).join(' ') || undefined : desc || undefined,
      title,
      logFile,
    };

    let pid: number;
    let childProcess: unknown;
    try {
      const result = await spawnSession(spawnOpts);
      pid = result.pid;
      childProcess = result.process;
    } catch (err) {
      this.emit('error', `Failed to spawn session for ${item.project}: ${String(err)}`);
      try {
        await markQueued(item.id);
      } catch {
        // Best effort
      }
      return;
    }

    const job: RunnerJob = {
      item,
      pid,
      title,
      logFile,
      startTime: Date.now(),
      preCommitCount,
      retries: 0,
    };

    this.state.activeJobs.set(pid, job);

    // Listen for exit event on child process to capture exit code
    if (childProcess && typeof childProcess === 'object' && 'on' in childProcess) {
      const proc = childProcess as { on: (event: string, cb: (...args: unknown[]) => void) => void };
      proc.on('exit', (code: unknown) => {
        const exitCode = typeof code === 'number' ? code : -1;
        this.state.exitCodes.set(pid, exitCode);
      });
    }

    // Per-job timeout (default 60 min, use meta.timeout if set)
    const timeoutMinutes = typeof item.meta['timeout'] === 'number' ? item.meta['timeout'] : 60;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    setTimeout(() => {
      void this.handleJobTimeout(job);
    }, timeoutMs);

    this.emit('launch', item, pid);
  }

  // ── Reap ──────────────────────────────────────────────────────────────

  /**
   * Check all active PIDs and handle completions.
   *
   * For each active job:
   *   - Real PIDs (> 0): check if process is still alive
   *   - Synthetic PIDs (< 0): check if exit code has been stored
   *   - If dead/completed: get exit code, handle completion, remove from activeJobs
   */
  private async reap(): Promise<void> {
    const deadPids: number[] = [];

    for (const [pid] of this.state.activeJobs) {
      if (pid < 0) {
        // Synthetic PID (lifecycle mode) — check if exit code is stored
        if (this.state.exitCodes.has(pid)) {
          deadPids.push(pid);
        }
      } else {
        // Real PID — check if process is still alive
        if (!isProcessAlive(pid)) {
          deadPids.push(pid);
        }
      }
    }

    for (const pid of deadPids) {
      const job = this.state.activeJobs.get(pid);
      if (job === undefined) {
        continue;
      }

      // Get exit code from our captured map, or -1 if unknown
      const exitCode = this.state.exitCodes.get(pid) ?? -1;
      this.state.exitCodes.delete(pid);

      this.emit('reap', job, exitCode);
      await this.handleJobCompletion(job, exitCode);
      this.state.activeJobs.delete(pid);
    }
  }

  // ── Job completion ────────────────────────────────────────────────────

  /**
   * Handle a completed job (spec §8 — success detection).
   *
   * Success is determined by (in order):
   *   1. New git commits since pre-run count → success
   *   2. Uncommitted .planning/ changes → commit them, success
   *   3. Exit code 0 with no artifacts → success_no_artifacts (suspicious but accept)
   *   4. Non-zero exit and retries < maxRetries → retry (mark back to pending)
   *   5. Non-zero exit and retries >= maxRetries → failed (mark ❌ FAIL)
   *
   * DOES NOT use ≥8 messages as success signal (phantom completion bug).
   */
  private async handleJobCompletion(job: RunnerJob, exitCode: number): Promise<void> {
    const projectDir = path.join(this.config.projectDir, job.item.project);
    const duration = Date.now() - job.startTime;

    // Count new commits
    const currentCommitCount = await countGitCommits(projectDir);
    const newCommits = Math.max(0, currentCommitCount - job.preCommitCount);

    // Check for uncommitted .planning/ changes
    const planningChanges = await checkPlanningChanges(projectDir);
    if (planningChanges) {
      // Auto-commit planning changes
      try {
        await execa('git', ['add', '.planning/'], { cwd: projectDir });
        await execa('git', ['commit', '-m', 'auto-commit planning changes'], {
          cwd: projectDir,
        });
      } catch {
        // Best effort — may fail if nothing to commit
      }
    }

    // Determine result
    let result: 'success' | 'success_no_artifacts' | 'retry' | 'failed';

    if (newCommits > 0 || planningChanges) {
      result = 'success';
    } else if (exitCode === 0) {
      result = 'success_no_artifacts';
    } else if (job.retries < this.opts.maxRetries) {
      result = 'retry';
    } else {
      result = 'failed';
    }

    // Update queue via queue-store (no manual locking needed — store handles it)
    try {
      if (result === 'success' || result === 'success_no_artifacts') {
        await markCompleted(job.item.id);
      } else if (result === 'retry') {
        job.retries++;
        await markQueued(job.item.id);
      } else {
        await markFailed(job.item.id, `exit code ${exitCode}`);
      }
    } catch (err) {
      this.emit('error', `Failed to update queue item: ${String(err)}`);
    }

    // Log post-mortem
    try {
      await logPostmortem({
        ts: new Date().toISOString(),
        project: job.item.project,
        title: job.title,
        mode: job.item.mode,
        exit: exitCode,
        duration_ms: duration,
        result,
        commits: newCommits,
        messages: 0, // We don't track message count (no ≥8 messages heuristic)
        ...(result === 'failed' ? { failure_category: `exit_${exitCode}` } : {}),
      });
    } catch (err) {
      this.emit('error', `Failed to log postmortem: ${String(err)}`);
    }

    // Clean up PID file
    try {
      await removePidFile(job.title);
    } catch {
      // Best effort
    }

    this.emit('complete', job.item, result);
  }

  // ── Job timeout ───────────────────────────────────────────────────────

  /**
   * Handle a per-job timeout. Kill the process tree and treat as failure.
   * For real PIDs, kills the process tree. For synthetic PIDs (lifecycle
   * modes), the timeout handler in launchLifecycleMode sets the exit code.
   */
  private async handleJobTimeout(job: RunnerJob): Promise<void> {
    // Only if still active
    if (!this.state.activeJobs.has(job.pid)) {
      return;
    }

    const jobTimeout = typeof job.item.meta['timeout'] === 'number' ? job.item.meta['timeout'] : 60;
    this.emit('error', `Job ${job.title} timed out after ${jobTimeout} minutes`);

    if (job.pid > 0) {
      // Real PID — kill the process tree
      await killProcessTree(job.pid);
      // Will be reaped in next cycle as dead process
    }
    // Synthetic PIDs: timeout handled in launchLifecycleMode
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────

  /**
   * Graceful shutdown (spec §5 — SIGTERM handler).
   *
   * 1. Stop scan loop
   * 2. SIGTERM all active children
   * 3. Wait 15 seconds
   * 4. SIGKILL survivors via tree-kill
   * 5. Mark running entries back to pending
   * 6. Clean up PID files
   * 7. Remove runner PID file
   */
  async shutdown(): Promise<void> {
    if (this.state.isShuttingDown) {
      return;
    }
    this.state.isShuttingDown = true;
    this.emit('shutdown');

    const activeJobs = [...this.state.activeJobs.values()];

    // Step 1: Send SIGTERM to all active children (real PIDs only)
    for (const job of activeJobs) {
      if (job.pid > 0) {
        try {
          process.kill(job.pid, 'SIGTERM');
        } catch {
          // Process may already be dead
        }
      }
    }

    // Step 2: Wait 15 seconds
    await sleep(15_000);

    // Step 3: SIGKILL survivors via tree-kill (real PIDs only)
    for (const job of activeJobs) {
      if (job.pid > 0 && isProcessAlive(job.pid)) {
        await killProcessTree(job.pid);
      }
    }

    // Step 4: Mark running items back to queued via queue-store
    for (const job of activeJobs) {
      try {
        await markQueued(job.item.id);
      } catch {
        // Best effort
      }
    }

    // Step 5: Clean up PID files
    for (const job of activeJobs) {
      try {
        await removePidFile(job.title);
      } catch {
        // Best effort
      }
    }

    // Runner PID file cleaned up in start() finally block
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Check for an existing runner PID file.
   * If alive and --force not set, throw.
   * If stale, clean up.
   */
  private async checkExistingRunner(): Promise<void> {
    const pidPath = path.join(this.config.logDir, `gsd-${this.queuePidFile}-pid`);

    let content: string;
    try {
      content = await readFile(pidPath, 'utf8');
    } catch {
      return; // No PID file — clear to start
    }

    const existingPid = parseInt(content.trim(), 10);
    if (Number.isNaN(existingPid) || existingPid <= 0) {
      // Invalid PID file — clean it up
      await removePidFile(this.queuePidFile);
      return;
    }

    if (isProcessAlive(existingPid)) {
      if (this.opts.force) {
        // Force: kill existing and take over
        await killProcessTree(existingPid);
        await removePidFile(this.queuePidFile);
      } else {
        throw new Error(
          `Queue runner already running (PID ${existingPid}). ` +
          `Use --force to override.`,
        );
      }
    } else {
      // Stale PID file — clean up
      await removePidFile(this.queuePidFile);
    }
  }

  /**
   * Wait for any active job to complete (polling).
   * Returns when at least one job has died or a lifecycle mode has finished.
   */
  private async waitForAnyCompletion(): Promise<void> {
    const maxWaitMs = 3_600_000; // 60 minutes max wait (builds can take a long time)
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      for (const [pid] of this.state.activeJobs) {
        if (pid < 0) {
          // Synthetic PID — check if exit code stored (lifecycle mode completed)
          if (this.state.exitCodes.has(pid)) {
            return;
          }
        } else {
          // Real PID — check if process died
          if (!isProcessAlive(pid)) {
            return;
          }
        }
      }
      await sleep(2000); // Poll every 2 seconds
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Create a new Runner instance with the given options.
 */
function createRunner(opts: RunnerOptions): Runner {
  return new Runner(opts);
}

// ── Module-level helpers ──────────────────────────────────────────────────

/**
 * Count total git commits in a project (for pre/post spawn comparison).
 * Returns 0 if not a git repo or on error.
 */
async function countGitCommits(projectDir: string): Promise<number> {
  try {
    const result = await execa('git', ['rev-list', '--count', 'HEAD'], {
      cwd: projectDir,
    });
    const count = parseInt(result.stdout.trim(), 10);
    return Number.isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}

/**
 * Check for uncommitted .planning/ changes.
 * Returns true if there are modified/untracked files under .planning/.
 */
async function checkPlanningChanges(projectDir: string): Promise<boolean> {
  try {
    const result = await execa('git', ['status', '--porcelain', '.planning/'], {
      cwd: projectDir,
    });
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}


/**
 * Kill an entire process tree via tree-kill with SIGKILL.
 * Wraps the callback API in a promise.
 */
function killProcessTree(pid: number): Promise<void> {
  return new Promise<void>((resolve) => {
    treeKill(pid, 'SIGKILL', () => {
      // Resolve regardless of error — process may already be dead
      resolve();
    });
  });
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { createRunner, Runner };
