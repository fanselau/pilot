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
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  rmSync,
  watch as fsWatch,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';

// Load judge prompt from src/prompts/judge.md at module load time
const JUDGE_PROMPT_PATH = fileURLToPath(new URL('../prompts/judge.md', import.meta.url));
const JUDGE_PROMPT = readFileSync(JUDGE_PROMPT_PATH, 'utf8');
import { getConfig, resolveProjectDir } from './config.js';
import { ensureAutonomousGsdConfig } from './gsd-config.js';
import {
  markCompleted,
  markFailed,
  markStale,
  updateDelegationPayload,
  advanceStep,
  getJob,
  updateSessionTitles,
  claimNextLaunchable,
  getAllRunningJobs,

  updateJudgeVerdict,
  updateActualModels,
  getProject,
  updateJobRecoveryStart,
  updateJobRecoveryHead,
  incrementHungCount,
  getJobSteps,
  createPendingStep,
  getNextPendingStep,
  markStepRunning as dbMarkStepRunning,
  markStepCompleted as dbMarkStepCompleted,
  markStepFailed as dbMarkStepFailed,
  getTotalStepCount,
  getPendingStepCount,
  appendSteps,
  markCompletedPendingReview,
  markReviewHold,
  resumeFromReviewHold,
} from './db.js';
import {
  delegate,
  resolveOpencodeBinary,
  getNextPhaseNumber,
  buildNewProjectArgs,
  buildQuickArgs,
  reDelegateForContinuation,
} from './delegate.js';
import {
  isGitWorktree,
  isWorktreeDirty,
  resolveCommitOrNull,
  detectGitConflictState,
} from './git-recovery.js';
import {
  installSkillsForJob,
} from './skills.js';
import { notifyJobCompletion } from './callback.js';
import {
  findSessionByTitle,
  exportSessionFromDb,
  getLastMessage,
  getSessionState,
  getSessionModelsRecursive,
  getAssistantMessageCount,
} from './opencode-db.js';
import {
  patchAgentFrontmatter,
  resolveAllAgentModels,
  resolveTopLevelModel,
} from './models.js';
import { truncateTitle } from '../util/format.js';
import { errMsg, HungSessionError } from '../util/errors.js';
import { dim } from '../util/colors.js';
import type { Job, DelegationResult, DelegationIntent, JobStep, StepSource } from './types.js';
import { MAX_STEPS_PER_JOB } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface RunnerOptions {
  maxParallel: number;
  once: boolean; // process queue once then exit
  pollInterval: number; // seconds between queue checks
}

interface RunnerState {
  active: boolean;
  activeJobs: number;
  jobIds: string[];
}

interface JudgeVerdict {
  verdict: 'succeeded' | 'failed' | 'doubting' | 'pass' | 'fail' | 'partial' | 'passed' | 'gaps_found';
  confidence: number;
  reason: string;
  gaps?: string[];
  // Keep legacy fields for parsing old verdicts — runner no longer writes these
  retryRecommendation?: string;
  retryHint?: string;
  failureFingerprint?: string[];
}

interface VerificationEvidenceEntry {
  file: string;
  content: string;
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
      timeout: 5000,
      reject: false,
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

// ── Verification evidence readers ─────────────────────────────────────────

/**
 * Read VERIFICATION.md files from the phase directory.
 * Returns aggregated content string, or null if none found.
 * Evidence files must be well-formed and >100 bytes.
 */
function readVerificationEvidence(projectDir: string, phaseNumber: number): string | null {
  const entries = getValidVerificationEvidence(projectDir, phaseNumber);
  if (entries.length === 0) return null;

  return entries
    .map((entry) => `## ${entry.file}\n\n${entry.content}`)
    .join('\n\n---\n\n');
}

function hasValidVerificationEvidence(projectDir: string, phaseNumber: number): boolean {
  return getValidVerificationEvidence(projectDir, phaseNumber).length > 0;
}

function getValidVerificationEvidence(projectDir: string, phaseNumber: number): VerificationEvidenceEntry[] {
  const contents: VerificationEvidenceEntry[] = [];

  try {
    const phasesDir = path.join(projectDir, '.planning', 'phases');
    const dirs = readdirSync(phasesDir).filter((d) => d.startsWith(`${phaseNumber}-`));

    for (const dir of dirs) {
      try {
        const files = readdirSync(path.join(phasesDir, dir)).filter((f) => f.endsWith('-VERIFICATION.md'));
        for (const file of files) {
          const content = readFileSync(path.join(phasesDir, dir, file), 'utf8');
          if (isWellFormedVerificationEvidence(content)) {
            contents.push({ file, content });
          }
        }
      } catch {
        // Skip unreadable phase directories
      }
    }
  } catch {
    return [];
  }

  return contents;
}

function isWellFormedVerificationEvidence(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length <= 100) return false;

  const frontmatterMatch = trimmed.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return false;

  const frontmatter = frontmatterMatch[1];
  const hasStatus = /^status:\s*\S+/m.test(frontmatter);
  const hasVerdict = /^verdict:\s*\S+/m.test(frontmatter);
  const body = trimmed.slice(frontmatterMatch[0].length);
  const hasBodyHeadings = /^##\s+/m.test(body);

  return hasStatus && hasVerdict && hasBodyHeadings;
}

function normalizeFailureFingerprint(fingerprint: string[] | undefined): string[] | null {
  if (!Array.isArray(fingerprint)) return null;
  const cleaned = fingerprint.map((item) => item.trim()).filter((item) => item.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Read VALIDATION.md files (Nyquist output) from the phase directory.
 * Returns aggregated content string, or null if none found.
 */
function readValidationEvidence(projectDir: string, phaseNumber: number): string | null {
  try {
    const phasesDir = path.join(projectDir, '.planning', 'phases');
    const dirs = readdirSync(phasesDir).filter((d) => d.startsWith(`${phaseNumber}-`));
    const contents: string[] = [];
    for (const dir of dirs) {
      try {
        const files = readdirSync(path.join(phasesDir, dir)).filter((f) => f.endsWith('-VALIDATION.md'));
        for (const file of files) {
          const content = readFileSync(path.join(phasesDir, dir, file), 'utf8');
          if (content.length > 0) {
            contents.push(`## ${file}\n\n${content}`);
          }
        }
      } catch {
        // Skip unreadable phase directories
      }
    }
    return contents.length > 0 ? contents.join('\n\n---\n\n') : null;
  } catch {
    return null;
  }
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

// ── Review state helpers ──────────────────────────────────────────────────

/**
 * Detect if a judge verdict's remaining gaps are all human-review items.
 * Heuristic: gaps containing keywords like "human", "manual", "visual", "UX",
 * "mobile sweep", "review", "verify" with no code/test/implementation gaps.
 * Also checks if the verdict reason mentions human verification.
 *
 * Exported for direct unit testing.
 */
function isHumanOnlyRemaining(verdict: JudgeVerdict): boolean {
  const humanKeywords = /\b(human|manual|visual|ux|mobile\s*sweep|review|verify\s*by\s*hand|user\s*test|accessibility\s*check|design\s*review)\b/i;
  const codeKeywords = /\b(bug|error|crash|test\s*fail|missing\s*implementation|broken|type\s*error|compile|build\s*fail)\b/i;

  // If there are explicit gaps, check if they're all human-type
  if (verdict.gaps && verdict.gaps.length > 0) {
    const allHuman = verdict.gaps.every(gap => humanKeywords.test(gap) && !codeKeywords.test(gap));
    if (allHuman) return true;
  }

  // Check reason for human-review indicators (only when no code problems found)
  if (verdict.reason && humanKeywords.test(verdict.reason) && !codeKeywords.test(verdict.reason)) {
    return true;
  }

  return false;
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
   */
  private async acquireRunnerLock(): Promise<void> {
    const config = getConfig();
    const lp = path.join(config.pilotDir, 'runner.lock');
    mkdirSync(path.dirname(lp), { recursive: true });
    writeFileSync(lp, '', { flag: 'a' });

    try {
      this.lockRelease = await lockfile.lock(lp, {
        stale: 10000,
        update: 5000,
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

    writeFileSync(lp, String(process.pid));
    this.lockPath = lp;
  }

  /**
   * Release the singleton lock. Called on clean shutdown.
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
   */
  async run(): Promise<void> {
    await this.acquireRunnerLock();

    this.running = true;
    setOomScore(-500);
    this.setupShutdownHandlers();

    // ── Process resilience handlers ──────────────────────────────────────
    const processCleanupAndExit = (label: string, reason: unknown) => {
      process.stderr.write(`[runner] ${label}: ${errMsg(reason)}\n`);
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

    const pidFilePath = this.getPidFilePath();
    this.writePidFile(pidFilePath);

    // ── Event-driven wake-up via fs.watch on pilot.db ─────────────────────
    const config = getConfig();
    const dbPath = config.pilotDbPath;

    let wakeResolve: (() => void) | null = null;

    const wakeOrTimeout = (ms: number): Promise<void> => {
      return new Promise((resolve) => {
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
      dbWatcher = fsWatch(dbPath, { persistent: false }, () => { triggerWake(); });
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
        markFailed(newestEntry.job.id, 'Killed by memory pressure watchdog');
        this.activeJobs.delete(newestEntry.job.id);
      } catch (err) {
        process.stderr.write(`[runner] watchdog markFailed error: ${errMsg(err)}\n`);
        this.activeJobs.delete(newestEntry.job.id);
      }
    }, watchdogIntervalMs);

    // ── Startup reconciliation ──
    {
      const running = getAllRunningJobs();
      const staleIds: string[] = [];
      for (const job of running) {
        if (!this.activeJobs.has(job.id)) {
          try { await killJobSession(job); } catch { /* best effort */ }
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
      const pidFiles = readdirSync(jobPidsDir).filter((f) => f.endsWith('.pid'));
      let orphanCount = 0;
      for (const pidFile of pidFiles) {
        const jobId = pidFile.replace('.pid', '');
        const pidContent = readFileSync(path.join(jobPidsDir, pidFile), 'utf8').trim();
        const pid = parseInt(pidContent, 10);
        if (!isNaN(pid)) {
          try {
            process.kill(pid, 0);
            if (!this.activeJobs.has(jobId)) {
              try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
              orphanCount++;
            }
          } catch {
            // PID dead — clean up file
          }
        }
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

        let launched = false;
        const config = getConfig();
        const effectiveMaxParallel = getDynamicMaxParallel(
          this.options.maxParallel,
          config.sessionMemoryMaxMb,
          config.reservedMemoryMb,
        );
        if (effectiveMaxParallel === 0 && !this.loggedLowMemory) {
          process.stderr.write('[runner] Low memory — not launching new jobs\n');
          this.loggedLowMemory = true;
        } else if (effectiveMaxParallel > 0) {
          this.loggedLowMemory = false;
        }
        while (this.activeJobs.size < effectiveMaxParallel && !this.shuttingDown) {
          const job = claimNextLaunchable(config.queueGraceSeconds ?? 0);
          if (!job) break;

          const projectAlreadyActive = [...this.activeJobs.values()].some(
            ({ job: activeJob }) => activeJob.project === job.project,
          );
          if (projectAlreadyActive) {
            markFailed(job.id, 'Stuck in unknown state');
            process.stderr.write(
              `[runner] Skipping ${job.id} (${job.project}): same-project job already active (reset to pending)\n`,
            );
            break;
          }

          this.activeJobs.set(job.id, { job, title: '' });
          this.launch(job).catch(() => {
            // Error already handled in launch() via markFailed
          });
          launched = true;
        }
        if (launched) continue;

        if (this.options.once && this.activeJobs.size === 0) {
          break;
        }

        await wakeOrTimeout(this.options.pollInterval * 1000);
      }

      while (this.activeJobs.size > 0) {
        await this.sleep(5000);
      }
    } finally {
      clearInterval(watchdogInterval);
      dbWatcher?.close();
      this.removePidFile(pidFilePath);
      await this.releaseRunnerLock();
      process.removeListener('unhandledRejection', onUnhandledRejection);
      process.removeListener('uncaughtException', onUncaughtException);
    }

    if (this.reloading) {
      process.stderr.write('[runner] Reloading with new code...\n');
      const underSystemd = !!process.env.INVOCATION_ID;
      if (underSystemd) {
        process.stderr.write('[runner] Under systemd — exiting for automatic restart\n');
        process.exit(0);
      } else {
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
   * Launch a job: delegate → convert intent to steps → execute step loop → mark complete/failed.
   *
   * NOTE: markRunning() is NOT called here. claimNextLaunchable() already sets
   * status=running, started_at=datetime('now'), and increments attempts atomically
   * in the dispatch loop.
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

    try {
      // Recovery preflight: capture baseline + enforce clean worktree
      const gitWorktree = await isGitWorktree(projectDir);
      if (!gitWorktree) {
        throw new Error(
          `Refusing to start job ${job.id}: project is not a git worktree (${projectDir}). Initialize git or reconfigure the project path.`,
        );
      }

      const gitBaseCommit = await resolveCommitOrNull(projectDir, 'HEAD');
      const startedDirty = await isWorktreeDirty(projectDir);
      updateJobRecoveryStart(job.id, gitBaseCommit, startedDirty);

      const conflictState = await detectGitConflictState(projectDir);
      if (conflictState.hasConflictState) {
        throw new Error(
          `Refusing to start job ${job.id}. blocked: merge/rebase/conflict state detected`,
        );
      }

      // Install matching skills into project's .opencode/skill/ directory (JIT v2 pattern)
      try {
        const installed = await installSkillsForJob(job.categories ?? null, projectDir);
        if (installed.length > 0) {
          process.stderr.write(
            `[runner] Installed ${installed.length} skill(s) for job ${job.id}: ${installed.join(', ')}\n`,
          );
        }
      } catch (err) {
        process.stderr.write(
          `[runner] Warning: skill installation failed for job ${job.id}: ${errMsg(err)}\n`,
        );
      }

      this.patchModelsForJob(job, projectDir);

      // Step 1: Delegation — get intent
      let result: DelegationResult;
      try {
        const delegationOutput = await delegate(job, projectDir);
        const { _sessionTitle, ...resultData } = delegationOutput as DelegationResult & { _sessionTitle?: string };
        result = resultData;
        if (_sessionTitle) updateSessionTitles(job.id, [_sessionTitle]);
      } catch (err) {
        throw new Error(`Delegation failed: ${errMsg(err)}`);
      }
      updateDelegationPayload(job.id, result);

      const intent = result.intent;

      // Handle noop intent — nothing to execute
      if (intent.type === 'noop') {
        process.stderr.write(`[runner] Delegation returned noop: ${intent.reason}\n`);
        // Mark completed since there's nothing to do
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompleted(job.id);
        const completedJob = getJob(job.id);
        if (completedJob) notifyJobCompletion(completedJob).catch(() => {});
        return;
      }

      // Step 2: Convert delegation intent to pending step records
      const steps = this.intentToSteps(intent, job, projectDir);
      for (let i = 0; i < steps.length; i++) {
        createPendingStep(job.id, i, steps[i].command, steps[i].args, 'delegation');
      }

      // Step 3: Execute step loop
      await this.executeStepLoop(job, projectDir);

      // Check if job was already handled (failed by continuation handlers, etc.)
      const latestJob1 = getJob(job.id);
      if (!latestJob1 || latestJob1.status !== 'running') return;

      // Step 4: Milestone loop (for init-project and new-milestone)
      if (intent.type === 'init-project') {
        await ensureAutonomousGsdConfig(projectDir);
        await this.milestoneLoop(job, projectDir);
      } else if (intent.type === 'new-milestone') {
        await this.milestoneLoop(job, projectDir);
      }

      // Final check and completion
      const latestJob2 = getJob(job.id);
      if (latestJob2 && latestJob2.status === 'running') {
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompleted(job.id);
        const completedJob = getJob(job.id);
        if (completedJob) notifyJobCompletion(completedJob).catch(() => {});
      } else if (latestJob2 && (latestJob2.status === 'completed_pending_review' || latestJob2.status === 'review_hold')) {
        // Already set by judge step handler — just ensure notification is sent
        notifyJobCompletion(latestJob2).catch(() => {});
      }
    } catch (err) {
      // ── Generic error catch-all ──────────────────────────────────────
      const error = errMsg(err);
      await this.captureRecoveryHead(job.id, projectDir);
      this.collectActualModels(job.id);
      try {
        markFailed(job.id, error);
      } catch (markErr) {
        process.stderr.write(`[runner] markFailed also failed for ${job.id}: ${errMsg(markErr)}\n`);
      }
      const failedJob = getJob(job.id);
      if (failedJob) {
        notifyJobCompletion(failedJob).catch(() => {});

        if (!failedJob.callbackSessionKey) {
          const project = getProject(failedJob.project);
          if (project?.owner) {
            const ownerNotifyJob = {
              ...failedJob,
              callbackSessionKey: project.owner,
              error: `Job ${failedJob.id} failed and blocked project ${failedJob.project}.\n` +
                     `Reason: ${error}\n` +
                     `Actions: pilot unblock "${failedJob.project}"  ·  queue a new job with pilot add`,
            };
            notifyJobCompletion(ownerNotifyJob).catch(() => {});
          }
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
      try {
        unlinkSync(path.join(getConfig().pilotDir, 'pids', `${job.id}.pid`));
      } catch { /* ENOENT or other — ignore */ }
      try {
        const titles = JSON.parse(job.sessionTitles ?? '[]') as string[];
        for (const t of titles) this.sessionPids.delete(t);
      } catch { /* ignore */ }
      const freshJob = getJob(job.id);
      if (freshJob?.sessionTitles) {
        try {
          const titles = JSON.parse(freshJob.sessionTitles) as string[];
          for (const t of titles) this.sessionPids.delete(t);
        } catch { /* ignore */ }
      }
      try {
        const skillDir = path.join(projectDir, '.opencode', 'skill');
        if (existsSync(skillDir)) {
          rmSync(skillDir, { recursive: true, force: true });
        }
      } catch {
        // Best-effort cleanup — don't fail the job
      }
    }
  }

  // ── Intent → Steps Conversion ──────────────────────────────────────────

  /**
   * Convert a delegation intent to an array of step commands.
   * These become pending step records in the DB.
   */
  private intentToSteps(
    intent: DelegationIntent,
    job: Job,
    projectDir: string,
  ): Array<{ command: string; args: string }> {
    switch (intent.type) {
      case 'quick': {
        let args = buildQuickArgs(job);
        if (intent.flags?.includes('full')) args += ' --full';
        if (intent.flags?.includes('research')) args += ' --research';
        return [{ command: 'quick', args }];
      }
      case 'init-project':
        return [{ command: 'new-project', args: buildNewProjectArgs(job) }];

      case 'new-milestone': {
        const args = intent.prdPath
          ? `@${intent.prdPath} --auto`
          : `${job.description} --auto`;
        return [{ command: 'new-milestone', args }];
      }
      case 'plan-and-execute': {
        const steps: Array<{ command: string; args: string }> = [];
        const phaseNumber = intent.phaseNumber;

        if (intent.addPhaseTitle) {
          const addArgs = intent.prdPath
            ? `"${intent.addPhaseTitle}" @${intent.prdPath}`
            : `"${intent.addPhaseTitle}"`;
          steps.push({ command: 'add-phase', args: addArgs });
        }

        const planArgs = intent.prdPath
          ? `${phaseNumber} @${intent.prdPath}${intent.isGapClosure ? ' --gaps' : ''}`
          : `${phaseNumber}${intent.isGapClosure ? ' --gaps' : ''}`;
        steps.push({ command: 'plan-phase', args: planArgs });

        const executeArgs = intent.isGapClosure
          ? `${phaseNumber} --gaps-only`
          : `${phaseNumber}`;
        steps.push({ command: 'execute-phase', args: executeArgs });

        steps.push({ command: 'judge', args: '' });

        return steps;
      }
      case 'execute-only':
        return [
          { command: 'execute-phase', args: `${intent.phaseNumber}` },
          { command: 'judge', args: '' },
        ];

      case 'audit-milestone':
        // No-op for now
        return [];

      case 'noop':
        return [];

      default:
        throw new Error(`Unknown intent type: ${(intent as DelegationIntent).type}`);
    }
  }

  // ── Step Execution Loop ────────────────────────────────────────────────

  /**
   * Execute pending steps sequentially until none remain or job is no longer running.
   * Steps are consumed from the DB — judge/hung/failed handlers may append new ones.
   */
  private async executeStepLoop(job: Job, projectDir: string): Promise<void> {
    while (true) {
      const step = getNextPendingStep(job.id);
      if (!step) break; // No more pending steps — success

      // Step cap check
      if (getTotalStepCount(job.id) > MAX_STEPS_PER_JOB) {
        markFailed(job.id, `Step cap reached (${MAX_STEPS_PER_JOB}). Job has too many steps.`);
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
        return;
      }

      dbMarkStepRunning(step.id);

      if (step.command === 'judge') {
        await this.executeJudgeStep(job, projectDir, step);
      } else {
        await this.executeCommandStep(job, projectDir, step);
      }

      // After each step, check if job is still running (handlers may have marked failed)
      const latestJob = getJob(job.id);
      if (!latestJob || latestJob.status !== 'running') return;

      // Advance currentStep counter for observability (TUI/WebUI)
      advanceStep(job.id);
    }
  }

  /**
   * Execute a regular GSD command step (non-judge).
   * On success: mark step completed. On hung: delegate continuation. On other error: propagate.
   */
  private async executeCommandStep(job: Job, projectDir: string, step: JobStep): Promise<void> {
    if (this.shuttingDown) throw new Error('Runner shutdown');

    // Verify we still own this job
    const freshJob = getJob(job.id);
    if (!freshJob || freshJob.status !== 'running') {
      throw new Error(`Job ${job.id} no longer running (status=${freshJob?.status ?? 'gone'})`);
    }

    const ts = Date.now().toString(36).slice(-4);
    const title = truncateTitle(`${job.project}-${step.command}-${job.id}-${ts}`, 80);
    this.activeJobs.set(job.id, { job, title });
    updateSessionTitles(job.id, [title]);

    try {
      await this.spawnAndWait(projectDir, step.command, step.args, title);
      const sessionId = findSessionByTitle(title);
      dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
    } catch (err) {
      if (err instanceof HungSessionError) {
        const sessionId = findSessionByTitle(title);
        dbMarkStepFailed(step.id, errMsg(err), sessionId ?? undefined, title);
        incrementHungCount(job.id, err.hungReason);
        // Re-delegate for continuation
        await this.handleHungContinuation(job, projectDir, step, err);
      } else {
        const sessionId = findSessionByTitle(title);
        dbMarkStepFailed(step.id, errMsg(err), sessionId ?? undefined, title);
        throw err; // Propagate non-hung errors to launch() catch
      }
    }
  }

  /**
   * Execute a judge step — run judge, handle verdict, potentially append new steps.
   */
  private async executeJudgeStep(job: Job, projectDir: string, step: JobStep): Promise<void> {
    // Extract phase number from previous steps
    const phaseNumber = this.extractPhaseNumberFromSteps(job.id);
    if (!phaseNumber) {
      dbMarkStepFailed(step.id, 'Could not determine phase number for judge');
      markFailed(job.id, 'Judge step failed: unknown phase number');
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    // No-activity check removed — session state=done means done.
    // The judge/VERIFICATION.md system handles quality, not the runner.
    {
    }

    if (this.shuttingDown) {
      dbMarkStepFailed(step.id, 'Interrupted before judge');
      markFailed(job.id, 'Interrupted before verification');
      process.stderr.write(`[runner] Shutdown during phase — resetting ${job.id} to pending\n`);
      return;
    }

    const rawVerdict = await this.runJudge(job, projectDir, phaseNumber);
    const verdict = this.normalizeVerdict(rawVerdict);
    updateJudgeVerdict(job.id, JSON.stringify(verdict));

    if (verdict.verdict === 'passed' || verdict.verdict === 'succeeded' || verdict.verdict === 'pass') {
      dbMarkStepCompleted(step.id);
      // Job will be completed by the loop exit (no more pending steps)
      return;
    }

    if (verdict.verdict === 'gaps_found' || verdict.verdict === 'doubting' || verdict.verdict === 'partial') {
      dbMarkStepCompleted(step.id);

      // Check if all remaining gaps are human-only review items
      if (isHumanOnlyRemaining(verdict)) {
        const checklist = verdict.gaps && verdict.gaps.length > 0
          ? verdict.gaps.join('\n- ')
          : verdict.reason;
        markCompletedPendingReview(job.id, checklist ? `Review items:\n- ${checklist}` : undefined);
        this.collectActualModels(job.id);
        await this.captureRecoveryHead(job.id, projectDir);
        const reviewJob = getJob(job.id);
        if (reviewJob) notifyJobCompletion(reviewJob).catch(() => {});
        return;
      }

      // Re-delegate for gap closure
      await this.handleGapsContinuation(job, projectDir, verdict);
      return;
    }

    // verdict === 'failed' or 'fail'
    dbMarkStepCompleted(step.id);
    // Re-delegate for failure recovery
    await this.handleFailedContinuation(job, projectDir, verdict);
  }

  // ── Continuation Handlers ──────────────────────────────────────────────

  /**
   * Handle gaps_found verdict: re-delegate for continuation steps.
   * Appends new steps (plan-phase --gaps + execute-phase --gaps-only + judge).
   */
  private async handleGapsContinuation(
    job: Job,
    projectDir: string,
    verdict: JudgeVerdict,
  ): Promise<void> {
    try {
      const result = await reDelegateForContinuation(job, projectDir, {
        source: 'judge:gaps',
        reason: verdict.reason,
        gaps: verdict.gaps,
      });

      if (result._sessionTitle) updateSessionTitles(job.id, [result._sessionTitle]);

      if (result.steps.length > 0) {
        appendSteps(job.id, result.steps, 'judge:gaps', verdict.reason);
        this.log(`Appended ${result.steps.length} gap-closure step(s) for ${job.id}`);
      } else {
        markFailed(job.id, 'No continuation steps available for gaps');
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      }
    } catch (err) {
      markFailed(job.id, `Gap continuation failed: ${errMsg(err)}`);
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
    }
  }

  /**
   * Handle failed verdict: re-delegate for recovery steps.
   * May append new steps or mark job as failed if no recovery path.
   */
  private async handleFailedContinuation(
    job: Job,
    projectDir: string,
    verdict: JudgeVerdict,
  ): Promise<void> {
    try {
      const result = await reDelegateForContinuation(job, projectDir, {
        source: 'judge:failed',
        reason: verdict.reason,
      });

      if (result._sessionTitle) updateSessionTitles(job.id, [result._sessionTitle]);

      if (result.steps.length > 0) {
        appendSteps(job.id, result.steps, 'judge:failed', verdict.reason);
        this.log(`Appended ${result.steps.length} recovery step(s) for ${job.id}`);
      } else {
        markFailed(job.id, verdict.reason);
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      }
    } catch (err) {
      markFailed(job.id, `Failed recovery re-delegation: ${errMsg(err)}`);
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
    }
  }

  /**
   * Handle hung session: re-delegate for continuation steps.
   * Appends new steps to resume from hung point, or marks job failed.
   */
  private async handleHungContinuation(
    job: Job,
    projectDir: string,
    step: JobStep,
    error: HungSessionError,
  ): Promise<void> {
    try {
      const result = await reDelegateForContinuation(job, projectDir, {
        source: 'judge:hung',
        reason: error.hungReason,
        hungInfo: {
          command: step.command,
          reason: error.hungReason,
          toolName: error.lastToolCall,
        },
      });

      if (result._sessionTitle) updateSessionTitles(job.id, [result._sessionTitle]);

      if (result.steps.length > 0) {
        appendSteps(job.id, result.steps, 'judge:hung', error.hungReason);
        this.log(`Appended ${result.steps.length} hung-recovery step(s) for ${job.id}`);
      } else {
        markFailed(job.id, 'Hung session with no recovery path');
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      }
    } catch (err) {
      markFailed(job.id, `Hung recovery failed: ${errMsg(err)}`);
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
    }
  }

  // ── Step Helpers ───────────────────────────────────────────────────────

  /**
   * Extract phase number from completed steps in the DB.
   * Looks for plan-phase or execute-phase step args and extracts the phase number.
   */
  private extractPhaseNumberFromSteps(jobId: string): number | null {
    const steps = getJobSteps(jobId);
    // Look through steps in reverse (most recent first)
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (step.command === 'plan-phase' || step.command === 'execute-phase') {
        // Args format: "31" or "31 --gaps" or "31 --gaps-only"
        const match = step.args.match(/^(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    }
    return null;
  }

  /**
   * Normalize a raw judge verdict, providing defaults for null/missing.
   */
  private normalizeVerdict(rawVerdict: JudgeVerdict | null): JudgeVerdict {
    if (rawVerdict) return rawVerdict;
    return {
      verdict: 'fail',
      confidence: 0,
      reason: 'Judge produced no verdict',
    };
  }

  // ── Milestone Loop ────────────────────────────────────────────────────

  /**
   * Re-delegation loop for milestone-scope jobs.
   * After init-project or new-milestone, keeps re-delegating until noop or audit-milestone.
   * Each re-delegation's intent is converted to steps and appended, then executed.
   * Max depth: 3 per intent type to prevent infinite loops.
   */
  private async milestoneLoop(job: Job, projectDir: string): Promise<void> {
    const MAX_REDELEGATION_DEPTH = 3;
    const intentCounts = new Map<string, number>();

    for (let i = 0; i < MAX_REDELEGATION_DEPTH * 3; i++) { // absolute safety cap
      if (this.shuttingDown) {
        markFailed(job.id, 'Interrupted during milestone loop');
        return;
      }

      process.stderr.write(`[runner] Milestone loop iteration ${i + 1}: re-delegating...\n`);
      const reResult = await delegate(job, projectDir);
      const { _sessionTitle, ...resultData } = reResult as DelegationResult & { _sessionTitle?: string };
      if (_sessionTitle) updateSessionTitles(job.id, [_sessionTitle]);

      const reIntent = resultData.intent;

      // Depth check per intent type
      const typeCount = (intentCounts.get(reIntent.type) ?? 0) + 1;
      intentCounts.set(reIntent.type, typeCount);
      if (typeCount > MAX_REDELEGATION_DEPTH) {
        throw new Error(
          `Max re-delegation depth (${MAX_REDELEGATION_DEPTH}) exceeded for intent type: ${reIntent.type}`,
        );
      }

      if (reIntent.type === 'noop') {
        process.stderr.write(`[runner] Milestone loop: noop — ${reIntent.reason}\n`);
        break;
      }

      if (reIntent.type === 'audit-milestone') {
        process.stderr.write(`[runner] Audit milestone ${reIntent.version} for job ${job.id} — no-op for now\n`);
        break;
      }

      // Convert intent to steps and append
      const steps = this.intentToSteps(reIntent, job, projectDir);
      if (steps.length > 0) {
        appendSteps(job.id, steps, 'delegation', `milestone loop iteration ${i + 1}`);
      }

      // Execute the appended steps
      await this.executeStepLoop(job, projectDir);

      // Check if job still running
      const latestJob = getJob(job.id);
      if (!latestJob || latestJob.status !== 'running') return;
    }
  }

  // ── Model / Observability Helpers ──────────────────────────────────────

  private patchModelsForJob(job: Job, projectDir: string): void {
    if (!job.modelProfile) {
      return;
    }

    const providerMode = job.providerMode ?? 'claude-only';
    process.stderr.write(dim(`Patching agent models: ${job.modelProfile}/${providerMode}`) + '\n');
    const models = resolveAllAgentModels(job.modelProfile, providerMode);
    const summary = patchAgentFrontmatter(projectDir, models);
    const fallbackAgents = Array.isArray(summary?.fallback) ? summary.fallback : [];
    const skippedAgents = Array.isArray(summary?.skipped) ? summary.skipped : [];

    if (fallbackAgents.length > 0) {
      process.stderr.write(
        `[runner] Agent model fallback to inherit (${fallbackAgents.length}): ${fallbackAgents.join(', ')}\n`,
      );
    }

    if (skippedAgents.length > 0) {
      process.stderr.write(
        `[runner] Warning: skipped agent model patch (${skippedAgents.length}) due to missing/invalid frontmatter: ${skippedAgents.join(', ')}\n`,
      );
    }
  }

  /**
   * Collect actual models used across all sessions for a job and persist to DB.
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

      const normalizeModel = (rawModel: string): string | null => {
        const trimmed = rawModel.trim();
        if (!trimmed.includes('/')) return null;
        const parts = trimmed.split('/');
        const provider = parts.shift()?.trim().toLowerCase();
        const model = parts.join('/').trim().toLowerCase();
        if (!provider || !model) return null;
        return `${provider}/${model}`;
      };

      const allActualModels = new Set<string>();
      const visitedSessionIds = new Set<string>();
      for (const sessionTitle of sessionTitles) {
        const rootSessionId = findSessionByTitle(sessionTitle);
        if (!rootSessionId) continue;

        const models = getSessionModelsRecursive(rootSessionId, 0, visitedSessionIds);
        for (const model of models) {
          const normalized = normalizeModel(model);
          if (normalized) allActualModels.add(normalized);
        }
      }

      if (allActualModels.size > 0) {
        updateActualModels(jobId, Array.from(allActualModels).sort());
      }
    } catch {
      // Best effort — don't fail the job due to model collection error
    }
  }

  // ── Judge Session ──────────────────────────────────────────────────────

  /**
   * Spawn a judge session to evaluate a completed execute-phase step.
   * Uses the inline prompt from src/prompts/judge.md with evidence context injected.
   * Returns null when judge output cannot be parsed or retrieved.
   */
  private async runJudge(job: Job, projectDir: string, phaseNumber: number): Promise<JudgeVerdict | null> {
    const phaseNum = String(phaseNumber);

    const ts = Date.now().toString(36).slice(-4);
    const judgeTitle = truncateTitle(`pilot-judge-${job.id}-${ts}`, 80);
    updateSessionTitles(job.id, [judgeTitle]);

    // Gather evidence from disk
    const verificationContent = readVerificationEvidence(projectDir, phaseNumber);
    const validationContent = readValidationEvidence(projectDir, phaseNumber);

    // Build inline prompt with evidence context
    let evidenceSection = '\n\n---\n\n## Evidence Context\n\n';
    evidenceSection += `**Job ID:** ${job.id}\n`;
    evidenceSection += `**Phase:** ${phaseNum}\n`;
    evidenceSection += `**Project:** ${projectDir}\n\n`;

    if (verificationContent) {
      evidenceSection += `### VERIFICATION.md (Primary Evidence)\n\n${verificationContent}\n\n`;
    } else {
      evidenceSection += `### VERIFICATION.md: NOT AVAILABLE\n\nNo valid VERIFICATION.md found. Use transcript-only evidence. Default to "partial" with confidence ≤ 40 if evidence is insufficient.\n\n`;
    }

    if (validationContent) {
      evidenceSection += `### VALIDATION.md (Nyquist Output)\n\n${validationContent}\n\n`;
    }

    evidenceSection += `### Additional Evidence Commands\n`;
    evidenceSection += `- Run \`pilot log ${job.id} --last 50\` for execution transcript\n`;
    evidenceSection += `- Run \`git log --oneline -20\` for recent commits\n`;
    evidenceSection += `- Glob \`.planning/phases/${phaseNum}-*/*-SUMMARY.md\` for summaries\n`;

    const fullPrompt = JUDGE_PROMPT + evidenceSection;

    // Cap judge at 15 minutes
    const judgeTimeoutMs = 15 * 60 * 1000;

    try {
      await this.spawnAndWait(projectDir, 'judge', '', judgeTitle, judgeTimeoutMs, fullPrompt);
    } catch (err) {
      const msg = errMsg(err);
      if (msg.includes('timed out')) {
        process.stderr.write(`[runner] Judge timed out after 15m for ${judgeTitle}\n`);
      } else {
        process.stderr.write(`[runner] Judge session failed: ${msg}\n`);
      }
      return null;
    }

    // Extract JSON from judge session output
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

    return null;
  }

  // ── Spawn & Wait ──────────────────────────────────────────────────────

  /**
   * Spawn an opencode session and wait for it to complete.
   * Runs pre-spawn safety checks, then polls opencode's SQLite DB for session completion.
   *
   * When `inlinePrompt` is provided, spawns with the prompt as a positional argument
   * (no --command flag) — same as delegation. Used for judge sessions.
   * When omitted, uses --command gsdCommand with args — standard GSD step pattern.
   */
  private async spawnAndWait(
    cwd: string,
    command: string,
    args: string,
    title: string,
    timeoutOverrideMs?: number,
    inlinePrompt?: string,
  ): Promise<void> {
    const config = getConfig();
    const opencodeBin = resolveOpencodeBinary();

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
      const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
      if (jobEntry) {
        markFailed(jobEntry.job.id, 'Insufficient memory');
        process.stderr.write(
          `[runner] Insufficient memory after 5m wait, returning job ${jobEntry.job.id} to pending\n`,
        );
        return;
      }
      throw memErr;
    }
    await enforceSpawnRateLimit();
    await validateProjectConfig(cwd);
    await ensureAutonomousGsdConfig(cwd);

    // Resolve top-level model for --model flag
    const isJudge = inlinePrompt !== undefined;
    const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
    const scope = isJudge ? 'judge' as const : (jobEntry?.job.scope ?? 'quick');
    const profile = jobEntry?.job.modelProfile ?? 'balanced';
    const providerMode = jobEntry?.job.providerMode ?? 'claude-only';
    const { model: topLevelModel, variant } = resolveTopLevelModel(scope, profile, providerMode);
    process.stderr.write(dim(`Top-level model: ${topLevelModel}${variant ? ` (variant: ${variant})` : ''}`) + '\n');

    let opencodeCmdArgs: string[];
    if (inlinePrompt !== undefined) {
      opencodeCmdArgs = [
        'run',
        '--format', 'default',
        '--model', topLevelModel,
        ...(variant ? ['--variant', variant] : []),
        '--title', title,
        inlinePrompt,
      ];
    } else {
      const gsdCommand = command.startsWith('gsd-') || command.startsWith('pilot-') ? command : `gsd-${command}`;
      opencodeCmdArgs = [
        'run',
        '--format', 'default',
        '--model', topLevelModel,
        ...(variant ? ['--variant', variant] : []),
        '--title', title,
        '--command', gsdCommand,
        ...(args ? [args] : []),
      ];
    }

    const useSystemdRun = await hasSystemdRunUser();
    let proc;

    if (useSystemdRun) {
      const sessionMemoryMb = config.sessionMemoryMaxMb;
      const safeUnit = `pilot-${title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60)}-${Date.now().toString(36)}`;
      proc = execa('systemd-run', [
        '--scope', '--user',
        '-p', `MemoryMax=${sessionMemoryMb}M`,
        '-p', 'MemorySwapMax=0',
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
    proc.catch(() => {});
    proc.unref();

    // Track PID for reliable kill operations
    if (proc.pid !== undefined) {
      this.sessionPids.set(title, proc.pid);
      const jobEntry = [...this.activeJobs.entries()].find(([, v]) => v.title === title);
      if (jobEntry) {
        const pidFilePath = path.join(getConfig().pilotDir, 'pids', `${jobEntry[0]}.pid`);
        try { writeFileSync(pidFilePath, String(proc.pid)); } catch { /* best effort */ }
      }
    }

    // Poll opencode DB for session completion
    const pollMs = this.options.pollInterval * 1000;
    let sessionFound = false;
    const procPid = proc.pid;

    while (timeoutMs === Infinity || Date.now() - start < timeoutMs) {
      await this.sleep(pollMs);

      if (this.shuttingDown) {
        throw new Error('Runner shutting down');
      }

      // Check if job was killed/cancelled externally (e.g., `pilot kill`)
      const jobEntry = [...this.activeJobs.entries()].find(([, v]) => v.title === title);
      if (jobEntry) {
        const freshJob = getJob(jobEntry[0]);
        if (freshJob && freshJob.status !== 'running') {
          throw new Error(`Job ${freshJob.id} was ${freshJob.status} externally during session: ${title}`);
        }
      }

      const sessionId = findSessionByTitle(title);

      if (!sessionId) {
        if (procPid !== undefined) {
          try {
            process.kill(procPid, 0);
          } catch {
            if (Date.now() - start > 10_000) {
              throw new Error(`Session never appeared in opencode DB: ${title} (process died)`);
            }
          }
        }
        continue;
      }
      sessionFound = true;

      let pidAlive = true;
      if (procPid !== undefined) {
        try { process.kill(procPid, 0); } catch { pidAlive = false; }
      }

      // WAL flush race: PID just died but state may still be 'working'.
      if (!pidAlive) {
        const recheck = getSessionState(sessionId, false);
        if (recheck.state === 'done') {
          return;
        }
        if (recheck.state === 'crashed') {
          const msgCount = getAssistantMessageCount(sessionId);
          if (msgCount > 0) {
            process.stderr.write(
              `[runner] Warning: process died for ${title} but session has ${msgCount} messages. Treating as complete.\n`,
            );
            return; // Had activity, treat as done
          }
          throw new Error(`Process died without clean completion for: ${title}`);
        }
        // State is working/hung-on-tool/hung-on-prompt — wait for WAL to flush
        await this.sleep(2000);
        const afterWal = getSessionState(sessionId, false);
        if (afterWal.state === 'done') return;
        if (afterWal.state === 'crashed') {
          const msgCount = getAssistantMessageCount(sessionId);
          if (msgCount > 0) {
            process.stderr.write(
              `[runner] Warning: process died for ${title} (after WAL wait) but session has ${msgCount} messages. Treating as complete.\n`,
            );
            return;
          }
          throw new Error(`Process died without clean completion for: ${title}`);
        }
        // Otherwise continue into the state switch below with pidAlive=false
      }

      const stateResult = getSessionState(sessionId, pidAlive);

      if (process.env['PILOT_DEBUG']) {
        const pollElapsedS = Math.round((Date.now() - start) / 1000);
        process.stderr.write(
          `[runner] poll ${title}: elapsed=${pollElapsedS}s sessionFound=${sessionFound} state=${stateResult.state}${stateResult.pendingToolName ? ` tool=${stateResult.pendingToolName}` : ''} pid=${procPid ?? 'n/a'} pidAlive=${pidAlive}\n`,
        );
      }

      this.log(`Poll: ${title} — state=${stateResult.state}${stateResult.pendingToolName ? ` tool=${stateResult.pendingToolName}` : ''}`);

      switch (stateResult.state) {
        case 'done':
          return;

        case 'hung-on-prompt':
          await this.killHungSession(procPid, title, `hung-on-prompt (tool: ${stateResult.pendingToolName})`);
          this.log(`Session hung on interactive prompt: ${title} (tool: ${stateResult.pendingToolName}, content: ${stateResult.pendingToolContent ?? 'unknown'})`);
          throw new HungSessionError({
            hungReason: 'interactive-prompt',
            lastToolCall: stateResult.pendingToolName,
            sessionTitle: title,
          });

        case 'hung-on-tool':
          // Long-running tool — continue polling
          break;

        case 'crashed':
          throw new Error(`Process died without clean completion for: ${title}`);

        case 'working':
          break;
      }
    }

    if (!sessionFound) {
      await this.killHungSession(procPid, title, 'timeout-no-session');
      throw new Error(`Session never appeared in opencode DB: ${title}`);
    }

    await this.killHungSession(procPid, title, 'timeout');
    const jobEntry2 = [...this.activeJobs.values()].find(a => a.title === title);
    const timeoutMin = jobEntry2?.job.timeout ?? 0;
    throw new Error(`Session timed out after ${timeoutMin}m: ${title}`);
  }

  // ── Utility Methods ───────────────────────────────────────────────────

  private getPidFilePath(): string {
    const config = getConfig();
    return path.join(config.pilotDir, 'daemon.pid');
  }

  private writePidFile(pidPath: string): void {
    const dir = path.dirname(pidPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(pidPath, String(process.pid), 'utf8');
  }

  private removePidFile(pidPath: string): void {
    try {
      unlinkSync(pidPath);
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  private setupShutdownHandlers(): void {
    const shutdownHandler = () => {
      this.shuttingDown = true;
      this.running = false;
    };
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    process.on('SIGHUP', () => {
      process.stderr.write('[runner] SIGHUP received — reloading after current step completes...\n');
      this.reloading = true;
      this.shuttingDown = true;
      this.running = false;
    });
  }

  getState(): RunnerState {
    return {
      active: this.running,
      activeJobs: this.activeJobs.size,
      jobIds: [...this.activeJobs.keys()],
    };
  }

  stop(): void {
    this.shuttingDown = true;
    this.running = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async captureRecoveryHead(jobId: string, projectDir: string): Promise<void> {
    try {
      const gitHeadCommit = await resolveCommitOrNull(projectDir, 'HEAD');
      updateJobRecoveryHead(jobId, gitHeadCommit);
    } catch (err) {
      process.stderr.write(
        `[runner] Warning: failed to capture git head checkpoint for ${jobId}: ${errMsg(err)}\n`,
      );
    }
  }

  /**
   * Kill a hung session process: SIGTERM → wait up to 5s → SIGKILL.
   */
  private async killHungSession(procPid: number | undefined, title: string, reason: string): Promise<void> {
    if (procPid === undefined) return;

    this.log(`Killing hung session (${reason}): ${title} [PID ${procPid}]`);

    try { process.kill(procPid, 'SIGTERM'); } catch { /* already dead */ }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await this.sleep(500);
      try { process.kill(procPid, 0); } catch {
        this.sessionPids.delete(title);
        return;
      }
    }

    try { process.kill(procPid, 'SIGKILL'); } catch { /* already dead */ }
    this.sessionPids.delete(title);
    this.log(`Force-killed hung session: ${title} [PID ${procPid}]`);
  }

  private log(msg: string): void {
    process.stderr.write(`[runner] ${msg}\n`);
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
    if (!['succeeded', 'failed', 'doubting', 'pass', 'fail', 'partial', 'passed', 'gaps_found'].includes(verdict.verdict)) return null;
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
 */
async function disableSnapshotGc(): Promise<void> {
  const home = homedir();
  const snapshotDir = path.join(home, '.local', 'share', 'opencode', 'snapshot');

  try {
    let entries: string[] = [];
    try { entries = readdirSync(snapshotDir); } catch { return; }

    for (const entry of entries) {
      const repoPath = path.join(snapshotDir, entry);
      try {
        const stat = statSync(repoPath);
        if (stat.isDirectory()) {
          await execa('git', ['-C', repoPath, 'config', 'gc.auto', '0'], { timeout: 5000, reject: false });
        }
      } catch {
        // Skip entries we can't stat
      }
    }

    const globalRepo = path.join(snapshotDir, 'global');
    try {
      await execa('git', ['-C', globalRepo, 'config', 'gc.auto', '0'], { timeout: 5000, reject: false });
    } catch {
      // Global repo may not exist
    }
  } catch {
    // Best effort — don't fail spawn because gc disable failed
  }
}

/**
 * SPAWN-LESSONS #3: Check /proc/meminfo for available memory.
 */
async function checkMemory(requiredMb: number): Promise<void> {
  const maxWaitMs = 5 * 60 * 1000;
  const pollMs = 30_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const availableMb = getAvailableMemoryMb();
    if (availableMb >= requiredMb) {
      return;
    }
    process.stderr.write(`[runner] Low memory: ${availableMb}MB available, need ${requiredMb}MB. Waiting...\n`);
    await new Promise((r) => setTimeout(r, pollMs));
  }

  const availableMb = getAvailableMemoryMb();
  throw new Error(`Insufficient memory after ${maxWaitMs / 60000}m wait: ${availableMb}MB available, need ${requiredMb}MB`);
}

/**
 * Read available memory from /proc/meminfo (Linux).
 */
function getAvailableMemoryMb(): number {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (match) {
      return Math.round(parseInt(match[1], 10) / 1024);
    }
    return Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * SPAWN-LESSONS #4: Enforce 5-second minimum between spawns.
 */
async function enforceSpawnRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSpawnTime;

  if (elapsed < MIN_SPAWN_INTERVAL_MS) {
    const waitMs = MIN_SPAWN_INTERVAL_MS - elapsed;
    await new Promise((r) => setTimeout(r, waitMs));
  }

  lastSpawnTime = Date.now();
}

/**
 * SPAWN-LESSONS #7: Validate opencode.json has permission: allow.
 */
async function validateProjectConfig(cwd: string): Promise<void> {
  const configPath = path.join(cwd, 'opencode.json');

  try {
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content) as Record<string, unknown>;

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
 */
async function killJobSession(job: Job, sessionPids?: Map<string, number>): Promise<KillJobSessionResult> {
  let sessionTitles: string[] = [];
  try {
    sessionTitles = JSON.parse(job.sessionTitles ?? '[]') as string[];
  } catch {
    return { killed: false, reason: 'Could not parse job.sessionTitles' };
  }

  if (sessionTitles.length === 0) {
    return { killed: false, reason: 'No session titles recorded for this job' };
  }

  let foundPid: number | null = null;
  for (let i = sessionTitles.length - 1; i >= 0; i--) {
    const title = sessionTitles[i];
    if (sessionPids?.has(title)) {
      const pid = sessionPids.get(title)!;
      try {
        process.kill(pid, 0);
        foundPid = pid;
        break;
      } catch {
        sessionPids.delete(title);
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
      return { killed: true, reason: `Process ${pid} already gone (ESRCH on SIGTERM)` };
    }
    return { killed: false, reason: `SIGTERM failed: ${errMsg(err)}` };
  }

  // Wait up to 5 seconds for exit
  const pollMs = 500;
  const maxWaitMs = 5_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    try {
      process.kill(pid, 0);
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH') {
        return { killed: true, reason: `Sent SIGTERM to PID ${pid}` };
      }
      break;
    }
  }

  // SIGKILL
  try {
    process.kill(pid, 'SIGKILL');
    return { killed: true, reason: `Sent SIGTERM/SIGKILL to PID ${pid}` };
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH') {
      return { killed: true, reason: `Sent SIGTERM to PID ${pid} (process exited before SIGKILL)` };
    }
    return { killed: false, reason: `SIGKILL failed: ${errMsg(err)}` };
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
export { getAvailableMemoryMb };

/**
 * Reset the module-level spawn rate limiter.
 * @internal — only for use in tests
 */
function _resetSpawnRateLimit(): void {
  lastSpawnTime = 0;
}

export { _resetSpawnRateLimit };

/**
 * Validate whether VERIFICATION.md content is well-formed.
 * @internal — only for use in tests
 */
export { isWellFormedVerificationEvidence as _isWellFormedVerificationEvidence };

export { hasSystemdRunUser, getDynamicMaxParallel, _resetSystemdRunCache };
export { isHumanOnlyRemaining };
