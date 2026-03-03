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
import { getConfig } from './config.js';
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
  getRunningJobsForProject,  // NEW — available for serialization guard via DB query
  reconcileStaleJobs,         // NEW — reset ghost-running jobs to pending
} from './db.js';
import { delegate, resolveOpencodeBinary } from './delegate.js';
import { findSessionByTitle, isSessionActive, getLastMessage } from './opencode-db.js';
import { patchAgentFrontmatter, resolveAllAgentModels } from './models.js';
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
   * Launch a job: delegate → execute steps → mark complete/failed.
   *
   * NOTE: markRunning() is NOT called here. claimNextLaunchable() already sets
   * status=running, started_at=datetime('now'), and increments attempts atomically
   * in the dispatch loop. Calling markRunning again would double-increment attempts
   * and overwrite started_at with a slightly later timestamp.
   */
  private async launch(job: Job): Promise<void> {
    const config = getConfig();
    const projectDir = path.isAbsolute(job.project) ? job.project : path.join(config.projectDir, job.project);
    let currentStepRowId: number | null = null;

    try {
      // Job already marked running by claimNextLaunchable — do not call markRunning here
      // activeJobs already set in run() before launch() is called

      this.patchModelsForJob(job, projectDir);

      // Step 1: Delegation AI decides what GSD commands to run
      // Track delegation session title so `pilot log` can find it
      updateSessionTitles(job.id, [`pilot-delegate-${job.id}-1`]);
      let plan: DelegationPlan;
      try {
        plan = await delegate(job, projectDir);
      } catch (err) {
        throw new Error(`Delegation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      updateDelegationPlan(job.id, plan);

      // Step 2: Execute each step sequentially
      let allStepsCompleted = true;
      for (let i = 0; i < plan.steps.length; i++) {
        if (this.shuttingDown) {
          allStepsCompleted = false;
          // Mark remaining steps as skipped
          skipRemainingSteps(job.id, i, 'Runner shutdown');
          break;
        }

        const step = plan.steps[i];
        const ts = Date.now().toString(36).slice(-4);
        const title = truncateTitle(`${job.project}-${step.command}-${job.id}-${ts}`, 80);
        this.activeJobs.set(job.id, { job, title });
        updateSessionTitles(job.id, [title]);

        this.patchModelsForJob(job, projectDir);

        // Record step as running before spawn
        currentStepRowId = recordStep(job.id, i, step.command, step.args, title);

        // Snapshot phase dirs before add-phase for diff detection
        const prevPhaseDirs = step.command === 'add-phase' ? scanPhaseDirs(projectDir) : [];

        try {
          await this.spawnAndWait(projectDir, step.command, step.args, title);
        } catch (spawnErr) {
          // Mark step failed, then re-throw
          const sessionId = findSessionByTitle(title);
          completeStep(currentStepRowId, 'failed', null, spawnErr instanceof Error ? spawnErr.message : String(spawnErr), sessionId ?? null);
          currentStepRowId = null;
          throw spawnErr;
        }

        // R2: Semantic success gating for phase commands
        if (step.command === 'execute-phase' || step.command === 'plan-phase') {
          const sessionId = findSessionByTitle(title);
          if (sessionId) {
            const verdict = evaluateStepResult(sessionId, step.command);
            if (!verdict.success) {
              completeStep(currentStepRowId, 'failed', verdict.source, verdict.reason, sessionId);
              currentStepRowId = null;
              throw new Error(`Step "${step.command} ${step.args}" failed: ${verdict.reason}`);
            }
            completeStep(currentStepRowId, 'completed', verdict.source, verdict.reason, sessionId);
          } else {
            completeStep(currentStepRowId, 'completed', null, 'Session not found for verdict check');
          }
        } else {
          const sessionId = findSessionByTitle(title);
          completeStep(currentStepRowId, 'completed', null, null, sessionId ?? null);
        }
        currentStepRowId = null;

        // Inter-step artifact verification (small delay for git commits to flush)
        await this.sleep(2000);
        let verification: ArtifactVerification;
        if (step.command === 'plan-phase') {
          verification = await this.verifyWithGraceWindow(projectDir, step, prevPhaseDirs, title);
        } else {
          verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
          // Retry once after 3s if failed — git commits may still be flushing
          if (!verification.ok) {
            await this.sleep(3000);
            verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
          }
        }
        process.stderr.write(`[runner] Artifact check for ${step.command}: ${verification.ok ? 'passed' : verification.error}\n`);
        if (!verification.ok) {
          throw new Error(`Step "${step.command} ${step.args}" artifact check failed: ${verification.error}`);
        }

        // Dynamic arg patching after add-phase
        if (step.command === 'add-phase' && verification.newPhaseNumber !== undefined) {
          if (i + 1 < plan.steps.length) {
            const nextArgs = plan.steps[i + 1].args;
            const predictedMatch = nextArgs.match(/^(\d+)/);
            if (predictedMatch) {
              const predicted = parseInt(predictedMatch[1], 10);
              if (predicted !== verification.newPhaseNumber) {
                patchStepArgs(plan.steps, i + 1, predicted, verification.newPhaseNumber);
              }
            }
          }
        }

        advanceStep(job.id);
      }

      // R3: Only mark completed if all steps actually ran
      if (allStepsCompleted) {
        markCompleted(job.id);
      } else {
        cancel(job.id);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // Safety net: if a step was in-flight when error occurred, mark it failed
      if (currentStepRowId !== null) {
        try {
          completeStep(currentStepRowId, 'failed', null, error);
        } catch { /* best effort */ }
      }
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

    // Poll opencode DB for session completion
    const pollMs = config.pollInterval * 1000;
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

  /**
   * Grace window artifact verification for plan-phase steps.
   *
   * Retries artifact checks for up to GRACE_WINDOW_MS, polling every POLL_INTERVAL_MS.
   * Session liveness is checked each poll cycle:
   *   - If session is still active, keep waiting (artifacts may still be materializing).
   *   - If session is dead and artifacts still absent, fail immediately (no point waiting).
   * Exits early (success) as soon as artifacts appear.
   */
  private async verifyWithGraceWindow(
    projectDir: string,
    step: DelegationStep,
    prevPhaseDirs: string[],
    sessionTitle: string,
  ): Promise<ArtifactVerification> {
    const GRACE_WINDOW_MS = 120_000; // 2 minutes
    const POLL_INTERVAL_MS = 3_000;  // 3 seconds

    // Initial check (the 2s sleep already happened in launch() before calling this)
    let verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);
    if (verification.ok) {
      return verification;
    }

    // Enter grace window
    process.stderr.write(
      `[runner] Artifact check failed for ${step.command}, entering grace window (${GRACE_WINDOW_MS / 1000}s)...\n`,
    );

    const graceStart = Date.now();
    while (Date.now() - graceStart < GRACE_WINDOW_MS && !this.shuttingDown) {
      await this.sleep(POLL_INTERVAL_MS);
      const elapsed = Date.now() - graceStart;

      // Check session liveness
      const sessionId = findSessionByTitle(sessionTitle);
      let sessionAlive = false;
      let lastMsgAgeMs: number | null = null;

      if (sessionId) {
        const active = isSessionActive(sessionId);
        const lastMsg = getLastMessage(sessionId);
        lastMsgAgeMs = lastMsg ? Date.now() - lastMsg.createdAt : null;

        // Session is alive if: still active, OR last message was recent (within 60s)
        sessionAlive = active || (lastMsgAgeMs !== null && lastMsgAgeMs < 60_000);
      }

      // Retry artifact check
      verification = verifyStepArtifacts(projectDir, step, prevPhaseDirs);

      if (verification.ok) {
        process.stderr.write(
          `[runner] Artifacts appeared after ${elapsed}ms grace window\n`,
        );
        return verification;
      }

      if (!sessionAlive) {
        const ageInfo = lastMsgAgeMs !== null ? `${lastMsgAgeMs}ms ago` : 'unknown';
        process.stderr.write(
          `[runner] Artifacts still missing and session inactive (last update: ${ageInfo}). Failing.\n`,
        );
        return verification;
      }

      process.stderr.write(
        `[runner] Artifacts not yet present, session still active. Retrying... (${elapsed}ms / ${GRACE_WINDOW_MS}ms)\n`,
      );
    }

    // Grace window exhausted
    process.stderr.write(
      `[runner] Grace window exhausted (${GRACE_WINDOW_MS}ms). Final artifact check failed: ${verification.error}\n`,
    );
    return verification;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

// ── Semantic success gating (R2) ───────────────────────────────────────────

interface StepVerdict {
  success: boolean;
  reason: string;
  source: 'semantic-check';
  certainty: 'definite' | 'uncertain';
}

/**
 * R2: Evaluate whether a phase command (execute-phase, plan-phase) succeeded
 * by checking the last assistant message for semantic failure and success markers.
 *
 * Returns { success: false, certainty: 'definite' } for known failure patterns.
 * Returns { success: true, certainty: 'definite' } for known success patterns.
 * Returns { success: true, certainty: 'uncertain' } when neither matched (benefit of the doubt).
 */
function evaluateStepResult(sessionId: string, _command: string): StepVerdict {
  const lastMsg = getLastMessage(sessionId);
  if (!lastMsg) {
    return { success: true, reason: 'No messages to evaluate', source: 'semantic-check', certainty: 'uncertain' };
  }

  const content = lastMsg.content;

  // Failure markers — these indicate the command semantically failed
  const failurePatterns = [
    /no matching phase/i,
    /error.*phase.*not found/i,
    /no plans? found/i,
    /phase directory.*not found/i,
    /cannot find phase/i,
    /failed to (plan|execute|verify)/i,
    /\berror\b.*\b(execute|plan|verify)\b/i,
  ];

  for (const pattern of failurePatterns) {
    if (pattern.test(content)) {
      return {
        success: false,
        reason: `Semantic failure detected: ${content.slice(0, 200)}`,
        source: 'semantic-check',
        certainty: 'definite',
      };
    }
  }

  // Success markers — these indicate the command completed successfully
  const successPatterns = [
    /phase\s+\d+\s+(execution\s+)?complete/i,
    /all\s+plans?\s+executed/i,
    /verification\s+passed/i,
    /planning\s+complete/i,
    /all\s+\d+\s+plans?\s+executed\s+successfully/i,
    /phase\s+\d+\s+done/i,
    /created?\s+\d+\s+plan\s+files?/i,
  ];

  for (const pattern of successPatterns) {
    if (pattern.test(content)) {
      return {
        success: true,
        reason: `Success marker: ${content.slice(0, 200)}`,
        source: 'semantic-check',
        certainty: 'definite',
      };
    }
  }

  // Neither success nor failure patterns matched — uncertain
  process.stderr.write(
    `[runner] Warning: Step result ambiguous — neither success nor failure patterns matched. Last message: ${content.slice(0, 100)}\n`,
  );
  return {
    success: true,
    reason: 'No failure markers detected (uncertain — no success markers either)',
    source: 'semantic-check',
    certainty: 'uncertain',
  };
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

// ── Inter-step verification helpers ────────────────────────────────────────

/**
 * Scan .planning/phases/ directory and return sorted list of phase directory names.
 * Returns empty array if directory doesn't exist.
 */
function scanPhaseDirs(projectDir: string): string[] {
  const phasesDir = path.join(projectDir, '.planning', 'phases');
  try {
    const entries = readdirSync(phasesDir);
    return entries.filter((e: string) => /^\d+/.test(e)).sort();
  } catch {
    return [];
  }
}

interface ArtifactVerification {
  ok: boolean;
  error?: string;
  newPhaseNumber?: number;
}

/**
 * Verify expected artifacts exist after a phase lifecycle step completes.
 *
 * - add-phase: checks a new phase directory was created, returns its number
 * - plan-phase: checks at least one *-PLAN.md exists in the phase directory
 * - execute-phase: checks at least one *-SUMMARY.md exists in the phase directory
 * - all others: returns ok:true (skip verification)
 */
function verifyStepArtifacts(
  projectDir: string,
  step: DelegationStep,
  prevPhaseDirs: string[],
): ArtifactVerification {
  const phasesDir = path.join(projectDir, '.planning', 'phases');

  if (step.command === 'add-phase') {
    const currentDirs = scanPhaseDirs(projectDir);
    const newDirs = currentDirs.filter(d => !prevPhaseDirs.includes(d));
    if (newDirs.length === 0) {
      return { ok: false, error: 'add-phase did not create a new phase directory' };
    }
    const match = newDirs[0].match(/^(\d+)/);
    const newPhaseNumber = match ? parseInt(match[1], 10) : undefined;
    return { ok: true, newPhaseNumber };
  }

  if (step.command === 'plan-phase') {
    const phaseNum = step.args.match(/^(\d+)/);
    if (!phaseNum) return { ok: true }; // Can't determine phase number, skip
    const padded = phaseNum[1].padStart(2, '0');
    const phaseDir = findPhaseDir(phasesDir, padded);
    if (!phaseDir) {
      return { ok: false, error: `plan-phase ${phaseNum[1]} did not create any PLAN.md files (phase directory not found)` };
    }
    try {
      const files = readdirSync(path.join(phasesDir, phaseDir));
      const planFiles = files.filter((f: string) => /-PLAN\.md$/.test(f));
      if (planFiles.length === 0) {
        return { ok: false, error: `plan-phase ${phaseNum[1]} did not create any PLAN.md files` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: `plan-phase ${phaseNum[1]} did not create any PLAN.md files (cannot read phase directory)` };
    }
  }

  if (step.command === 'execute-phase') {
    const phaseNum = step.args.match(/^(\d+)/);
    if (!phaseNum) return { ok: true };
    const padded = phaseNum[1].padStart(2, '0');
    const phaseDir = findPhaseDir(phasesDir, padded);
    if (!phaseDir) {
      return { ok: false, error: `execute-phase ${phaseNum[1]} did not create any SUMMARY.md files (phase directory not found)` };
    }
    try {
      const files = readdirSync(path.join(phasesDir, phaseDir));
      const summaryFiles = files.filter((f: string) => /-SUMMARY\.md$/.test(f));
      if (summaryFiles.length === 0) {
        return { ok: false, error: `execute-phase ${phaseNum[1]} did not create any SUMMARY.md files` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: `execute-phase ${phaseNum[1]} did not create any SUMMARY.md files (cannot read phase directory)` };
    }
  }

  // All other commands: skip verification
  return { ok: true };
}

/**
 * Find a phase directory matching the padded phase number prefix.
 * E.g. padded="03" matches "03-ui", "03-core", etc.
 */
function findPhaseDir(phasesDir: string, padded: string): string | null {
  try {
    const entries = readdirSync(phasesDir);
    return entries.find((e: string) => e.startsWith(`${padded}-`)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Mutate remaining step args when actual phase number differs from predicted.
 * Only patches plan-phase, execute-phase, and verify-phase commands.
 */
function patchStepArgs(
  steps: DelegationStep[],
  fromIndex: number,
  predictedPhase: number,
  actualPhase: number,
): void {
  for (let j = fromIndex; j < steps.length; j++) {
    const s = steps[j];
    if (s.command === 'plan-phase' || s.command === 'execute-phase' || s.command === 'verify-phase') {
      const argsMatch = s.args.match(/^(\d+)(.*)/);
      if (argsMatch && parseInt(argsMatch[1], 10) === predictedPhase) {
        const oldArgs = s.args;
        s.args = `${actualPhase}${argsMatch[2]}`;
        process.stderr.write(`[runner] Patched ${s.command} args: ${oldArgs} → ${s.args}\n`);
      }
    }
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

export { Runner, createRunner, evaluateStepResult, killJobSession };
export type { RunnerOptions, RunnerState, StepVerdict, KillJobSessionResult };

// Export pre-spawn checks for direct testing
export {
  disableSnapshotGc,
  checkMemory,
  enforceSpawnRateLimit,
  validateProjectConfig,
  getAvailableMemoryMb,
};

// Export inter-step verification helpers for direct testing
export { scanPhaseDirs, verifyStepArtifacts, patchStepArgs };

/**
 * Reset the module-level spawn rate limiter.
 * @internal — only for use in tests
 */
function _resetSpawnRateLimit(): void {
  lastSpawnTime = 0;
}

export { _resetSpawnRateLimit };
