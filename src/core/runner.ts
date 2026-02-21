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
 * Default mode is **daemon**: the runner stays alive after draining,
 * polling every `pollInterval` seconds for new entries added via
 * `pilot add`.  Pass `--once` to drain-and-exit (CI/batch use).
 *
 * Uses queue-store.ts for all queue CRUD (findLaunchableAtomic,
 * cascadeFailure, markCompleted, markFailed, markQueued). Items tracked
 * by short ID, not line numbers.
 *
 * Success detection: new commits OR .planning changes OR clean exit 0.
 * (NOT ≥8 messages — phantom completion bug.)
 *
 * Pure core module — no UI dependencies.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { readFile, readdir, stat, unlink } from 'node:fs/promises';
import { writeFileSync, statSync, statfsSync } from 'node:fs';
import { execa } from 'execa';
import treeKill from 'tree-kill';

import { getConfig } from './config.js';
import { findLaunchable, findLaunchableAtomic, cascadeFailure, markCompleted, markFailed, markQueued, loadQueue, ensurePilotDir } from './queue-store.js';
import { preSpawnChecks, spawnSession, truncateTitle, enforceSpawnRateLimit, checkBinary, getSystemFreeMem } from './spawn.js';
import { writePidFile, removePidFile, isProcessAlive } from './process.js';
import { logPostmortem } from './postmortem.js';
import { runLifecycleMode } from './lifecycle.js';
import { cleanStaleLocks } from './lock.js';
import { computeDaemonStuckScore } from './stuck.js';
import { getProcessRuntime } from './process.js';
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
  idle: [];  // Emitted every 5 minutes when daemon is idle and watching for new entries
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

  /** Track flaky failure count per item ID (not persisted — resets on daemon restart) */
  private flakyAttempts: Map<string, number> = new Map();

  constructor(opts: RunnerOptions) {
    super();
    this.opts = opts;
    this.config = getConfig();
    this.queuePidFile = 'pilot-runner';
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
   * Startup sequence:
   *   1. startupSelfCheck (validate binary, gsd dir, queue, disk, memory)
   *   2. cleanStaleLocks (from lock.ts — Plan 01)
   *   3. cleanOrphanProcesses (detect orphaned opencode processes)
   *   4. cleanJobLogs (delete old job logs: keep 20, >7 days old)
   *   5. checkExistingRunner (stale PID cleanup)
   *   6. writePidFile
   *   7. heartbeat setup (every 60s to ~/.pilot/heartbeat)
   *   8. mainLoop
   */
  async start(): Promise<void> {
    // Step 1: Validate environment before doing anything else
    await this.startupSelfCheck();

    // Step 2: Clean stale lock files (safety net from Plan 01)
    try {
      await cleanStaleLocks();
    } catch (err) {
      this.emit('error', `Failed to clean stale locks: ${String(err)}`);
      // Non-critical — continue startup
    }

    // Step 3: Detect orphan processes (log only, don't kill on startup)
    await this.cleanOrphanProcesses();

    // Step 4: Clean old job logs
    await this.cleanJobLogs();

    // Step 5: Check for existing runner PID
    await this.checkExistingRunner();

    // Step 6: Write our PID file
    await writePidFile(this.queuePidFile, process.pid);

    // Step 7: Set up heartbeat (every 60s to ~/.pilot/heartbeat)
    await ensurePilotDir();
    const heartbeatPath = path.join(this.config.pilotDir, 'heartbeat');
    // Write initial heartbeat immediately
    try {
      writeFileSync(heartbeatPath, new Date().toISOString() + '\n');
    } catch { /* best effort */ }
    const heartbeatInterval = setInterval(() => {
      try {
        writeFileSync(heartbeatPath, new Date().toISOString() + '\n');
      } catch {
        // Best effort — don't crash for heartbeat write failure
      }
    }, 60_000);

    // Set up graceful shutdown on SIGTERM and SIGINT (Ctrl+C)
    const sigHandler = () => {
      void this.shutdown();
    };
    process.on('SIGTERM', sigHandler);
    process.on('SIGINT', sigHandler);

    try {
      await this.mainLoop();
    } finally {
      clearInterval(heartbeatInterval);
      process.off('SIGTERM', sigHandler);
      process.off('SIGINT', sigHandler);
      await removePidFile(this.queuePidFile);
    }
  }

  // ── Startup self-check ────────────────────────────────────────────────

  /**
   * Validate environment preconditions before running.
   *
   * Critical failures (throw): binary missing, gsd dir missing, disk < 500MB.
   * Non-critical failures (emit error): queue unreadable, memory low.
   */
  private async startupSelfCheck(): Promise<void> {
    // 1. Check opencode binary exists — critical
    try {
      await checkBinary();
    } catch (err) {
      throw new Error(`Startup check failed: opencode binary not found. ${String(err)}`);
    }

    // 2. Check gsd dir exists — critical
    try {
      await stat(this.config.gsdDir);
    } catch {
      throw new Error(
        `Startup check failed: pilot-gsd directory not found at ${this.config.gsdDir}. ` +
        `Set PILOT_GSD_DIR or clone https://github.com/punchlab-dev/pilot-gsd`,
      );
    }

    // 3. Check queue file readable/writable — non-critical (auto-creates)
    try {
      await loadQueue();
    } catch (err) {
      this.emit('error', `Startup warning: queue file issue: ${String(err)}`);
      // Continue — queue auto-creates on first write
    }

    // 4. Check disk space > 500MB — critical
    try {
      const st = statfsSync(this.config.pilotDir);
      const freeBytes = BigInt(st.bfree) * BigInt(st.bsize);
      const freeMb = Number(freeBytes / BigInt(1024 * 1024));
      if (freeBytes < BigInt(500 * 1024 * 1024)) {
        throw new Error(
          `Disk space too low: ${freeMb}MB free (need 500MB). Clear logs or free space.`,
        );
      }
    } catch (err) {
      // Re-throw our own disk space errors
      if (err instanceof Error && err.message.startsWith('Disk space too low')) {
        throw err;
      }
      // statfsSync unavailable — skip check with warning
      this.emit('error', `Startup warning: could not check disk space: ${String(err)}`);
    }

    // 5. Check memory > 2GB — non-critical (may free up later)
    try {
      const availableMb = await getSystemFreeMem();
      if (availableMb !== null && availableMb < 2048) {
        this.emit('error', `Startup warning: low memory (${availableMb}MB free, need 2048MB). Jobs may fail to spawn.`);
      }
    } catch (err) {
      this.emit('error', `Startup warning: could not check memory: ${String(err)}`);
    }
  }

  // ── Orphan process detection ──────────────────────────────────────────

  /**
   * Detect opencode processes not matching any running queue item.
   *
   * On startup: log only. Does NOT kill. The 2-hour kill is for periodic
   * checks handled in Plan 04's stuck detection.
   */
  private async cleanOrphanProcesses(): Promise<void> {
    try {
      const result = await execa('pgrep', ['-f', 'opencode'], { reject: false });
      if (result.exitCode !== 0 || !result.stdout.trim()) {
        return; // No opencode processes found
      }

      const pids = result.stdout.trim().split('\n').map((p) => parseInt(p.trim(), 10)).filter((p) => !Number.isNaN(p));
      if (pids.length === 0) return;

      // Get running items from queue to cross-reference
      let runningProjects: string[] = [];
      try {
        const queueData = await loadQueue();
        runningProjects = queueData.items
          .filter((i) => i.status === 'running')
          .map((i) => i.project);
      } catch {
        // Queue unreadable — can't cross-reference, skip
        return;
      }

      // If there are running queue items, some opencode processes are expected
      // We can't perfectly match PIDs to queue items without PID tracking,
      // so just log if there are more opencode processes than running items
      if (pids.length > runningProjects.length) {
        const orphanCount = pids.length - runningProjects.length;
        this.emit('error',
          `Startup: detected ${orphanCount} potential orphan opencode process(es) ` +
          `(${pids.length} opencode PIDs, ${runningProjects.length} running queue items). ` +
          `PIDs: ${pids.join(', ')}`,
        );
      }
    } catch {
      // pgrep not available or other error — orphan detection is non-critical
    }
  }

  // ── Job log cleanup ───────────────────────────────────────────────────

  /**
   * Clean old job logs: keep the 20 most recent, delete others older than 7 days.
   *
   * Scans config.logDir for gsd-*.log files. Non-critical — failure
   * never prevents startup.
   */
  private async cleanJobLogs(): Promise<void> {
    try {
      const entries = await readdir(this.config.logDir);
      const logFiles = entries.filter((f) => f.startsWith('gsd-') && f.endsWith('.log'));

      if (logFiles.length === 0) return;

      // Get stats for all log files
      const fileStats: Array<{ name: string; mtimeMs: number }> = [];
      for (const name of logFiles) {
        try {
          const st = await stat(path.join(this.config.logDir, name));
          fileStats.push({ name, mtimeMs: st.mtimeMs });
        } catch {
          // Skip files we can't stat
        }
      }

      // Sort by mtime descending (most recent first)
      fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Keep the 20 most recent regardless of age
      const toConsider = fileStats.slice(20);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (const file of toConsider) {
        if (file.mtimeMs < sevenDaysAgo) {
          try {
            await unlink(path.join(this.config.logDir, file.name));
          } catch {
            // Best effort — skip files we can't delete
          }
        }
      }
    } catch {
      // Log cleanup failing should never prevent startup
    }
  }

  private async mainLoop(): Promise<void> {
    let lastIdleLog = 0; // timestamp of last idle log message
    const IDLE_LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes
    let lastStuckCheck = 0;
    const STUCK_CHECK_INTERVAL = 60_000; // 60 seconds
    let lastOrphanCheck = 0;
    const ORPHAN_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

    while (!this.state.isShuttingDown) {
      // Step 0: Periodic stuck detection (every 60s, only when jobs active)
      const now0 = Date.now();
      if (now0 - lastStuckCheck >= STUCK_CHECK_INTERVAL && this.state.activeJobs.size > 0) {
        try {
          await this.checkStuckJobs();
        } catch {
          // Stuck detection failure must not crash daemon
        }
        lastStuckCheck = now0;
      }

      // Step 0b: Periodic orphan cleanup (every 30 min)
      if (now0 - lastOrphanCheck >= ORPHAN_CHECK_INTERVAL) {
        try {
          await this.cleanOrphanPeriodic();
        } catch {
          // Orphan cleanup failure must not crash daemon
        }
        lastOrphanCheck = now0;
      }

      // Step 1: Reap dead processes (graceful degradation)
      try {
        await this.reap();
      } catch (err) {
        this.emit('error', `Reap cycle failed: ${String(err)}`);
        // Continue loop — individual job errors handled inside reap
      }

      // Step 2: Check per-job timeouts on active jobs (graceful degradation)
      try {
        await this.checkTimeouts();
      } catch (err) {
        this.emit('error', `Timeout check failed: ${String(err)}`);
        // Continue loop — timeout checking is non-critical
      }

      // Step 3: Scan for next launchable item (atomic: holds lock during read+mark)
      this.emit('scan');
      const item = await this.scan();

      if (item !== null) {
        if (this.state.activeJobs.size > this.opts.maxParallel) {
          // Over capacity — wait for any completion then rescan
          await this.waitForAnyCompletion();
          continue;
        }

        // Launch (item is already marked running by findLaunchableAtomic)
        if (this.opts.dryRun) {
          this.emit('dry-run', item);
        } else {
          await this.launch(item);
        }

        // If --once and dry-run, scan all launchable then exit
        if (this.opts.once && this.opts.dryRun) {
          continue;
        }
      } else {
        // No launchable item found

        if (this.state.activeJobs.size > 0) {
          // Jobs still running — wait for any to finish, then rescan
          await this.waitForAnyCompletion();
          continue;
        }

        // Queue empty and no jobs running
        if (this.opts.once) {
          break; // --once: exit
        }

        // Daemon mode: log idle status periodically, then sleep and rescan
        const now = Date.now();
        if (now - lastIdleLog >= IDLE_LOG_INTERVAL) {
          this.emit('idle');
          lastIdleLog = now;
        }

        await sleep(this.opts.pollInterval * 1000);
        continue;
      }

      // Small delay between launches to avoid CPU spin
      await sleep(1000);
    }

    // Wait for all running jobs to complete before exiting (unconditional drain).
    // On shutdown: waits for active jobs to finish naturally (NOT killed).
    // On --once: drains launched jobs before exiting.
    while (this.state.activeJobs.size > 0) {
      await this.reap();
      if (this.state.activeJobs.size > 0) {
        await sleep(2000);
      }
    }
  }

  // ── Scan ──────────────────────────────────────────────────────────────

  /**
   * Find the next launchable item from queue.json via queue-store.
   *
   * Uses findLaunchableAtomic which holds the lock during read+mark,
   * preventing TOCTOU race where two runners launch the same item.
   *
   * Launchability rules (spec §8):
   *   1. Status is 'queued'
   *   2. No other item for same project is in activeJobs
   *   3. dependsOn item is completed in history
   *   4. Active count < maxParallel
   *
   * Returns an item already marked as 'running' (attempts incremented),
   * or null if nothing is launchable.
   */
  private async scan(): Promise<QueueJsonItem | null> {
    // Build set of projects currently running
    const runningProjects = new Set<string>();
    for (const job of this.state.activeJobs.values()) {
      runningProjects.add(job.item.project);
    }

    try {
      if (this.opts.dryRun) {
        // Read-only scan — don't mark items as running
        return await findLaunchable(
          runningProjects,
          this.opts.maxParallel,
          this.state.activeJobs.size,
        );
      }
      return await findLaunchableAtomic(
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

    // Enforce minimum 5-second interval between spawns (thundering herd prevention)
    try {
      await enforceSpawnRateLimit();
    } catch (err) {
      this.emit('error', `Spawn rate limit failed for ${item.project}: ${String(err)}`);
      // Continue — rate limiting is non-critical
    }

    // Pre-spawn checks (git gc, memory, config, binary)
    try {
      await preSpawnChecks(projectDir);
    } catch (err) {
      this.emit('error', `Pre-spawn checks failed for ${item.project}: ${String(err)}`);
      return;
    }

    // Count commits before spawn (for success detection)
    const preCommitCount = await countGitCommits(projectDir);

    // Item is already marked as running by findLaunchableAtomic (atomic read+mark).
    // No separate markRunning call needed.

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
   *
   * Timeout is handled centrally by checkTimeouts() — no per-job setTimeout.
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

    // Fire and forget — lifecycle runs in background, stores exit code on completion
    void (async () => {
      try {
        await runLifecycleMode(projectDir, item.mode, item.description || '');
        this.state.exitCodes.set(syntheticPid, 0);
      } catch (err) {
        this.emit('error', `Lifecycle mode ${item.mode} failed for ${item.project}: ${String(err)}`);
        this.state.exitCodes.set(syntheticPid, 1);
      }
    })();
  }

  /**
   * Launch a direct session spawn (run-command mode or any non-lifecycle mode).
   *
   * Spawns a single detached AI session and tracks it by real OS PID.
   * Timeout is handled centrally by checkTimeouts() — no per-job setTimeout.
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

    // Determine result — uses per-item maxAttempts (attempts already incremented
    // by findLaunchableAtomic on launch)
    let result: 'success' | 'success_no_artifacts' | 'retry' | 'failed';
    let failureCategory: string | undefined;

    // Flaky detection: job failed quickly with tiny log output
    let logSize = 0;
    try {
      const logStat = statSync(job.logFile);
      logSize = logStat.size;
    } catch { /* file may not exist */ }
    const isFlaky = exitCode !== 0 && duration < 5 * 60 * 1000 && logSize < 4096;

    if (newCommits > 0 || planningChanges) {
      result = 'success';
    } else if (exitCode === 0) {
      result = 'success_no_artifacts';
    } else if (job.item.attempts >= job.item.maxAttempts) {
      // Normal attempts exhausted — check if we tracked flaky retries
      const flakyCount = this.flakyAttempts.get(job.item.id) ?? 0;
      if (isFlaky && flakyCount > 0) {
        failureCategory = 'consistently_flaky';
        this.emit('error',
          `Job ${job.title} consistently flaky after ${flakyCount} flaky retries — marking failed`,
        );
      }
      result = 'failed';
    } else if (isFlaky && (this.flakyAttempts.get(job.item.id) ?? 0) < 3) {
      // Flaky job — retry immediately
      result = 'retry';
      this.flakyAttempts.set(job.item.id, (this.flakyAttempts.get(job.item.id) ?? 0) + 1);
      this.emit('error',
        `Job ${job.title} detected as flaky (attempt ${this.flakyAttempts.get(job.item.id)}/3, ` +
        `duration ${Math.round(duration / 1000)}s, log ${logSize} bytes) — retrying`,
      );
    } else if (isFlaky) {
      // 3 flaky failures — consistently flaky, mark failed
      result = 'failed';
      failureCategory = 'consistently_flaky';
      this.emit('error',
        `Job ${job.title} consistently flaky after 3 flaky retries — marking failed`,
      );
    } else {
      // Normal retry (still has attempts left)
      result = 'retry';
    }

    // Update queue via queue-store (no manual locking needed — store handles it)
    try {
      if (result === 'success' || result === 'success_no_artifacts') {
        await markCompleted(job.item.id);
      } else if (result === 'retry') {
        await markQueued(job.item.id);
      } else {
        await markFailed(job.item.id, failureCategory === 'consistently_flaky'
          ? 'consistently flaky after 3 attempts'
          : `exit code ${exitCode}`);
        // Cascade failure to transitive dependents
        try {
          const blockedIds = await cascadeFailure(job.item.id);
          if (blockedIds.length > 0) {
            this.emit('error', `Blocked ${blockedIds.length} dependent item(s) due to failure of ${job.item.project}`);
          }
        } catch (cascadeErr) {
          this.emit('error', `Failed to cascade failure: ${String(cascadeErr)}`);
        }
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
        ...(result === 'failed' ? { failure_category: failureCategory ?? `exit_${exitCode}` } : {}),
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

  // ── Timeout checking ───────────────────────────────────────────────────

  /**
   * Check all active jobs for timeout violations.
   *
   * Called once per main loop iteration (centralized, replaces individual
   * setTimeout per job). Uses per-item meta.timeout if set, falling back
   * to config.defaultTimeout. timeout=0 disables the timeout entirely.
   *
   * Timed-out real PIDs get their process tree killed (SIGTERM to group
   * first, then tree-kill SIGKILL). Synthetic PIDs get an exit code set
   * so they are reaped in the next cycle.
   */
  private async checkTimeouts(): Promise<void> {
    for (const [pid, job] of this.state.activeJobs) {
      const timeoutMinutes = typeof job.item.meta['timeout'] === 'number'
        ? job.item.meta['timeout']
        : this.config.defaultTimeout;

      // timeout=0 means no timeout
      if (timeoutMinutes === 0) continue;

      const elapsedMs = Date.now() - job.startTime;
      const timeoutMs = timeoutMinutes * 60 * 1000;

      if (elapsedMs > timeoutMs) {
        this.emit('error', `Job ${job.title} timed out after ${timeoutMinutes} minutes`);

        if (pid > 0) {
          // Real PID — kill the entire process group with SIGTERM first
          try { process.kill(-pid, 'SIGTERM'); } catch { /* process group may not exist */ }
          // Wait briefly then force kill the tree
          await sleep(5000);
          if (isProcessAlive(pid)) {
            await killProcessTree(pid);
          }
        }
        // For synthetic PIDs (lifecycle modes), set exit code to trigger reap
        this.state.exitCodes.set(pid, -1);
      }
    }
  }

  // ── Stuck detection ─────────────────────────────────────────────────

  /**
   * Check all active jobs for stuck signals.
   *
   * Called every 60 seconds from the main loop. Uses the daemon-optimized
   * stuck scorer (no CPU sampling — instant results).
   *
   * Stuck jobs are killed (SIGTERM → tree-kill) and their exit code is
   * set to -1 so they are reaped and retried via the normal completion flow.
   *
   * Skips synthetic PIDs (lifecycle modes) — they manage their own steps.
   */
  private async checkStuckJobs(): Promise<void> {
    for (const [pid, job] of this.state.activeJobs) {
      // Skip synthetic PIDs (lifecycle modes — managed differently)
      if (pid < 0) continue;

      const runtimeSeconds = Math.round((Date.now() - job.startTime) / 1000);

      try {
        const assessment = await computeDaemonStuckScore(
          pid, job.title, job.logFile, runtimeSeconds,
        );

        if (assessment.verdict === 'stuck') {
          this.emit('error',
            `Job ${job.title} is stuck (score ${assessment.score}): ` +
            assessment.signals.map(s => s.detail).join(', '),
          );

          // Kill the process tree
          try { process.kill(-pid, 'SIGTERM'); } catch { /* group may not exist */ }
          await sleep(5000);
          if (isProcessAlive(pid)) {
            await killProcessTree(pid);
          }

          // Set exit code to trigger reap → handleJobCompletion handles retry
          this.state.exitCodes.set(pid, -1);
        }
      } catch {
        // Stuck check failure for individual job must not crash daemon
      }
    }
  }

  // ── Periodic orphan cleanup ───────────────────────────────────────────

  /**
   * Find and kill orphaned opencode processes not tracked by the daemon.
   *
   * Called every 30 minutes from the main loop. Finds running opencode
   * processes via pgrep, cross-references with activeJobs PIDs, and kills
   * any that have been running for > 2 hours without being tracked.
   *
   * This catches processes from crashed daemon runs that weren't cleaned up.
   */
  private async cleanOrphanPeriodic(): Promise<void> {
    try {
      const result = await execa('pgrep', ['-f', 'opencode'], { reject: false });
      if (result.exitCode !== 0 || !result.stdout.trim()) {
        return; // No opencode processes found
      }

      const pids = result.stdout.trim().split('\n')
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !Number.isNaN(p) && p > 0);

      if (pids.length === 0) return;

      // Build set of tracked PIDs
      const trackedPids = new Set<number>();
      for (const pid of this.state.activeJobs.keys()) {
        if (pid > 0) trackedPids.add(pid);
      }

      // Exclude our own PID and parent PID
      const selfPid = process.pid;
      const parentPid = process.ppid;

      for (const pid of pids) {
        // Skip self, parent, and tracked PIDs
        if (pid === selfPid || pid === parentPid) continue;
        if (trackedPids.has(pid)) continue;

        // Check runtime — only kill if > 2 hours old
        try {
          const runtime = await getProcessRuntime(pid);
          if (runtime !== null && runtime > 2 * 60 * 60) {
            this.emit('error',
              `Killing orphan opencode process ${pid} (running ${Math.round(runtime / 60)}min, not tracked by daemon)`,
            );
            await killProcessTree(pid);
          }
        } catch {
          // Can't check runtime — skip this PID
        }
      }
    } catch {
      // pgrep unavailable or error — non-critical
    }
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────

  /**
   * Graceful shutdown.
   *
   * Sets isShuttingDown flag, which causes mainLoop to stop scanning
   * for new items. Active jobs finish naturally — they are NOT killed.
   * The post-loop drain block in mainLoop() waits for all active jobs
   * to complete before returning.
   *
   * Force-killing is handled externally by `pilot stop --force`.
   * PID file cleanup happens in start()'s finally block.
   */
  async shutdown(): Promise<void> {
    if (this.state.isShuttingDown) {
      return;
    }
    this.state.isShuttingDown = true;
    this.emit('shutdown');
    // Active jobs drain in the post-loop block of mainLoop()
    // PID file cleaned up in start() finally block
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
