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
import lockfile from 'proper-lockfile';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { getConfig, resolveProjectDir } from './config.js';
import {
  markCompleted,
  markFailed,
  markStale,
  cancel,
  updateDelegationPlan,
  advanceStep,
  getJob,
  updateSessionTitles,
  recordStep,
  completeStep,
  skipRemainingSteps,
  claimNextLaunchable,
  getAllRunningJobs,
  getRunningJobsForProject,
  resetToPending,
  updateJudgeVerdict,
  updateActualModels,
  getProject,
} from './db.js';
import { delegate, resolveOpencodeBinary } from './delegate.js';
import { resolveSkillsForJob, injectSkills, cleanupInjectedSkills } from './skills.js';
import { notifyJobCompletion } from './callback.js';
import { findSessionByTitle, exportSessionFromDb, isSessionDone, getLastMessage, getSessionModels, getAssistantMessageCount } from './opencode-db.js';
import { patchAgentFrontmatter, resolveAllAgentModels, resolveTopLevelModel, resolveVariant } from './models.js';
import { truncateTitle } from '../util/format.js';
import { errMsg } from '../util/errors.js';
import { dim } from '../util/colors.js';
import type { Job, DelegationPlan, DelegationStep } from './types.js';

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

interface JudgeVerdict {
  verdict: 'succeeded' | 'failed' | 'doubting';
  confidence: number;
  reason: string;
}

// ── Spawn rate limiter (module-level) ──────────────────────────────────────

let lastSpawnTime = 0;
const MIN_SPAWN_INTERVAL_MS = 5_000;

// ── systemd-run availability (cached) ─────────────────────────────────────

let _systemdRunAvailable: boolean | null = null;
let _systemdRunWarned = false;

/**
 * Check if systemd-run --user --scope is available on this system.
 * Cached after first call — probes once per daemon lifecycle.
 * Returns true on capable systems (Ubuntu 22.04+ with user lingering enabled).
 */
async function hasSystemdRunUser(): Promise<boolean> {
  if (_systemdRunAvailable !== null) return _systemdRunAvailable;
  try {
    const { exitCode } = await execa('systemd-run', ['--user', '--scope', 'true'], {
      timeout: 5000, reject: false,
    });
    _systemdRunAvailable = exitCode === 0;
  } catch {
    _systemdRunAvailable = false;
  }
  return _systemdRunAvailable;
}

/** Reset systemd-run cache — for tests only. @internal */
function _resetSystemdRunCache(): void {
  _systemdRunAvailable = null;
  _systemdRunWarned = false;
}

// ── Dynamic maxParallel ───────────────────────────────────────────────────

/**
 * Calculate how many parallel sessions memory can support right now.
 * Called before EACH spawn attempt in the drain loop, not just once at startup.
 * Returns min(configuredMax, memorySlots) where memorySlots = (available - reservedMb) / sessionMemoryMb.
 * Returns 0 when insufficient memory (caller should wait).
 *
 * Takes all three inputs as parameters for easy unit-testing without mocking getConfig().
 */
function getDynamicMaxParallel(configuredMax: number, sessionMemoryMb: number, reservedMb: number): number {
  const availableMb = getAvailableMemoryMb();
  if (availableMb === Infinity) return configuredMax; // Non-Linux: skip check
  const usableMb = Math.max(0, availableMb - reservedMb);
  const memorySlots = Math.floor(usableMb / sessionMemoryMb);
  return Math.max(0, Math.min(configuredMax, memorySlots));
}

// ── OOM score adjustment ──────────────────────────────────────────────────

/**
 * Set oom_score_adj for the current process.
 * -500 for the daemon (survive before expendable sessions).
 * Best-effort — fails silently on non-Linux or permission errors.
 */
function setOomScore(score: number): void {
  try {
    writeFileSync('/proc/self/oom_score_adj', String(score));
  } catch {
    // Non-Linux or insufficient permissions — skip silently
  }
}

// ── Runner Class ───────────────────────────────────────────────────────────

class Runner {
  private options: RunnerOptions;
  private running = false;
  private activeJobs: Map<string, { job: Job; title: string }> = new Map();
  // Track spawned PIDs by session title for reliable kill (no pgrep needed)
  private sessionPids: Map<string, number> = new Map();
  private shuttingDown = false;
  private reloading = false;
  // (reconciliation removed — opencode DB is ground truth, no per-cycle checks needed)
  private lockRelease: (() => Promise<void>) | null = null;
  private lockPath: string | null = null;
  // Low-memory logging: only log once per state change (transition to 0)
  private loggedLowMemory = false;

  constructor(options: Partial<RunnerOptions> = {}) {
    const config = getConfig();
    this.options = {
      maxParallel: options.maxParallel ?? config.maxParallel,
      once: options.once ?? false,
      pollInterval: options.pollInterval ?? 5,
    };
  }

  /**
   * Acquire a singleton lock at ~/.pilot/runner.lock via proper-lockfile.
   * Exits immediately with code 1 if another runner is already active.
   * The lock refreshes itself every 5s; stale detection fires after 10s (crash recovery).
   */
  private async acquireRunnerLock(): Promise<void> {
    const config = getConfig();
    const lp = path.join(config.pilotDir, 'runner.lock');
    mkdirSync(path.dirname(lp), { recursive: true });
    // Ensure lock target file exists (proper-lockfile requires it)
    writeFileSync(lp, '', { flag: 'a' });

    try {
      this.lockRelease = await lockfile.lock(lp, {
        stale: 10000,    // 10s stale detection for crash recovery
        update: 5000,    // Refresh lock every 5s to prove liveness
        realpath: false,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('already being held')) {
        let extra = '';
        try {
          const content = readFileSync(lp, 'utf8').trim();
          if (content) extra = ` (PID: ${content})`;
        } catch { /* ignore */ }
        throw new Error(
          `Failed to acquire runner lock: another instance is running${extra}. Use 'pilot service status' to check.`,
        );
      }
      throw err;
    }

    // Write PID for debugging visibility
    writeFileSync(lp, String(process.pid));
    this.lockPath = lp;
  }

  /**
   * Release the singleton lock. Called on clean shutdown.
   * Crash recovery is handled automatically by proper-lockfile stale detection (10s).
   */
  private async releaseRunnerLock(): Promise<void> {
    if (this.lockRelease) {
      try {
        await this.lockRelease();
      } catch {
        // Ignore release errors — process is exiting anyway
      }
      this.lockRelease = null;
    }
  }

  /**
   * Start the runner event loop.
   * Polls for pending jobs, launches them up to maxParallel, waits, repeats.
   *
   * Immediate multi-slot dispatch: drains all available slots before sleeping.
   * Event-driven wake: fs.watch on pilot.db fires when new jobs are inserted.
   * Stale-running reconciliation: on startup and each poll cycle, orphaned jobs
   * (running in DB but no live process) are force-quit so they can be retried.
   */
  async run(): Promise<void> {
    // Acquire singleton lock FIRST — before any other setup.
    // Prevents cascading fan-out from duplicate runners.
    await this.acquireRunnerLock();

    this.running = true;
    // Set OOM score for the daemon process — survive before expendable sessions
    setOomScore(-500);
    this.setupShutdownHandlers();

    // ── Process resilience handlers ──────────────────────────────────────
    // Catch unhandled rejections/exceptions, log, cleanup, and exit.
    const processCleanupAndExit = (label: string, reason: unknown) => {
      process.stderr.write(`[runner] ${label}: ${errMsg(reason)}\n`);
      // Best-effort cleanup
      try { this.lockRelease?.(); } catch { /* best effort */ }
      for (const [, aj] of this.activeJobs) {
        try {
          const pid = this.sessionPids.get(aj.title);
          if (pid !== undefined) process.kill(pid, 'SIGTERM');
        } catch { /* ignore */ }
      }
      process.exit(1);
    };
    const onUnhandledRejection = (reason: unknown) => processCleanupAndExit('Unhandled rejection', reason);
    const onUncaughtException = (err: Error) => processCleanupAndExit('Uncaught exception', err);
    process.on('unhandledRejection', onUnhandledRejection);
    process.on('uncaughtException', onUncaughtException);

    // ── Job PID file directory ───────────────────────────────────────────
    const initConfig = getConfig();
    const jobPidsDir = path.join(initConfig.pilotDir, 'pids');
    mkdirSync(jobPidsDir, { recursive: true });

    // Write PID file so postbuild and `pilot reload` can signal us
    const pidFilePath = this.getPidFilePath();
    this.writePidFile(pidFilePath);

    // ── Event-driven wake-up via fs.watch on pilot.db ─────────────────────
    const config = getConfig();
    const dbPath = config.pilotDbPath;

    let wakeResolve: (() => void) | null = null;

    const wakeOrTimeout = (ms: number): Promise<void> => {
      return new Promise(resolve => {
        wakeResolve = resolve;
        setTimeout(() => {
          wakeResolve = null;
          resolve();
        }, ms);
      });
    };

    const triggerWake = (): void => {
      if (wakeResolve) {
        wakeResolve();
        wakeResolve = null;
      }
    };

    let dbWatcher: ReturnType<typeof fsWatch> | null = null;
    try {
      dbWatcher = fsWatch(dbPath, { persistent: false }, () => {
        triggerWake();
      });
      dbWatcher.on('error', () => { /* ignore — DB may not exist yet */ });
    } catch {
      // fs.watch may fail if DB doesn't exist yet — fallback to pure polling
    }

    // ── Memory pressure watchdog ─────────────────────────────────────────
    const watchdogIntervalMs = 10_000;
    const watchdogInterval = setInterval(async () => {
      const config = getConfig();
      const availableMb = getAvailableMemoryMb();
      if (availableMb === Infinity || availableMb >= config.memoryKillThresholdMb) return;
      if (this.activeJobs.size === 0) return;

      // Find newest active job (most recent started_at = least work done)
      let newestEntry: { job: Job; title: string } | null = null;
      let newestStarted = 0;
      for (const entry of this.activeJobs.values()) {
        const started = entry.job.startedAt ? new Date(entry.job.startedAt).getTime() : 0;
        if (started > newestStarted) {
          newestStarted = started;
          newestEntry = entry;
        }
      }

      if (!newestEntry) return;

      process.stderr.write(
        `[runner] Memory pressure watchdog: ${availableMb}MB available (threshold: ${config.memoryKillThresholdMb}MB). Killing newest job ${newestEntry.job.id} (${newestEntry.job.project}) to preserve progress on older jobs\n`,
      );

      try {
        await killJobSession(newestEntry.job, this.sessionPids);
      } catch (err) {
        process.stderr.write(`[runner] watchdog kill error: ${errMsg(err)}\n`);
      }
      try {
        resetToPending(newestEntry.job.id, 'Killed by memory pressure watchdog');
        this.activeJobs.delete(newestEntry.job.id);
      } catch (err) {
        process.stderr.write(`[runner] watchdog resetToPending error: ${errMsg(err)}\n`);
        // Remove from activeJobs so reconciliation picks it up on the next cycle
        this.activeJobs.delete(newestEntry.job.id);
      }
    }, watchdogIntervalMs);

    // ── Startup reconciliation: kill orphaned processes and reset stale jobs ──
    // On a fresh start, activeJobs is empty — so ALL running jobs in DB are from
    // a previous runner. Kill their processes BEFORE resetting to prevent fan-out.
    {
      const running = getAllRunningJobs();
      const staleIds: string[] = [];
      for (const job of running) {
        if (!this.activeJobs.has(job.id)) {
          // Kill orphaned processes before resetting
          try {
            await killJobSession(job);
          } catch { /* best effort */ }
          markStale(job.id);
          staleIds.push(job.id);
        }
      }
      if (staleIds.length > 0) {
        process.stderr.write(
          `[runner] Startup reconciliation: killed processes + reset ${staleIds.length} stale job(s): ${staleIds.join(', ')}\n`,
        );
      }
    }

    // ── Startup: clean orphaned PID files ────────────────────────────────
    try {
      const pidFiles = readdirSync(jobPidsDir).filter(f => f.endsWith('.pid'));
      let orphanCount = 0;
      for (const pidFile of pidFiles) {
        const jobId = pidFile.replace('.pid', '');
        const pidContent = readFileSync(path.join(jobPidsDir, pidFile), 'utf8').trim();
        const pid = parseInt(pidContent, 10);
        if (!isNaN(pid)) {
          try {
            process.kill(pid, 0); // Check if alive
            // PID is alive but not in activeJobs — orphaned
            if (!this.activeJobs.has(jobId)) {
              try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
              orphanCount++;
            }
          } catch {
            // PID dead — clean up file
          }
        }
        // Clean up PID file regardless
        try { unlinkSync(path.join(jobPidsDir, pidFile)); } catch { /* ignore */ }
      }
      if (orphanCount > 0) {
        process.stderr.write(`[runner] Cleaned ${orphanCount} orphaned PID file(s)\n`);
      }
    } catch {
      // PID directory may not exist yet — ignore
    }

    // ── Startup: check provider mode availability ─────────────────────
    {
      const { checkProviderAvailability } = await import('./providers.js');
      const { getConfigFileDefaults } = await import('./config.js');
      const defaults = getConfigFileDefaults();
      const { warning } = await checkProviderAvailability(defaults.providerMode);
      if (warning) {
        process.stderr.write(`${warning}\n`);
      }
    }

    try {
    while (this.running) {
      if (this.shuttingDown) break;

      // ── Immediate multi-slot drain loop ────────────────────────────────
      // Fill ALL available slots before sleeping — not just one per iteration.
      // claimNextLaunchable() atomically selects + marks-running the next eligible
      // job, enforcing project-level serialization within the transaction.
      let launched = false;
      const config = getConfig();
      const effectiveMaxParallel = getDynamicMaxParallel(this.options.maxParallel, config.sessionMemoryMaxMb, config.reservedMemoryMb);
      // Log low-memory state transitions (once per state change)
      if (effectiveMaxParallel === 0 && !this.loggedLowMemory) {
        process.stderr.write('[runner] Low memory — not launching new jobs\n');
        this.loggedLowMemory = true;
      } else if (effectiveMaxParallel > 0) {
        this.loggedLowMemory = false;
      }
      while (this.activeJobs.size < effectiveMaxParallel && !this.shuttingDown) {
        const job = claimNextLaunchable();
        if (!job) break; // No more eligible jobs

        // Same-project serialization guard: check if any CURRENTLY ACTIVE job has the same
        // project name. Compare job.project (string) — NOT job.id. This prevents two jobs
        // for 'my-project' from running in parallel even if they have different IDs.
        // Note: claimNextLaunchable() enforces this at the DB level too; this in-memory
        // guard is belt-and-suspenders for the runner's own tracked state.
        const projectAlreadyActive = [...this.activeJobs.values()].some(
          ({ job: activeJob }) => activeJob.project === job.project,
        );
        if (projectAlreadyActive) {
          // Undo the claim — job was atomically set to 'running' by claimNextLaunchable
          // but we can't launch it. Reset to pending so it's not orphaned.
          resetToPending(job.id);
          process.stderr.write(
            `[runner] Skipping ${job.id} (${job.project}): same-project job already active (reset to pending)\n`,
          );
          break; // Don't try more jobs this cycle — wait for the active one to finish
        }

        // Job already marked running by claimNextLaunchable — do NOT call markRunning here
        this.activeJobs.set(job.id, { job, title: '' });
        // Launch without awaiting — allows parallel jobs
        this.launch(job).catch(() => {
          // Error already handled in launch() via markFailed
        });
        launched = true;
      }
      if (launched) continue; // If we launched anything, check for more immediately

      // If --once and no active jobs, exit
      if (this.options.once && this.activeJobs.size === 0) {
        break;
      }

      // Wait for DB change event (new job inserted) or poll interval timeout
      await wakeOrTimeout(this.options.pollInterval * 1000);
    }

    // Wait for active jobs to finish
    while (this.activeJobs.size > 0) {
      await this.sleep(5000);
    }

    } finally {
      // Clean up watchdog, DB watcher, PID file, and singleton lock on exit
      clearInterval(watchdogInterval);
      dbWatcher?.close();
      this.removePidFile(pidFilePath);
      await this.releaseRunnerLock();
      // Remove process resilience handlers to prevent leaks if run() is called again
      process.removeListener('unhandledRejection', onUnhandledRejection);
      process.removeListener('uncaughtException', onUncaughtException);
    }

    // If SIGHUP triggered reload, re-exec with new code
    if (this.reloading) {
      process.stderr.write('[runner] Reloading with new code...\n');

      // Detect systemd: INVOCATION_ID is set for systemd-managed services
      const underSystemd = !!process.env.INVOCATION_ID;

      if (underSystemd) {
        // Systemd has Restart=always — just exit and it restarts us
        process.stderr.write('[runner] Under systemd — exiting for automatic restart\n');
        process.exit(0);
      } else {
        // Not under systemd — spawn a new process before exiting
        const child = execa(process.execPath, process.argv.slice(1), {
          detached: true,
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'ignore',
          cleanup: false,
        });
        child.catch(() => {});
        child.unref();
        process.stderr.write(`[runner] Spawned new runner (PID ${child.pid}), exiting old\n`);
        process.exit(0);
      }
    }
  }

  /**
   * Launch a job: delegate → execute steps → judge (for phase steps) → mark complete/failed.
   *
   * NOTE: markRunning() is NOT called here. claimNextLaunchable() already sets
   * status=running, started_at=datetime('now'), and increments attempts atomically
   * in the dispatch loop. Calling markRunning again would double-increment attempts
   * and overwrite started_at with a slightly later timestamp.
   */
  private async launch(job: Job): Promise<void> {
    const projectDir = resolveProjectDir(job.project);

    // Warn when picking up a job for an unregistered project (non-blocking)
    const projectRecord = getProject(job.project);
    if (!projectRecord) {
      process.stderr.write(
        `[runner] Warning: job ${job.id} targets unregistered project "${job.project}". Register with: pilot setup <dir> --owner <key>\n`,
      );
    }

    // Inject matching skills into project's .opencode/skills/ directory
    const resolvedSkills = resolveSkillsForJob(job.categories ?? null);
    if (resolvedSkills.length > 0) {
      try {
        const injected = injectSkills(resolvedSkills, projectDir);
        if (injected.length > 0) {
          process.stderr.write(`[runner] Injected ${injected.length} skill(s) for job ${job.id}: ${injected.join(', ')}\n`);
        }
      } catch (err) {
        process.stderr.write(`[runner] Warning: skill injection failed for job ${job.id}: ${errMsg(err)}\n`);
        // Non-fatal: continue without skills
      }
    }

    try {
      this.patchModelsForJob(job, projectDir);

      // Step 1: Delegation — get execution plan (typically single step for phase jobs)
      let plan: DelegationPlan;
      try {
        const result = await delegate(job, projectDir);
        const { _sessionTitle, ...planData } = result as DelegationPlan & { _sessionTitle?: string };
        plan = planData;
        if (_sessionTitle) {
          updateSessionTitles(job.id, [_sessionTitle]);
        }
      } catch (err) {
        throw new Error(`Delegation failed: ${errMsg(err)}`);
      }
      updateDelegationPlan(job.id, plan);

      // Step 2: Execute each step
      let allStepsCompleted = true;
      for (let i = 0; i < plan.steps.length; i++) {
        if (this.shuttingDown) {
          allStepsCompleted = false;
          skipRemainingSteps(job.id, i, 'Runner shutdown');
          break;
        }

        // Verify we still own this job (guards against stale resets or external cancellation)
        const freshJob = getJob(job.id);
        if (!freshJob || freshJob.status !== 'running') {
          process.stderr.write(
            `[runner] Job ${job.id} no longer running (status=${freshJob?.status ?? 'gone'}). Aborting step ${i}.\n`,
          );
          allStepsCompleted = false;
          break;
        }

        const step = plan.steps[i];
        const ts = Date.now().toString(36).slice(-4);
        const title = truncateTitle(`${job.project}-${step.command}-${job.id}-${ts}`, 80);
        this.activeJobs.set(job.id, { job, title });
        updateSessionTitles(job.id, [title]);
        this.patchModelsForJob(job, projectDir);

        const currentStepRowId = recordStep(job.id, i, step.command, step.args, title);

        try {
          await this.spawnAndWait(projectDir, step.command, step.args, title);
        } catch (spawnErr) {
          const sessionId = findSessionByTitle(title);
          completeStep(currentStepRowId, 'failed', null,
            errMsg(spawnErr),
            sessionId ?? null);
          throw spawnErr;
        }

        const sessionId = findSessionByTitle(title);
        completeStep(currentStepRowId, 'completed', null, null, sessionId ?? null);
        advanceStep(job.id);

        // After new-milestone: re-delegate to get phase steps
        if (step.command === 'new-milestone') {
          process.stderr.write(
            `[runner] new-milestone complete, re-delegating for phase steps...\n`,
          );
          try {
            const rePlan = await delegate(job, projectDir);
            if (rePlan.steps.length > 0) {
              plan.steps.push(...rePlan.steps);
              // Update stored plan so step tracking stays accurate
              updateDelegationPlan(job.id, plan);
              process.stderr.write(
                `[runner] Re-delegation added ${rePlan.steps.length} steps\n`,
              );
            } else {
              process.stderr.write(
                `[runner] Re-delegation returned 0 steps — all phases may be done\n`,
              );
            }
          } catch (err) {
            throw new Error(`Re-delegation after new-milestone failed: ${errMsg(err)}`);
          }
        }

        // Step 3: For execute-phase commands, spawn judge to evaluate results
        if (step.command === 'execute-phase') {
          // No-activity check: did the execution session actually produce output?
          // If the session has 0 assistant messages, the process likely crashed or
          // exited immediately (missing commands, OOM, etc.). Mark as failed rather
          // than letting the judge "benefit of doubt" mark it as completed.
          const execSessionId = findSessionByTitle(title);
          if (execSessionId) {
            const assistantMsgCount = getAssistantMessageCount(execSessionId);
            if (assistantMsgCount === 0) {
              resetToPending(job.id, 'No activity detected — session may have crashed or exited immediately');
              process.stderr.write(
                `[runner] No activity in session for ${job.id} (0 assistant messages). Resetting to pending.\n`,
              );
              return;
            }
          } else {
            // No session found at all — reset to pending
            resetToPending(job.id, 'No session created — opencode may have crashed before starting');
            process.stderr.write(
              `[runner] No session found for ${job.id}. Resetting to pending.\n`,
            );
            return;
          }

          // Judge shutdown guard
          if (this.shuttingDown) {
            resetToPending(job.id, 'Interrupted before verification');
            process.stderr.write(`[runner] Shutdown during phase — resetting ${job.id} to pending\n`);
            return;
          }

          // Run gsd-judge to get structured verdict from session output
          const judgeVerdict = await this.runJudge(job, projectDir, step);

          if (judgeVerdict === null) {
            // Judge crash or unparseable — benefit of doubt
            updateJudgeVerdict(job.id, JSON.stringify({
              verdict: 'succeeded',
              confidence: 0,
              reason: 'judge unavailable',
            }));
          } else if (judgeVerdict.verdict === 'succeeded') {
            updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
          } else if (judgeVerdict.verdict === 'doubting') {
            updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
            if (judgeVerdict.confidence < 50) {
              // Low confidence doubt — treat as fail
              throw new Error(judgeVerdict.reason);
            }
            // confidence >= 50 — treat as pass, fall through
          } else {
            // 'failed'
            updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));
            throw new Error(judgeVerdict.reason);
          }
        }
      }

      if (allStepsCompleted) {
        this.collectActualModels(job.id);

        markCompleted(job.id);
        // Fire-and-forget callback to wake originating session
        const completedJob = getJob(job.id);
        if (completedJob) {
          notifyJobCompletion(completedJob).catch(() => {});
        }
      } else {
        // Shutdown interrupted — reset to pending instead of cancel
        // resetToPending is guarded by AND status='running' — no-op if job was force-quit
        resetToPending(job.id, 'Interrupted by shutdown');
      }
    } catch (err) {
      const error = errMsg(err);
      this.collectActualModels(job.id);
      try {
        markFailed(job.id, error);
      } catch (markErr) {
        process.stderr.write(`[runner] markFailed also failed for ${job.id}: ${errMsg(markErr)}\n`);
      }
      // Fire-and-forget callback to wake originating session
      const failedJob = getJob(job.id);
      if (failedJob) {
        notifyJobCompletion(failedJob).catch(() => {});

        // If no direct callback agentId, notify the project owner (plain agent ID) instead
        if (!failedJob.callbackSessionKey) {
          const project = getProject(failedJob.project);
          if (project?.owner) {
            // Synthesize a job-like object addressed to the owner (project.owner is a plain agent ID)
            const ownerNotifyJob = {
              ...failedJob,
              callbackSessionKey: project.owner,
              error: `Job ${failedJob.id} failed and blocked project ${failedJob.project}.\n` +
                     `Reason: ${error}\n` +
                     `Actions: pilot retry ${failedJob.id}  ·  pilot unblock "${failedJob.project}"`,
            };
            notifyJobCompletion(ownerNotifyJob).catch(() => {});
          }
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
      // Clean up job PID file
      try {
        unlinkSync(path.join(getConfig().pilotDir, 'pids', `${job.id}.pid`));
      } catch { /* ENOENT or other — ignore */ }
      // Clean up tracked PIDs for this job's sessions
      try {
        const titles = JSON.parse(job.sessionTitles ?? '[]') as string[];
        for (const t of titles) this.sessionPids.delete(t);
      } catch { /* ignore */ }
      // Also clean the latest title set during launch
      const freshJob = getJob(job.id);
      if (freshJob?.sessionTitles) {
        try {
          const titles = JSON.parse(freshJob.sessionTitles) as string[];
          for (const t of titles) this.sessionPids.delete(t);
        } catch { /* ignore */ }
      }
      // Clean up injected skills
      try {
        cleanupInjectedSkills(projectDir);
      } catch {
        // Best-effort cleanup — don't fail the job
      }
    }
  }

  private patchModelsForJob(job: Job, projectDir: string): void {
    if (!job.modelProfile) {
      return;
    }

    const providerMode = job.providerMode ?? 'claude-only';
    process.stderr.write(dim(`Patching agent models: ${job.modelProfile}/${providerMode}`) + '\n');
    const models = resolveAllAgentModels(job.modelProfile, providerMode);
    patchAgentFrontmatter(projectDir, models);
  }

  /**
   * Collect actual models used across all sessions for a job and persist to DB.
   * Queries opencode DB for distinct provider/model strings from assistant messages.
   * Called before markCompleted() and markFailed() to capture ground-truth model usage.
   */
  private collectActualModels(jobId: string): void {
    try {
      const freshJob = getJob(jobId);
      if (!freshJob?.sessionTitles) return;

      let sessionTitles: string[] = [];
      try {
        sessionTitles = JSON.parse(freshJob.sessionTitles) as string[];
      } catch {
        return;
      }

      const allActualModels = new Set<string>();
      for (const sessionTitle of sessionTitles) {
        const models = getSessionModels(sessionTitle);
        for (const m of models) allActualModels.add(m);
      }

      if (allActualModels.size > 0) {
        updateActualModels(jobId, [...allActualModels]);
      }
    } catch {
      // Best effort — don't fail the job due to model collection error
    }
  }

  /**
   * Spawn gsd-judge to evaluate a completed execute-phase step.
   * Returns null on any failure (benefit of doubt — mark as completed).
   *
   * Extracts JSON verdict from the last assistant message of the judge session.
   * Same pattern as delegation JSON extraction in delegate.ts.
   */
  private async runJudge(job: Job, projectDir: string, step: DelegationStep): Promise<JudgeVerdict | null> {
    const phaseNum = step.args.match(/(\d+)/)?.[1];
    if (!phaseNum) {
      process.stderr.write(`[runner] runJudge: no phase number found in step args "${step.args}"\n`);
      return null;
    }

    const ts = Date.now().toString(36).slice(-4);
    const judgeTitle = truncateTitle(`pilot-judge-${job.id}-${ts}`, 80);
    updateSessionTitles(job.id, [judgeTitle]);

    // Cap judge at 15 minutes
    const judgeTimeoutMs = 15 * 60 * 1000;

    try {
      await this.spawnAndWait(projectDir, 'gsd-judge', `${job.id} ${phaseNum}`, judgeTitle, judgeTimeoutMs);
    } catch (err) {
      const msg = errMsg(err);
      if (msg.includes('timed out')) {
        process.stderr.write(`[runner] Judge timed out after 15m for ${judgeTitle} — benefit of doubt\n`);
      } else {
        process.stderr.write(`[runner] Judge session failed: ${msg}\n`);
      }
      return null; // Benefit of doubt on spawn failure or timeout
    }

    // Extract JSON from judge session output (same pattern as delegation)
    const sessionId = findSessionByTitle(judgeTitle);
    if (!sessionId) {
      process.stderr.write(`[runner] runJudge: session not found for ${judgeTitle}\n`);
      return null;
    }

    try {
      const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
      if (exported.messages.length > 0) {
        const lastAssistant = [...exported.messages]
          .reverse()
          .find(m => m.role === 'assistant');
        if (lastAssistant) {
          const content = String(lastAssistant.content ?? '');
          return parseJudgeVerdict(content, judgeTitle);
        }
      }
    } catch (err) {
      process.stderr.write(`[runner] runJudge: session export failed for ${judgeTitle}: ${errMsg(err)}\n`);
    }

    return null; // Benefit of doubt
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
    timeoutOverrideMs?: number,
  ): Promise<void> {
    const config = getConfig();
    const opencodeBin = resolveOpencodeBinary();

    // Job-level timeout: read from job record (0 = infinite)
    // timeoutOverrideMs is used for verification sessions (always has a cap)
    let timeoutMs: number;
    if (timeoutOverrideMs !== undefined) {
      timeoutMs = timeoutOverrideMs;
    } else {
      const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
      const jobTimeout = jobEntry?.job.timeout ?? 0;
      timeoutMs = jobTimeout > 0 ? jobTimeout * 60 * 1000 : Infinity;
    }
    const start = Date.now();

    // CRITICAL: Pre-spawn safety checks from SPAWN-LESSONS.md
    await disableSnapshotGc();
    try {
      await checkMemory(config.sessionMemoryMaxMb + 1024);
    } catch (memErr) {
      // Memory still insufficient after wait — return job to pending for retry
      const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
      if (jobEntry) {
        resetToPending(jobEntry.job.id, `Insufficient memory — returned to queue`);
        process.stderr.write(
          `[runner] Insufficient memory after 5m wait, returning job ${jobEntry.job.id} to pending\n`,
        );
        return; // Exit spawnAndWait cleanly — job is back in queue
      }
      throw memErr; // No job entry (verification session) — re-throw
    }
    await enforceSpawnRateLimit();
    await validateProjectConfig(cwd);

    // Resolve top-level model for --model flag
    // Judge/verify sessions use 'judge' scope (cheap tier); all others use job scope from activeJobs
    const isJudge = command === 'gsd-judge';
    const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
    const scope = isJudge ? 'judge' as const : (jobEntry?.job.scope ?? 'quick');
    const profile = jobEntry?.job.modelProfile ?? 'balanced';
    const providerMode = jobEntry?.job.providerMode ?? 'claude-only';
    const topLevelModel = resolveTopLevelModel(scope, profile, providerMode);
    const gsdCommand = command.startsWith('gsd-') || command.startsWith('pilot-') ? command : `gsd-${command}`;
    const variant = resolveVariant(topLevelModel, scope, profile, gsdCommand);
    process.stderr.write(dim(`Top-level model: ${topLevelModel}${variant ? ` (variant: ${variant})` : ''}`) + '\n');

    const opencodeCmdArgs: string[] = [
      'run',
      '--format', 'default',
      '--model', topLevelModel,
      ...(variant ? ['--variant', variant] : []),
      '--title', title,
      '--command', gsdCommand,
      // Pass args as a single positional string. NEVER use -- separator
      // (causes arg.includes error on numeric args in opencode).
      // To avoid opencode's yargs swallowing --flags, the delegate module
      // ensures args never START with -- (puts content before flags).
      ...(args ? [args] : []),
    ];

    const useSystemdRun = await hasSystemdRunUser();
    let proc;

    if (useSystemdRun) {
      const sessionMemoryMb = config.sessionMemoryMaxMb;
      // Unit name: safe chars only (no slashes/spaces), unique via base36 timestamp
      const safeUnit = `pilot-${title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60)}-${Date.now().toString(36)}`;
      proc = execa('systemd-run', [
        '--scope', '--user',
        '-p', `MemoryMax=${sessionMemoryMb}M`,
        '-p', 'MemorySwapMax=0',
        // NOTE: OOMScoreAdjust not supported on all systemd versions (requires 256+)
        // OOMPolicy=kill ensures the scope is cleaned up if it hits MemoryMax
        '-p', 'OOMPolicy=kill',
        '--unit', safeUnit,
        '--',
        opencodeBin,
        ...opencodeCmdArgs,
      ], {
        cwd,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
        detached: true,
        cleanup: false,
      });
    } else {
      if (!_systemdRunWarned) {
        process.stderr.write('[runner] systemd-run --user unavailable — spawning without cgroup memory limits\n');
        _systemdRunWarned = true;
      }
      proc = execa(opencodeBin, opencodeCmdArgs, {
        cwd,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
        detached: true,
        cleanup: false,
      });
    }
    // Ignore the execa promise — we poll opencode DB for completion instead.
    // Without this catch, a non-zero exit code becomes an unhandled rejection.
    proc.catch(() => {});
    proc.unref();

    // Track PID for reliable kill operations (replaces pgrep)
    if (proc.pid !== undefined) {
      this.sessionPids.set(title, proc.pid);
      // Write PID file for crash recovery — survives runner restarts
      const jobEntry = [...this.activeJobs.entries()].find(([, v]) => v.title === title);
      if (jobEntry) {
        const pidFilePath = path.join(getConfig().pilotDir, 'pids', `${jobEntry[0]}.pid`);
        try { writeFileSync(pidFilePath, String(proc.pid)); } catch { /* best effort */ }
      }
    }

    // Poll opencode DB for session completion using isSessionDone() + PID liveness.
    // isSessionDone() uses step-finish reason as ground truth — eliminated the broken
    // premature completion heuristic that fired when sessions had long-running tool calls.
    const pollMs = this.options.pollInterval * 1000;
    let sessionFound = false;
    const procPid = proc.pid;

    while (timeoutMs === Infinity || Date.now() - start < timeoutMs) {
      await this.sleep(pollMs);

      if (this.shuttingDown) {
        throw new Error('Runner shutting down');
      }

      const sessionId = findSessionByTitle(title);

      if (process.env['PILOT_DEBUG']) {
        const pollElapsedS = Math.round((Date.now() - start) / 1000);
        let pidAlive = 'n/a';
        if (procPid !== undefined) {
          try { process.kill(procPid, 0); pidAlive = 'true'; } catch { pidAlive = 'false'; }
        }
        process.stderr.write(
          `[runner] poll ${title}: elapsed=${pollElapsedS}s sessionFound=${sessionFound} isSessionDone=${sessionId ? isSessionDone(sessionId) : 'n/a'} pid=${procPid ?? 'n/a'} pidAlive=${pidAlive}\n`,
        );
      }
      if (!sessionId) {
        // Session not yet in DB — check PID liveness as early termination guard
        if (procPid !== undefined) {
          try {
            process.kill(procPid, 0);
            // PID alive, session not in DB yet — keep waiting
          } catch {
            // PID dead before session appeared — bail out early
            if (Date.now() - start > 10_000) {
              throw new Error(`Session never appeared in opencode DB: ${title} (process died)`);
            }
          }
        }
        continue;
      }
      sessionFound = true;

      // Primary completion check: step-finish reason is the ground truth
      if (isSessionDone(sessionId)) {
        return; // Session completed normally
      }

      // Belt-and-suspenders: check PID liveness
      if (procPid !== undefined) {
        try {
          process.kill(procPid, 0);
          // PID alive — session still in progress, keep polling
        } catch {
          // PID dead — give SQLite WAL a moment to flush, then check
          await this.sleep(2000);
          if (isSessionDone(sessionId)) {
            return; // Completed just as process exited
          }
          // One more check after a longer wait (WAL can be slow under load)
          await this.sleep(3000);
          if (isSessionDone(sessionId)) {
            return;
          }
          // Check if session has assistant messages — if so, it likely completed
          // but the step-finish record wasn't written (e.g. process killed by cgroup)
          const msgCount = getAssistantMessageCount(sessionId);
          if (msgCount > 0) {
            process.stderr.write(
              `[runner] Warning: process died for ${title} but session has ${msgCount} messages. Treating as complete.\n`,
            );
            return;
          }
          // Truly dead with no activity
          throw new Error(`Process died without clean completion for session ${title} (no step-finish in opencode DB, 0 messages)`);
        }
      }
    }

    if (!sessionFound) {
      throw new Error(`Session never appeared in opencode DB: ${title}`);
    }

    // Find the job timeout for the error message
    const jobEntry2 = [...this.activeJobs.values()].find(a => a.title === title);
    const timeoutMin = jobEntry2?.job.timeout ?? 0;
    throw new Error(`Session timed out after ${timeoutMin}m: ${title}`);
  }

  /**
   * Get the path to the daemon PID file.
   */
  private getPidFilePath(): string {
    const config = getConfig();
    return path.join(config.pilotDir, 'daemon.pid');
  }

  /**
   * Write the current process PID to the PID file.
   * Creates ~/.pilot/ directory if it doesn't exist.
   */
  private writePidFile(pidPath: string): void {
    const dir = path.dirname(pidPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(pidPath, String(process.pid), 'utf8');
  }

  /**
   * Remove the PID file. Swallows ENOENT (already deleted).
   */
  private removePidFile(pidPath: string): void {
    try {
      unlinkSync(pidPath);
    } catch (err) {
      // Swallow ENOENT — file may already be deleted
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Set up SIGTERM/SIGINT/SIGHUP handlers for graceful shutdown and reload.
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = () => {
      this.shuttingDown = true;
      this.running = false;
    };
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    // SIGHUP: graceful reload — drain current steps then re-exec
    process.on('SIGHUP', () => {
      process.stderr.write('[runner] SIGHUP received — reloading after current step completes...\n');
      this.reloading = true;
      this.shuttingDown = true;  // Reuse existing mechanism to stop accepting new steps
      this.running = false;       // Break the main while loop
    });
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

// ── Judge verdict parsing ──────────────────────────────────────────────────

/**
 * Parse judge verdict from session output content.
 * Handles three formats in priority order:
 *   1. Fenced ```json block
 *   2. Raw JSON (entire content is valid JSON)
 *   3. Text-wrapped JSON (first {...} block extracted via regex)
 *
 * Returns null on parse failure or invalid verdict field.
 * Exported for direct unit testing.
 */
function parseJudgeVerdict(content: string, sessionTitle?: string): JudgeVerdict | null {
  try {
    let jsonStr: string;

    // Format 1: fenced ```json block
    const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Format 2: raw JSON (try parsing the whole trimmed content)
      try {
        JSON.parse(content.trim());
        jsonStr = content.trim();
      } catch {
        // Format 3: text-wrapped JSON — extract first {...} block
        const braceMatch = content.match(/(\{[\s\S]*\})/);
        if (braceMatch) {
          jsonStr = braceMatch[1];
        } else {
          if (sessionTitle) {
            process.stderr.write(`[runner] No JSON found in judge output for session ${sessionTitle}\n`);
          }
          return null;
        }
      }
    }

    const verdict = JSON.parse(jsonStr) as JudgeVerdict;
    if (!['succeeded', 'failed', 'doubting'].includes(verdict.verdict)) return null;
    return verdict;
  } catch {
    if (sessionTitle) {
      process.stderr.write(`[runner] Failed to parse judge verdict from session ${sessionTitle}\n`);
    }
    return null;
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

  // After max wait, memory still insufficient — throw so caller can return job to pending
  const availableMb = getAvailableMemoryMb();
  throw new Error(
    `Insufficient memory after ${maxWaitMs / 60000}m wait: ${availableMb}MB available, need ${requiredMb}MB`,
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



// ── killJobSession ─────────────────────────────────────────────────────────

interface KillJobSessionResult {
  killed: boolean;
  reason: string;
}

/**
 * Find and terminate the opencode process for a running job.
 *
 * Uses tracked PIDs (from sessionPids map) when available.
 * Falls back to pgrep -f as a last resort (e.g. for jobs started by a previous runner).
 * Sends SIGTERM, waits up to 5s, then SIGKILL if still alive.
 */
async function killJobSession(
  job: Job,
  sessionPids?: Map<string, number>,
): Promise<KillJobSessionResult> {
  // Parse session titles — most recent (last) is tried first
  let sessionTitles: string[] = [];
  try {
    sessionTitles = JSON.parse(job.sessionTitles ?? '[]') as string[];
  } catch {
    return { killed: false, reason: 'Could not parse job.sessionTitles' };
  }

  if (sessionTitles.length === 0) {
    return { killed: false, reason: 'No session titles recorded for this job' };
  }

  // Try tracked PIDs first (reliable), then pgrep fallback
  let foundPid: number | null = null;
  for (let i = sessionTitles.length - 1; i >= 0; i--) {
    const title = sessionTitles[i];
    // Check tracked PIDs
    if (sessionPids?.has(title)) {
      const pid = sessionPids.get(title)!;
      try {
        process.kill(pid, 0); // Check if alive
        foundPid = pid;
        break;
      } catch {
        sessionPids.delete(title); // Stale PID, remove
      }
    }
  }

  // Fallback: pgrep for jobs from previous runner instances
  if (foundPid === null) {
    for (let i = sessionTitles.length - 1; i >= 0; i--) {
      const title = sessionTitles[i];
      try {
        const { stdout } = await execa('pgrep', ['-f', title], { reject: false });
        const pidStr = stdout.trim().split('\n')[0];
        if (pidStr) {
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid)) {
            foundPid = pid;
            break;
          }
        }
      } catch {
        // pgrep error = not found
      }
    }
  }

  if (foundPid === null) {
    return { killed: false, reason: 'Process not found for session titles' };
  }

  const pid = foundPid;

  // Send SIGTERM
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH') {
      // Process already gone — consider it killed
      return { killed: true, reason: `Process ${pid} already gone (ESRCH on SIGTERM)` };
    }
    return { killed: false, reason: `SIGTERM failed: ${errMsg(err)}` };
  }

  // Wait up to 5 seconds for the process to exit (poll every 500ms)
  const pollMs = 500;
  const maxWaitMs = 5_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollMs));
    // Check if process is still alive via kill -0
    try {
      process.kill(pid, 0);
      // kill -0 succeeded: process still alive, keep waiting
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process gone — SIGTERM worked
        return { killed: true, reason: `Sent SIGTERM to PID ${pid}` };
      }
      // EPERM or other error — process may still be alive, fall through to SIGKILL
      break;
    }
  }

  // Process survived SIGTERM — send SIGKILL
  try {
    process.kill(pid, 'SIGKILL');
    return { killed: true, reason: `Sent SIGTERM/SIGKILL to PID ${pid}` };
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH') {
      // Died between SIGTERM check and SIGKILL
      return { killed: true, reason: `Sent SIGTERM to PID ${pid} (process exited before SIGKILL)` };
    }
    return {
      killed: false,
      reason: `SIGKILL failed: ${errMsg(err)}`,
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

function createRunner(options?: Partial<RunnerOptions>): Runner {
  return new Runner(options);
}

// ── Exports ────────────────────────────────────────────────────────────────

export { Runner, createRunner, killJobSession, parseJudgeVerdict };
export type { RunnerOptions, RunnerState, JudgeVerdict, KillJobSessionResult };

// Export only the pre-spawn helpers that are needed by external consumers
export {
  getAvailableMemoryMb,
};

/**
 * Reset the module-level spawn rate limiter.
 * @internal — only for use in tests
 */
function _resetSpawnRateLimit(): void {
  lastSpawnTime = 0;
}

export { _resetSpawnRateLimit };

export {
  hasSystemdRunUser,
  getDynamicMaxParallel,
  _resetSystemdRunCache,
};
