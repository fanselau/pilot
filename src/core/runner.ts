/**
 * Queue runner state machine — the automation heart of Pilot.
 *
 * Port of gsd-queue-v5.sh scan→launch→reap loop as a typed TypeScript
 * state machine.  Processes QUEUE.md entries through the cycle:
 *
 *   SCAN → LAUNCH → REAP → (repeat)
 *
 * Same-project entries run sequentially. Cross-project entries run in
 * parallel up to --max-parallel.
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
import { parseQueueFile, markEntry } from './queue-parser.js';
import { withQueueLock } from './lock.js';
import { preSpawnChecks, spawnSession, truncateTitle } from './spawn.js';
import { writePidFile, removePidFile, isProcessAlive } from './process.js';
import { logPostmortem } from './postmortem.js';
import type {
  QueueEntry,
  RunnerJob,
  RunnerOptions,
  SpawnOptions,
  PilotConfig,
} from './types.js';

// ── Runner events ─────────────────────────────────────────────────────────

/**
 * Events emitted by the Runner for external consumers (logging, TUI, etc.).
 */
export interface RunnerEvents {
  scan: [];
  launch: [entry: QueueEntry, pid: number];
  reap: [job: RunnerJob, exitCode: number];
  complete: [entry: QueueEntry, result: string];
  error: [message: string];
  shutdown: [];
  'dry-run': [entry: QueueEntry];
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

      // Step 2: Scan for next launchable entry
      this.emit('scan');
      const entry = await this.scan();

      if (entry !== null) {
        if (this.state.activeJobs.size >= this.opts.maxParallel) {
          // At capacity — wait for any completion then rescan
          await this.waitForAnyCompletion();
          continue;
        }

        // Launch
        if (this.opts.dryRun) {
          this.emit('dry-run', entry);
        } else {
          await this.launch(entry);
        }

        // If --once and dry-run, process one entry then check for more
        if (this.opts.once && this.opts.dryRun) {
          // Dry-run once mode: scan all launchable then exit
          continue;
        }
      } else {
        // No launchable entry found
        if (this.state.activeJobs.size > 0) {
          // Jobs still running — wait for any to finish, then rescan
          await this.waitForAnyCompletion();
          continue;
        }

        // Queue empty and no jobs running — done
        break;
      }

      // If --once flag and we just launched something, continue scanning
      // but don't loop after all entries have been processed
      if (this.opts.once && entry === null) {
        break;
      }

      // Small delay to avoid CPU spin
      await sleep(1000);
    }

    // If --once, wait for all running jobs to complete before exiting
    if (this.opts.once && !this.state.isShuttingDown) {
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
   * Parse QUEUE.md and find the next launchable entry.
   *
   * Launchability rules (spec §8):
   *   1. Status is 'pending'
   *   2. No other entry for same project is in activeJobs
   *   3. dependsOn entries are all marked 'done' above this one
   *   4. Active count < maxParallel
   */
  private async scan(): Promise<QueueEntry | null> {
    let entries: QueueEntry[];
    try {
      entries = await parseQueueFile(this.config.queueFile);
    } catch (err) {
      this.emit('error', `Failed to parse queue: ${String(err)}`);
      return null;
    }

    // Build set of projects currently running
    const runningProjects = new Set<string>();
    for (const job of this.state.activeJobs.values()) {
      runningProjects.add(job.entry.project);
    }

    // Build set of done projects (for dependency checking)
    const doneProjects = new Set<string>();
    for (const e of entries) {
      if (e.status === 'done') {
        doneProjects.add(e.project);
      }
    }

    // Find first launchable
    for (const entry of entries) {
      if (entry.status !== 'pending') {
        continue;
      }

      // Same-project sequential: no other entry for same project currently running
      if (runningProjects.has(entry.project)) {
        continue;
      }

      // Dependency check: all dependsOn projects must have a 'done' entry
      if (entry.dependsOn !== undefined && entry.dependsOn.length > 0) {
        const depsAllDone = entry.dependsOn.every((dep) => doneProjects.has(dep));
        if (!depsAllDone) {
          continue;
        }
      }

      return entry;
    }

    return null;
  }

  // ── Launch ────────────────────────────────────────────────────────────

  /**
   * Launch a queue entry as a background AI session.
   *
   * 1. Resolve project directory
   * 2. Run preSpawnChecks
   * 3. Count git commits before spawn (for success detection)
   * 4. Mark entry as running in QUEUE.md
   * 5. Spawn session
   * 6. Track in activeJobs
   * 7. Set up per-job timeout
   */
  private async launch(entry: QueueEntry): Promise<void> {
    const projectDir = path.join(this.config.projectDir, entry.project);

    // Pre-spawn checks (git gc, memory, config, binary)
    try {
      await preSpawnChecks(projectDir);
    } catch (err) {
      this.emit('error', `Pre-spawn checks failed for ${entry.project}: ${String(err)}`);
      return;
    }

    // Count commits before spawn (for success detection)
    const preCommitCount = await countGitCommits(projectDir);

    // Mark entry as running in QUEUE.md (locked)
    try {
      await withQueueLock(async () => {
        await markEntry(this.config.queueFile, entry.lineNum, 'running');
      });
    } catch (err) {
      this.emit('error', `Failed to mark entry as running: ${String(err)}`);
      return;
    }

    // Build spawn options
    const title = truncateTitle(entry.project, entry.mode, entry.args || undefined);
    const logFile = path.join(this.config.logDir, `gsd-${title}.log`);

    const spawnOpts: SpawnOptions = {
      project: entry.project,
      projectDir,
      command: entry.mode,
      args: entry.args || undefined,
      title,
      logFile,
    };

    // Spawn session
    let pid: number;
    let childProcess: unknown;
    try {
      const result = await spawnSession(spawnOpts);
      pid = result.pid;
      childProcess = result.process;
    } catch (err) {
      this.emit('error', `Failed to spawn session for ${entry.project}: ${String(err)}`);
      // Mark back to pending on spawn failure
      try {
        await withQueueLock(async () => {
          await markEntry(this.config.queueFile, entry.lineNum, 'pending' as 'running');
        });
      } catch {
        // Best effort
      }
      return;
    }

    // Create RunnerJob
    const job: RunnerJob = {
      entry,
      pid,
      title,
      logFile,
      startTime: Date.now(),
      preCommitCount,
      retries: 0,
    };

    // Track in activeJobs
    this.state.activeJobs.set(pid, job);

    // Listen for exit event on child process to capture exit code
    if (childProcess && typeof childProcess === 'object' && 'on' in childProcess) {
      const proc = childProcess as { on: (event: string, cb: (...args: unknown[]) => void) => void };
      proc.on('exit', (code: unknown) => {
        const exitCode = typeof code === 'number' ? code : -1;
        this.state.exitCodes.set(pid, exitCode);
      });
    }

    // Per-job timeout
    const timeoutMinutes = entry.timeout ?? 60;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    setTimeout(() => {
      void this.handleJobTimeout(job);
    }, timeoutMs);

    this.emit('launch', entry, pid);
  }

  // ── Reap ──────────────────────────────────────────────────────────────

  /**
   * Check all active PIDs and handle completions.
   *
   * For each active job:
   *   - Check if PID is still alive
   *   - If dead: get exit code, handle completion, remove from activeJobs
   */
  private async reap(): Promise<void> {
    const deadPids: number[] = [];

    for (const [pid] of this.state.activeJobs) {
      if (!isProcessAlive(pid)) {
        deadPids.push(pid);
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
    const projectDir = path.join(this.config.projectDir, job.entry.project);
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

    // Update QUEUE.md
    try {
      await withQueueLock(async () => {
        if (result === 'success' || result === 'success_no_artifacts') {
          await markEntry(this.config.queueFile, job.entry.lineNum, 'done');
        } else if (result === 'retry') {
          job.retries++;
          // Mark back to pending for retry
          // markEntry only supports running/done/failed, so we need to write pending manually
          await markEntryPending(this.config.queueFile, job.entry.lineNum);
        } else {
          await markEntry(this.config.queueFile, job.entry.lineNum, 'failed');
        }
      });
    } catch (err) {
      this.emit('error', `Failed to update queue entry: ${String(err)}`);
    }

    // Log post-mortem
    try {
      await logPostmortem({
        ts: new Date().toISOString(),
        project: job.entry.project,
        title: job.title,
        mode: job.entry.mode,
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

    this.emit('complete', job.entry, result);
  }

  // ── Job timeout ───────────────────────────────────────────────────────

  /**
   * Handle a per-job timeout. Kill the process tree and treat as failure.
   */
  private async handleJobTimeout(job: RunnerJob): Promise<void> {
    // Only if still active
    if (!this.state.activeJobs.has(job.pid)) {
      return;
    }

    this.emit('error', `Job ${job.title} timed out after ${job.entry.timeout ?? 60} minutes`);

    // Kill the process tree
    await killProcessTree(job.pid);

    // Will be reaped in next cycle as dead process
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

    // Step 1: Send SIGTERM to all active children
    for (const job of activeJobs) {
      try {
        process.kill(job.pid, 'SIGTERM');
      } catch {
        // Process may already be dead
      }
    }

    // Step 2: Wait 15 seconds
    await sleep(15_000);

    // Step 3: SIGKILL survivors via tree-kill
    for (const job of activeJobs) {
      if (isProcessAlive(job.pid)) {
        await killProcessTree(job.pid);
      }
    }

    // Step 4: Mark running entries back to pending
    for (const job of activeJobs) {
      try {
        await withQueueLock(async () => {
          await markEntryPending(this.config.queueFile, job.entry.lineNum);
        });
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
   * Returns when at least one job has died.
   */
  private async waitForAnyCompletion(): Promise<void> {
    const maxWaitMs = 300_000; // 5 minutes max wait
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      for (const [pid] of this.state.activeJobs) {
        if (!isProcessAlive(pid)) {
          return; // Found a dead one — caller will reap
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
 * Mark a queue entry back to pending by stripping the status prefix.
 *
 * The markEntry function in queue-parser only supports running/done/failed.
 * For retry, we need to reset to pending (no prefix).
 */
async function markEntryPending(filePath: string, lineNum: number): Promise<void> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const idx = lineNum - 1;

  if (idx < 0 || idx >= lines.length) {
    throw new Error(`Line number ${lineNum} out of range`);
  }

  const line = lines[idx]!;
  const headerRe = /^## (✅ DONE: |❌ FAIL: |🔨 )?(.+)$/;
  const match = headerRe.exec(line);

  if (match === null) {
    throw new Error(`Line ${lineNum} is not a ## header`);
  }

  // Strip prefix — set to pending (no prefix)
  const rest = match[2]!;
  lines[idx] = `## ${rest}`;

  const { writeFile: fsWriteFile } = await import('node:fs/promises');
  await fsWriteFile(filePath, lines.join('\n'));
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
