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
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync, watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { getConfig, resolveProjectDir } from './config.js';
import {
  getNextPending,
  markRunning,
  markCompleted,
  markFailed,
  cancel,
  updateDelegationPlan,
  advanceStep,
  getJob,
  updateSessionTitles,
  recordStep,
  completeStep,
  skipRemainingSteps,
  claimNextLaunchable,
  forceQuitJob,
  getAllRunningJobs,
  getRunningJobsForProject,
  reconcileStaleJobs,
  resetToPending,
  updateJudgeVerdict,
  updateActualModels,
} from './db.js';
import { delegate, resolveOpencodeBinary } from './delegate.js';
import { findSessionByTitle, isSessionDone, getLastMessage, getSessionModels, getAssistantMessageCount } from './opencode-db.js';
import { patchAgentFrontmatter, resolveAllAgentModels, resolveTopLevelModel } from './models.js';
import { truncateTitle } from '../util/format.js';
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
  verdict: 'pass' | 'fail' | 'partial';
  confidence: number;
  summary: string;
  retryRecommendation: 'none' | 'retry-full' | 'retry-resume';
  retryHint?: string;
}

// ── Spawn rate limiter (module-level) ──────────────────────────────────────

let lastSpawnTime = 0;
const MIN_SPAWN_INTERVAL_MS = 5_000;

// ── Stale-running reconciler ───────────────────────────────────────────────

/**
 * Reconcile stale-running jobs: query all jobs with status='running' and for each,
 * check if a corresponding opencode process is still alive via pgrep.
 * Jobs whose process is no longer alive are force-quit so the runner can retry them.
 *
 * Called on startup (to clean up jobs from a previous crashed runner instance)
 * and at the start of each poll cycle (ongoing reconciliation).
 *
 * @param activeJobs - The runner's current in-memory active job map (to skip jobs
 *   that are actively being managed by this runner instance)
 */
async function reconcileStaleRunning(
  activeJobs: Map<string, { job: Job; title: string }>,
): Promise<void> {
  let runningJobs: Job[];
  try {
    runningJobs = getAllRunningJobs();
  } catch {
    // DB may not be accessible yet — skip reconciliation
    return;
  }

  for (const job of runningJobs) {
    // Skip jobs actively managed by this runner instance
    if (activeJobs.has(job.id)) continue;

    const sessionTitles: string[] = [];
    try {
      const parsed = JSON.parse(job.sessionTitles ?? '[]') as string[];
      sessionTitles.push(...parsed);
    } catch {
      // Ignore malformed session_titles
    }

    let processAlive = false;
    for (const title of sessionTitles) {
      try {
        const { stdout } = await execa('pgrep', ['-f', title], { reject: false });
        if (stdout.trim()) {
          processAlive = true;
          break;
        }
      } catch {
        // pgrep error = not found
      }
    }

    if (!processAlive) {
      // Orphan: force-quit so the runner can re-queue or report
      try {
        forceQuitJob(job.id, 'cli', 'Stale-running reconciler: process not found');
        process.stderr.write(
          `[runner] Reconciler: force-quit orphaned job ${job.id} (${job.project}) — no live process found\n`,
        );
      } catch {
        // Best effort — don't crash the reconciler
      }
    }
  }
}

// ── Runner Class ───────────────────────────────────────────────────────────

class Runner {
  private options: RunnerOptions;
  private running = false;
  private activeJobs: Map<string, { job: Job; title: string }> = new Map();
  private shuttingDown = false;
  private reloading = false;
  private pollCycle = 0;
  private static readonly RECONCILE_EVERY_N_CYCLES = 10;

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
   *
   * Immediate multi-slot dispatch: drains all available slots before sleeping.
   * Event-driven wake: fs.watch on pilot.db fires when new jobs are inserted.
   * Stale-running reconciliation: on startup and each poll cycle, orphaned jobs
   * (running in DB but no live process) are force-quit so they can be retried.
   */
  async run(): Promise<void> {
    this.running = true;
    this.setupShutdownHandlers();

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

    // ── Startup reconciliation: clean up jobs left running from a crashed runner ──
    await reconcileStaleRunning(this.activeJobs);

    // Startup reconciliation (DB-based): reset any ghost-running jobs from a previous
    // runner crash. On a fresh start, activeJobs is empty — so ALL running jobs in DB
    // are stale and should be reset to pending so they can be retried.
    const startupStale = reconcileStaleJobs(new Set(this.activeJobs.keys()));
    if (startupStale.length > 0) {
      process.stderr.write(
        `[runner] Startup reconciliation: reset ${startupStale.length} stale-running job(s): ${startupStale.join(', ')}\n`,
      );
    }

    try {
    while (this.running) {
      if (this.shuttingDown) break;

      // Periodic reconciliation: reset ghost-running jobs every N cycles
      this.pollCycle++;
      if (this.pollCycle % Runner.RECONCILE_EVERY_N_CYCLES === 0) {
        const staleIds = reconcileStaleJobs(new Set(this.activeJobs.keys()));
        if (staleIds.length > 0) {
          process.stderr.write(
            `[runner] Periodic reconciliation: reset ${staleIds.length} stale-running job(s): ${staleIds.join(', ')}\n`,
          );
        }
      }

      // Per-cycle reconciliation: kill orphaned running jobs
      await reconcileStaleRunning(this.activeJobs);

      // ── Immediate multi-slot drain loop ────────────────────────────────
      // Fill ALL available slots before sleeping — not just one per iteration.
      // claimNextLaunchable() atomically selects + marks-running the next eligible
      // job, enforcing project-level serialization within the transaction.
      let launched = false;
      while (this.activeJobs.size < this.options.maxParallel && !this.shuttingDown) {
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
          process.stderr.write(
            `[runner] Skipping ${job.id} (${job.project}): same-project job already active\n`,
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
      // Clean up DB watcher and PID file on exit
      dbWatcher?.close();
      this.removePidFile(pidFilePath);
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

    try {
      this.patchModelsForJob(job, projectDir);

      // Step 1: Delegation — get execution plan (typically single step for phase jobs)
      updateSessionTitles(job.id, [`pilot-delegate-${job.id}-1`]);
      let plan: DelegationPlan;
      try {
        plan = await delegate(job, projectDir);
      } catch (err) {
        throw new Error(`Delegation failed: ${err instanceof Error ? err.message : String(err)}`);
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
            spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
            sessionId ?? null);
          throw spawnErr;
        }

        const sessionId = findSessionByTitle(title);
        completeStep(currentStepRowId, 'completed', null, null, sessionId ?? null);
        advanceStep(job.id);

        // Step 3: For phase commands, spawn judge to evaluate results
        if (step.command === 'phase') {
          // No-activity check: did the execution session actually produce output?
          // If the session has 0 assistant messages, the process likely crashed or
          // exited immediately (missing commands, OOM, etc.). Mark as failed rather
          // than letting the judge "benefit of doubt" mark it as completed.
          const execSessionId = findSessionByTitle(title);
          if (execSessionId) {
            const assistantMsgCount = getAssistantMessageCount(execSessionId);
            if (assistantMsgCount === 0) {
              const freshJob = getJob(job.id);
              if (freshJob && freshJob.attempts < freshJob.maxAttempts) {
                resetToPending(job.id, 'No activity detected — session may have crashed or exited immediately');
                process.stderr.write(
                  `[runner] No activity in session for ${job.id} (0 assistant messages). Resetting to pending.\n`,
                );
                return;
              }
              throw new Error('No activity detected — session produced 0 assistant messages (crash or immediate exit)');
            }
          } else {
            // No session found at all — definite failure
            const freshJob = getJob(job.id);
            if (freshJob && freshJob.attempts < freshJob.maxAttempts) {
              resetToPending(job.id, 'No session created — opencode may have crashed before starting');
              process.stderr.write(
                `[runner] No session found for ${job.id}. Resetting to pending.\n`,
              );
              return;
            }
            throw new Error('No session created — opencode may have crashed before starting');
          }

          // Guard: check shutdown before starting judge — phase session already completed,
          // so reset to pending to preserve that work rather than marking failed
          if (this.shuttingDown) {
            resetToPending(job.id, 'Interrupted before judge evaluation');
            process.stderr.write(
              `[runner] Shutdown during phase — resetting ${job.id} to pending (phase completed, judge skipped)\n`,
            );
            return; // Don't mark completed or failed — it's pending for retry
          }

          let judgeVerdict: JudgeVerdict | null;
          try {
            judgeVerdict = await this.runJudge(job, projectDir, title);
          } catch (judgeErr) {
            // If judge threw because of shutdown, reset to pending (preserve phase work)
            if (this.shuttingDown) {
              resetToPending(job.id, 'Interrupted during judge evaluation');
              process.stderr.write(
                `[runner] Shutdown during judge — resetting ${job.id} to pending\n`,
              );
              return;
            }
            // Non-shutdown judge error: benefit of doubt, fall through to markCompleted
            judgeVerdict = null;
          }

          if (judgeVerdict) {
            updateJudgeVerdict(job.id, JSON.stringify(judgeVerdict));

            if (judgeVerdict.verdict === 'fail') {
              // Re-fetch job to get fresh attempts count (claimNextLaunchable already incremented it)
              const freshJob = getJob(job.id);
              if (judgeVerdict.retryRecommendation !== 'none' && freshJob && freshJob.attempts < freshJob.maxAttempts) {
                resetToPending(job.id, judgeVerdict.retryHint);
                process.stderr.write(
                  `[runner] Judge verdict: fail (retryable). Resetting ${job.id} to pending.\n`,
                );
                return; // Don't mark completed or failed — it's pending again
              }
              throw new Error(`Judge verdict: fail — ${judgeVerdict.summary}`);
            }

            if (judgeVerdict.verdict === 'partial') {
              // Re-fetch job to get fresh attempts count (claimNextLaunchable already incremented it)
              const freshJob = getJob(job.id);
              if (judgeVerdict.retryRecommendation === 'retry-resume' && freshJob && freshJob.attempts < freshJob.maxAttempts) {
                resetToPending(job.id, judgeVerdict.retryHint ?? '--resume');
                process.stderr.write(
                  `[runner] Judge verdict: partial. Resetting ${job.id} to pending with resume hint.\n`,
                );
                return;
              }
              // Partial but no retries left — accept as completed
              process.stderr.write(
                `[runner] Judge verdict: partial (no retries left). Accepting ${job.id}.\n`,
              );
            }

            // verdict === 'pass' or accepted partial — fall through to markCompleted
          }
          // Judge failed to produce verdict — benefit of doubt only because session had real activity
          // (no-activity sessions are already caught above)
          // Store as inconclusive (confidence=0) so status displays can differentiate
          // from verified completions — green should mean verified-green, not "we-have-no-idea-green"
          updateJudgeVerdict(job.id, JSON.stringify({
            verdict: 'pass',
            confidence: 0,
            summary: 'Judge failed — benefit of doubt applied (session had real activity)',
            retryRecommendation: 'none',
          }));
          process.stderr.write(
            `[runner] ⚠ Judge failed to produce verdict for ${job.id} — marking as completed (benefit of doubt)\n`,
          );
        }
      }

      if (allStepsCompleted) {
        this.collectActualModels(job.id);
        markCompleted(job.id);
      } else {
        // Shutdown interrupted — reset to pending instead of cancel
        resetToPending(job.id, 'Interrupted by shutdown');
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.collectActualModels(job.id);
      markFailed(job.id, error);
    } finally {
      this.activeJobs.delete(job.id);
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
   * Spawn a pilot-judge session to evaluate whether a phase job succeeded.
   * Reads the opencode DB transcript and outputs a structured JSON verdict.
   * Returns null on any failure (benefit of doubt — mark as completed).
   */
  private async runJudge(job: Job, projectDir: string, phaseSessionTitle: string): Promise<JudgeVerdict | null> {
    const ts = Date.now().toString(36).slice(-4);
    const judgeTitle = truncateTitle(`pilot-judge-${job.id}-${ts}`, 80);

    // Build judge args: requirement source + session title
    const requirementArg = job.requirementPath ?? job.description;
    const judgeArgs = `${requirementArg} ${phaseSessionTitle}`;

    try {
      await this.spawnAndWait(projectDir, 'pilot-judge', judgeArgs, judgeTitle);
    } catch (err) {
      process.stderr.write(
        `[runner] Judge session failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return null; // Judge failure = benefit of doubt
    }

    // Parse judge output from opencode DB
    const sessionId = findSessionByTitle(judgeTitle);
    if (!sessionId) return null;

    const lastMsg = getLastMessage(sessionId);
    if (!lastMsg) return null;

    return parseJudgeVerdict(lastMsg.content, judgeTitle);
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

    // Resolve top-level model for --model flag
    // Judge sessions use 'judge' scope; all others use job scope from activeJobs
    const isJudge = command === 'pilot-judge';
    const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
    const scope = isJudge ? 'judge' as const : (jobEntry?.job.scope ?? 'quick');
    const profile = jobEntry?.job.modelProfile ?? 'balanced';
    const providerMode = jobEntry?.job.providerMode ?? 'claude-only';
    const topLevelModel = resolveTopLevelModel(scope, profile, providerMode);
    process.stderr.write(dim(`Top-level model: ${topLevelModel}`) + '\n');

    // Spawn detached opencode session (setsid via detached:true, NEVER nohup)
    const gsdCommand = command.startsWith('gsd-') || command.startsWith('pilot-') ? command : `gsd-${command}`;
    const proc = execa(opencodeBin, [
      'run',
      '--format', 'default',
      '--model', topLevelModel,      // enforce model at session level
      '--title', title,
      '--command', gsdCommand,
      // Pass args as a single positional string. NEVER use -- separator
      // (causes arg.includes error on numeric args in opencode).
      // To avoid opencode's yargs swallowing --flags, the delegate module
      // ensures args never START with -- (puts content before flags).
      ...(args ? [args] : []),
    ], {
      cwd,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      detached: true,
      cleanup: false,
    });
    // Ignore the execa promise — we poll opencode DB for completion instead.
    // Without this catch, a non-zero exit code becomes an unhandled rejection.
    proc.catch(() => {});
    proc.unref();

    // Poll opencode DB for session completion using isSessionDone() + PID liveness.
    // isSessionDone() uses step-finish reason as ground truth — eliminated the broken
    // premature completion heuristic that fired when sessions had long-running tool calls.
    const pollMs = config.pollInterval * 1000;
    let sessionFound = false;
    const procPid = proc.pid;

    while (Date.now() - start < timeoutMs) {
      await this.sleep(pollMs);

      if (this.shuttingDown) {
        throw new Error('Runner shutting down');
      }

      const sessionId = findSessionByTitle(title);
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
          // PID dead — do one final isSessionDone check
          if (isSessionDone(sessionId)) {
            return; // Completed just as process exited
          }
          // Process died without stop signal — log and return
          process.stderr.write(
            `[runner] Warning: process died without stop signal for session ${title}. Treating as complete.\n`,
          );
          return;
        }
      }
    }

    if (!sessionFound) {
      throw new Error(`Session never appeared in opencode DB: ${title}`);
    }

    throw new Error(`Session timed out after ${config.defaultTimeout}m: ${title}`);
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
    if (!['pass', 'fail', 'partial'].includes(verdict.verdict)) return null;
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



// ── killJobSession ─────────────────────────────────────────────────────────

interface KillJobSessionResult {
  killed: boolean;
  reason: string;
}

/**
 * Find and terminate the opencode process for a running job.
 *
 * Parses job.sessionTitles JSON to get the list of session title strings.
 * Uses pgrep -f to find PIDs running that title as part of their command line.
 * Sends SIGTERM, waits up to 5s, then SIGKILL if still alive.
 *
 * Returns { killed: true } even if the process died on SIGTERM before SIGKILL.
 * Returns { killed: false, reason } if no process was found or an error occurred.
 */
async function killJobSession(job: Job): Promise<KillJobSessionResult> {
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

  // Try titles in reverse order (most recent first)
  let foundPid: number | null = null;
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
    return { killed: false, reason: `SIGTERM failed: ${err instanceof Error ? err.message : String(err)}` };
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
      reason: `SIGKILL failed: ${err instanceof Error ? err.message : String(err)}`,
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

// Export pre-spawn checks for direct testing
export {
  disableSnapshotGc,
  checkMemory,
  enforceSpawnRateLimit,
  validateProjectConfig,
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
