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
  updateJobRuntimeSkillSnapshot,
  incrementHungCount,
  getJobSteps,
  createPendingStep,
  getNextPendingStep,
  markStepRunning as dbMarkStepRunning,
  markStepCompleted as dbMarkStepCompleted,
  markStepSkipped as dbMarkStepSkipped,
  markStepFailed as dbMarkStepFailed,
  cancelPendingSteps,
  getTotalStepCount,
  getPendingStepCount,
  appendSteps,
  markCompletedPendingReview,
  markReviewHold,
  resumeFromReviewHold,
  getResumedReviewHoldJobs,
  clearResumedFlag,
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
  cleanupInstalledSkills,
  installSkillsForJob,
} from './skills.js';
import {
  applyRuntimeAgentSkillsPatch,
  restoreRuntimeAgentSkillsPatch,
  type RuntimeAgentSkillsPatchHandle,
} from './runtime-agent-skills.js';
import {
  extractPhaseNumberFromStepArgs,
  findExistingUiSpec,
  isUiReviewEligible,
  resolveUiArtifactOutcome,
} from './ui-review.js';
import {
  deriveVerificationRouting,
  readLatestVerificationArtifact,
} from './verification-artifact.js';
import { notifyJobCompletion } from './callback.js';
import {
  openDb,
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
import { MAX_STEPS_PER_JOB, MAX_CONTINUATION_CYCLES, MIN_CONTINUATION_BUDGET } from './types.js';
import { buildDebugPrompt, parseDebugOutcome, buildContinuationPrompt, type DebugOutcome } from './debug-lane.js';

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
  verificationStatus?: string;
  actionableGapCount?: number;
  humanVerificationCount?: number;
  routingDecision?: string;
  routingReason?: string;
  artifactPath?: string | null;
  artifactAvailable?: boolean;
  unavailableReason?: string | null;
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
/**
 * Check if a project has native gsd-fast command installed.
 * Synchronous — runs once per fast job, not in a hot loop.
 */
function hasNativeFast(projectDir: string): boolean {
  return existsSync(path.join(projectDir, '.opencode', 'command', 'gsd-fast.md'));
}

/**
 * Check if a ui-phase command has completed its work by producing the UI-SPEC artifact.
 * Returns true when `command` is 'ui-phase' AND a matching UI-SPEC.md exists on disk.
 */
function isUiPhaseArtifactComplete(command: string, projectDir: string, phaseNumber: number): boolean {
  return command === 'ui-phase' && resolveUiArtifactOutcome(command, String(phaseNumber), projectDir) === 'completed';
}

/**
 * Determine whether a HungSessionError for a step should result in 'completed'
 * (artifact recovery) or 'failed' (standard hung handling).
 *
 * Extracted from executeCommandStep's HungSessionError catch block for testability.
 * Returns 'completed' only when: command is 'ui-phase' AND phase number can be parsed
 * from args AND the UI-SPEC artifact exists on disk.
 */
function resolveHungUiPhaseOutcome(
  command: string,
  args: string,
  projectDir: string,
): 'completed' | 'skipped' | 'failed' {
  return resolveUiArtifactOutcome(command, args, projectDir);
}

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

function formatHumanVerificationChecklist(snapshot: ReturnType<typeof readLatestVerificationArtifact>, routingReason: string): string {
  const lines = [
    `Structured verification status: ${snapshot.verificationStatus}`,
    `Actionable gaps remaining: ${snapshot.gaps.filter((gap) => gap.actionable).length}`,
    `Human verification checks remaining: ${snapshot.humanVerification.length}`,
    `Routing basis: ${routingReason}`,
  ];

  if (snapshot.humanVerification.length > 0) {
    lines.push('', 'Human verification items:');
    for (const item of snapshot.humanVerification) {
      const parts = [item.test, item.expected, item.whyHuman].filter((part): part is string => Boolean(part));
      if (parts.length > 0) {
        lines.push(`- ${parts.join(' — ')}`);
      }
    }
  }

  return lines.join('\n');
}

function formatVerificationHoldReason(routingReason: string, unavailableReason: string | null, artifactPath: string | null): string {
  const parts = [
    `Structured verification fallback: ${routingReason}`,
    unavailableReason,
    artifactPath,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' | ');
}

/**
 * Detect whether a completed opencode session ended at a GSD checkpoint.
 * Heuristic: queries the opencode DB's part table for the last assistant text
 * message containing "CHECKPOINT" (case-insensitive).
 *
 * GSD executors output "## CHECKPOINT REACHED" or similar when hitting a
 * checkpoint:human-verify / checkpoint:decision / checkpoint:human-action task.
 *
 * Returns { isCheckpoint: true, reason: <excerpt> } when detected,
 * or { isCheckpoint: false, reason: '' } otherwise.
 *
 * Exported for direct unit testing.
 */
export function detectCheckpointPause(sessionId: string | null): { isCheckpoint: boolean; reason: string } {
  if (!sessionId) return { isCheckpoint: false, reason: '' };

  const db = openDb();
  if (!db) return { isCheckpoint: false, reason: '' };

  try {
    const checkpointPart = db.prepare(`
      SELECT json_extract(data, '$.content') as content
      FROM part
      WHERE session_id = ?
        AND json_extract(data, '$.type') = 'text'
        AND json_extract(data, '$.role') = 'assistant'
        AND UPPER(json_extract(data, '$.content')) LIKE '%CHECKPOINT%'
      ORDER BY time_created DESC LIMIT 1
    `).get(sessionId) as { content: string } | undefined;

    if (checkpointPart) {
      const reason = checkpointPart.content.slice(0, 200);
      return { isCheckpoint: true, reason };
    }
  } catch {
    // DB query failure — treat as no checkpoint (defensive)
  }

  return { isCheckpoint: false, reason: '' };
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
  /** Per-job continuation cycle counter — tracks judge:gaps/judge:failed append rounds. */
  /** Per-source continuation cycle counters. Each source (gaps, failed, hung) gets its own budget. */
  private continuationCycles = new Map<string, number>();

  private getCycleKey(jobId: string, source: 'gaps' | 'failed' | 'hung'): string {
    return `${jobId}:${source}`;
  }

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
        // Check for jobs resumed from review_hold that need step loop continuation.
        // These are 'running' jobs with resumed_from_hold=1 — set by resumeFromReviewHold().
        // The runner was not aware of these (they bypass claimNextLaunchable), so we pick them up here.
        const resumedJobs = getResumedReviewHoldJobs();
        for (const resumedJob of resumedJobs) {
          if (this.activeJobs.has(resumedJob.id)) continue; // Already being handled
          if (this.shuttingDown) break;

          // Clear the resumed flag before launching so we don't relaunch on next poll
          clearResumedFlag(resumedJob.id);

          process.stderr.write(`[runner] Resuming review_hold job ${resumedJob.id} (${resumedJob.project})\n`);
          this.activeJobs.set(resumedJob.id, { job: resumedJob, title: '' });
          this.launch(resumedJob).catch((err) => {
            process.stderr.write(`[runner] Error resuming review_hold job ${resumedJob.id}: ${errMsg(err)}\n`);
          });
          launched = true;
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
    let runtimeSkillHandle: RuntimeAgentSkillsPatchHandle | null = null;

    // Warn when picking up a job for an unregistered project (non-blocking)
    const projectRecord = getProject(job.project);
    if (!projectRecord) {
      process.stderr.write(
        `[runner] Warning: job ${job.id} targets unregistered project "${job.project}". Register with: pilot setup <dir>\n`,
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

      runtimeSkillHandle = await applyRuntimeAgentSkillsPatch(projectDir, job.categories ?? null);
      updateJobRuntimeSkillSnapshot(job.id, runtimeSkillHandle.snapshot);
      process.stderr.write(
        `[runner] Runtime skills categories: ${runtimeSkillHandle.snapshot.categories.join(', ') || 'none'}\n`,
      );
      process.stderr.write(
        `[runner] Runtime skills selected: ${runtimeSkillHandle.snapshot.selectedSkills.join(', ') || 'none'}\n`,
      );
      const mappedAgents = Object.keys(runtimeSkillHandle.snapshot.agentSkills).sort();
      process.stderr.write(
        `[runner] Runtime agent_skills patched: ${runtimeSkillHandle.snapshot.applied ? `${mappedAgents.length} mapped (${mappedAgents.join(', ') || 'none'})` : 'no runtime patch applied'}\n`,
      );

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

      // Step 2: Convert delegation intent to pending step records.
      // Clear any stale pending steps from a prior run (e.g., review_hold resume
      // re-enters launch() with leftover pending steps from the original execution).
      const staleCleared = cancelPendingSteps(job.id, 'Cleared before fresh delegation');
      if (staleCleared > 0) {
        process.stderr.write(
          `[runner] Cleared ${staleCleared} stale pending step(s) before delegation [job=${job.id}]\n`,
        );
      }
      const steps = this.intentToSteps(intent, job, projectDir);
      for (let i = 0; i < steps.length; i++) {
        createPendingStep(job.id, i, steps[i].command, steps[i].args, 'delegation', steps[i].reason);
      }

      // Debug jobs use dedicated lifecycle — skip step loop and judge entirely
      if (intent.type === 'debug') {
        await this.executeDebugFlow(job, projectDir, intent);
        return; // Debug flow handles its own completion/failure — do NOT fall through to step loop or milestone loop
      }

      // Step 3: Execute step loop
      // Initialize per-source cycle counters (each source gets its own budget)
      this.continuationCycles.set(this.getCycleKey(job.id, 'gaps'), 0);
      this.continuationCycles.set(this.getCycleKey(job.id, 'failed'), 0);
      this.continuationCycles.set(this.getCycleKey(job.id, 'hung'), 0);
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
      // Cancel any remaining pending steps so they don't linger in the DB
      cancelPendingSteps(job.id, `Job failed: ${error.slice(0, 200)}`);
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
      }
    } finally {
      this.continuationCycles.delete(this.getCycleKey(job.id, 'gaps'));
      this.continuationCycles.delete(this.getCycleKey(job.id, 'failed'));
      this.continuationCycles.delete(this.getCycleKey(job.id, 'hung'));
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
        if (runtimeSkillHandle) {
          try {
            const restoredSnapshot = await restoreRuntimeAgentSkillsPatch(projectDir, runtimeSkillHandle);
            updateJobRuntimeSkillSnapshot(job.id, restoredSnapshot);
            process.stderr.write(
              `[runner] Runtime agent_skills restore: ${restoredSnapshot.restoreStatus}\n`,
            );
          } catch (restoreErr) {
            const restoreMessage = errMsg(restoreErr);
            process.stderr.write(
              `[runner] Runtime agent_skills restore: failed - ${restoreMessage}\n`,
            );
            updateJobRuntimeSkillSnapshot(job.id, {
              ...runtimeSkillHandle.snapshot,
              categories: [...runtimeSkillHandle.snapshot.categories],
              selectedSkills: [...runtimeSkillHandle.snapshot.selectedSkills],
              invalidSkills: [...runtimeSkillHandle.snapshot.invalidSkills],
              agentSkills: Object.fromEntries(
                Object.entries(runtimeSkillHandle.snapshot.agentSkills).map(([agent, skillPaths]) => [agent, [...skillPaths]]),
              ),
              restoreStatus: 'failed',
              restoreError: restoreMessage,
            });
          }
        }

        cleanupInstalledSkills(projectDir);
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
  ): Array<{ command: string; args: string; reason?: string }> {
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
        const steps: Array<{ command: string; args: string; reason?: string }> = [];
        const phaseNumber = intent.phaseNumber;

        if (intent.addPhaseTitle) {
          const addArgs = intent.prdPath
            ? `"${intent.addPhaseTitle}" @${intent.prdPath}`
            : `"${intent.addPhaseTitle}"`;
          steps.push({ command: 'add-phase', args: addArgs });
        }

        // UI-phase insertion: delegation decided this phase needs a UI design contract
        if (intent.uiPhase && !intent.isGapClosure) {
          const existingUiSpec = findExistingUiSpec(projectDir, phaseNumber);
          if (existingUiSpec) {
            process.stderr.write(
              `[runner] UI-phase requested but UI-SPEC already exists: ${existingUiSpec} — skipping ui-phase step\n`,
            );
          } else {
            steps.push({
              command: 'ui-phase',
              args: String(phaseNumber),
              reason: 'Delegation determined phase needs UI design contract',
            });
          }
        }

        const planArgs = intent.prdPath
          ? `${phaseNumber} @${intent.prdPath}${intent.isGapClosure ? ' --gaps' : ''}`
          : `${phaseNumber}${intent.isGapClosure ? ' --gaps' : ''}`;
        steps.push({ command: 'plan-phase', args: planArgs });

        const executeArgs = intent.isGapClosure
          ? `${phaseNumber} --gaps-only --auto`
          : `${phaseNumber} --auto`;
        steps.push({ command: 'execute-phase', args: executeArgs });

        steps.push({ command: 'judge', args: '' });

        return steps;
      }
      case 'execute-only':
        return [
          { command: 'execute-phase', args: `${intent.phaseNumber} --auto` },
          { command: 'judge', args: '' },
        ];

      case 'audit-milestone':
        // No-op for now
        return [];

      case 'debug': {
        // Debug jobs use a dedicated lifecycle — NOT gsd-debug (interactive) and NOT the step loop + judge pattern.
        // The debug flow is handled entirely by executeDebugFlow() in launch().
        // Return empty steps array — launch() checks for intent.type === 'debug' before the step loop.
        return [];
      }
      case 'fast': {
        // Fast jobs use native gsd-fast when the project has it installed;
        // fall back to gsd-quick compat mode when gsd-fast.md is absent.
        // spawnAndWait auto-prepends gsd- so command 'fast' → '--command gsd-fast'
        const args = buildQuickArgs(job);
        if (hasNativeFast(projectDir)) {
          return [{ command: 'fast', args }];
        }
        process.stderr.write(`[runner] Fast scope: gsd-fast not available in ${projectDir}, falling back to gsd-quick compat\n`);
        return [{ command: 'quick', args, reason: 'compat: gsd-fast not available in project, using gsd-quick' }];
      }
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
        const stepList = getJobSteps(job.id);
        const delegationSteps = stepList.filter(s => s.source === 'delegation').length;
        const gapSteps = stepList.filter(s => s.source === 'judge:gaps').length;
        const failSteps = stepList.filter(s => s.source === 'judge:failed').length;
        const hungSteps = stepList.filter(s => s.source === 'judge:hung').length;
        markFailed(job.id, buildStepCapMessage(MAX_STEPS_PER_JOB, delegationSteps, gapSteps, failSteps, hungSteps));
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
        return;
      }

      dbMarkStepRunning(step.id);
      const totalStepsForLog = getTotalStepCount(job.id);
      const stepLabel = step.command === 'judge' ? 'judge' : `${step.command} ${step.args}`;
      process.stderr.write(
        `[runner] Step started: ${stepLabel} (step ${step.stepIndex + 1}/${totalStepsForLog}) [job=${job.id}]\n`,
      );

      if (step.command === 'judge') {
        await this.executeJudgeStep(job, projectDir, step);
      } else {
        await this.executeCommandStep(job, projectDir, step);
      }

      // After each step, check if job is still running (handlers may have marked failed)
      const latestJob = getJob(job.id);
      if (!latestJob || latestJob.status !== 'running') return;

      process.stderr.write(
        `[runner] Step completed: ${stepLabel} (step ${step.stepIndex + 1}/${totalStepsForLog}) [job=${job.id}]\n`,
      );

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

      // Check for mid-phase checkpoint pause before completing the step normally.
      // If the session ended at a GSD checkpoint AND there are remaining pending steps,
      // transition the job to review_hold instead of continuing execution.
      const { isCheckpoint, reason } = detectCheckpointPause(sessionId);
      const pendingCount = getPendingStepCount(job.id);
      if (isCheckpoint && pendingCount > 0) {
        dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
        const holdReason = `Checkpoint paused after step: ${step.command} ${step.args}. Remaining steps: ${pendingCount}. Reason: ${reason.slice(0, 100)}`;
        markReviewHold(job.id, holdReason);
        const heldJob = getJob(job.id);
        if (heldJob) notifyJobCompletion(heldJob).catch(() => {});
        return;
      }

      dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
      if (step.command === 'ui-phase') {
        process.stderr.write(`[runner] ui-phase completed, handing off to plan-phase [job=${job.id}]\n`);
      }
    } catch (err) {
      if (err instanceof HungSessionError) {
        const sessionId = findSessionByTitle(title);
        const artifactOutcome = resolveUiArtifactOutcome(step.command, step.args, projectDir);
        if (artifactOutcome === 'completed') {
          if (step.command === 'ui-phase') {
            const phaseMatch = step.args.match(/^(\d+)/);
            process.stderr.write(
              `[runner] ui-phase completed (hung artifact recovery: UI-SPEC exists for phase ${phaseMatch?.[1]}) — handing off to plan-phase [job=${job.id}]\n`,
            );
          }
          dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
          return;
        }
        if (artifactOutcome === 'skipped') {
          dbMarkStepSkipped(
            step.id,
            `ui-review skipped: hung on ${err.hungReason} before producing UI-REVIEW artifact`,
            sessionId ?? undefined,
            title,
          );
          return;
        }

        // Artifact-based recovery for ui-phase: if the session produced the UI-SPEC
        // artifact before hitting an interactive prompt (expected — GSD ui-phase has
        // review checkpoints), treat as completed instead of failed.
        if (resolveHungUiPhaseOutcome(step.command, step.args, projectDir) === 'completed') {
          const phaseMatch = step.args.match(/^(\d+)/);
          process.stderr.write(
            `[runner] ui-phase completed (hung artifact recovery: UI-SPEC exists for phase ${phaseMatch?.[1]}) — handing off to plan-phase [job=${job.id}]\n`,
          );
          dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
          return; // Step completed via artifact detection — continue to next step
        }
        // No artifact recovery — ui-phase didn't produce a UI-SPEC.
        // If remaining delegation steps already cover the continuation (plan-phase →
        // execute-phase → judge), skip re-delegation to avoid appending duplicate steps.
        // ui-phase is an optional quality step; the plan-phase works without it.
        if (step.command === 'ui-phase' && getPendingStepCount(job.id) > 0) {
          dbMarkStepSkipped(
            step.id,
            `ui-phase skipped: hung on ${err.hungReason} before producing UI-SPEC; delegation steps continue`,
            sessionId ?? undefined,
            title,
          );
          process.stderr.write(
            `[runner] ui-phase skipped (no UI-SPEC, ${getPendingStepCount(job.id)} delegation steps remain) — continuing [job=${job.id}]\n`,
          );
          return; // Let the loop pick up the next pending delegation step (plan-phase)
        }
        // Generic hung handling for non-ui-phase commands
        dbMarkStepFailed(step.id, errMsg(err), sessionId ?? undefined, title);
        incrementHungCount(job.id, err.hungReason);
        // Re-delegate for continuation
        await this.handleHungContinuation(job, projectDir, step, err);
      } else {
        const sessionId = findSessionByTitle(title);
        const artifactOutcome = resolveUiArtifactOutcome(step.command, step.args, projectDir);
        if (artifactOutcome === 'completed') {
          if (step.command === 'ui-phase') {
            const phaseNumber = extractPhaseNumberFromStepArgs(step.args);
            process.stderr.write(
              `[runner] ui-phase completed (artifact recovery: UI-SPEC exists for phase ${phaseNumber ?? 'unknown'}) — handing off to plan-phase [job=${job.id}]\n`,
            );
          }
          dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
          return;
        }
        if (artifactOutcome === 'skipped') {
          dbMarkStepSkipped(
            step.id,
            'ui-review skipped: command exited before producing UI-REVIEW artifact',
            sessionId ?? undefined,
            title,
          );
          return;
        }

        // Artifact-based recovery: if this was a ui-phase step and the UI-SPEC was
        // successfully created (but the process died non-cleanly, e.g., WAL flush race),
        // treat it as completed rather than failing the entire job.
        if (step.command === 'ui-phase') {
          const phaseMatch = step.args.match(/^(\d+)/);
          const phaseNum = phaseMatch ? parseInt(phaseMatch[1], 10) : null;
          if (phaseNum !== null && isUiPhaseArtifactComplete('ui-phase', projectDir, phaseNum)) {
            process.stderr.write(
              `[runner] ui-phase completed (artifact recovery: UI-SPEC exists for phase ${phaseNum}) — handing off to plan-phase [job=${job.id}]\n`,
            );
            dbMarkStepCompleted(step.id, sessionId ?? undefined, title);
            return; // Step completed via artifact detection — continue to next step (plan-phase)
          }
        }
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
      process.stderr.write(`[runner] Shutdown during judge — marking ${job.id} as failed\n`);
      return;
    }

    const rawVerdict = await this.runJudge(job, projectDir, phaseNumber);

    // Judge crash/timeout: rawVerdict is null — this is a transient failure, not a
    // meaningful "fail" verdict. Fail the job directly without wasting an API call
    // on re-delegation (which would just re-run the judge and likely fail again).
    if (!rawVerdict) {
      dbMarkStepFailed(step.id, 'Judge session failed or timed out');
      markFailed(job.id, 'Judge session failed or timed out — no verdict produced');
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    const verdict = rawVerdict;

    if (verdict.verdict === 'passed' || verdict.verdict === 'succeeded' || verdict.verdict === 'pass') {
      updateJudgeVerdict(job.id, JSON.stringify(verdict));
      dbMarkStepCompleted(step.id);
      this.finishSuccessfulJudgeStep(job, projectDir, phaseNumber);
      return;
    }

    if (verdict.verdict === 'gaps_found' || verdict.verdict === 'doubting' || verdict.verdict === 'partial') {
      const verificationSnapshot = readLatestVerificationArtifact(projectDir, phaseNumber);
      const verificationRouting = deriveVerificationRouting(verificationSnapshot);
      const routedVerdict: JudgeVerdict = {
        ...verdict,
        verificationStatus: verificationRouting.verificationStatus,
        actionableGapCount: verificationRouting.actionableGapCount,
        humanVerificationCount: verificationRouting.humanVerificationCount,
        routingDecision: verificationRouting.routingDecision,
        routingReason: verificationRouting.routingReason,
        artifactPath: verificationRouting.artifactPath,
        artifactAvailable: verificationRouting.artifactAvailable,
        unavailableReason: verificationRouting.unavailableReason,
      };

      updateJudgeVerdict(job.id, JSON.stringify(routedVerdict));
      dbMarkStepCompleted(step.id);

      if (verificationRouting.routingDecision === 'complete') {
        this.log(`Judge completion routed from structured verification: ${verificationRouting.routingReason}`);
        this.finishSuccessfulJudgeStep(job, projectDir, phaseNumber);
        return;
      }

      if (verificationRouting.routingDecision === 'human-review') {
        const checklist = formatHumanVerificationChecklist(verificationSnapshot, verificationRouting.routingReason);
        markCompletedPendingReview(job.id, checklist);
        this.collectActualModels(job.id);
        await this.captureRecoveryHead(job.id, projectDir);
        const reviewJob = getJob(job.id);
        if (reviewJob) notifyJobCompletion(reviewJob).catch(() => {});
        return;
      }

      if (verificationRouting.routingDecision === 'review-hold') {
        const holdReason = formatVerificationHoldReason(
          verificationRouting.routingReason,
          verificationRouting.unavailableReason,
          verificationRouting.artifactPath,
        );
        markReviewHold(job.id, holdReason);
        this.log(`Judge placed job on review hold from structured verification: ${holdReason}`);
        this.collectActualModels(job.id);
        await this.captureRecoveryHead(job.id, projectDir);
        const heldJob = getJob(job.id);
        if (heldJob) notifyJobCompletion(heldJob).catch(() => {});
        return;
      }

      this.log(`Judge routed to gap continuation from structured verification: ${verificationRouting.routingReason}`);
      await this.handleGapsContinuation(job, projectDir, routedVerdict);
      return;
    }

    // verdict === 'failed' or 'fail'
    updateJudgeVerdict(job.id, JSON.stringify(verdict));
    dbMarkStepCompleted(step.id);
    // Re-delegate for failure recovery
    await this.handleFailedContinuation(job, projectDir, verdict);
  }

  private finishSuccessfulJudgeStep(job: Job, projectDir: string, phaseNumber: number): void {
    const cancelled = cancelPendingSteps(job.id, 'Judge passed - remaining steps skipped');
    if (cancelled > 0) {
      process.stderr.write(
        `[runner] Judge passed, cancelled ${cancelled} stale pending step(s) [job=${job.id}]\n`,
      );
    }

    const jobSteps = getJobSteps(job.id);
    const uiReview = isUiReviewEligible(job, jobSteps, projectDir, phaseNumber);
    const hasUiReviewStep = jobSteps.some((jobStep) => jobStep.command === 'ui-review');

    if (uiReview.eligible && !uiReview.uiReviewPath && !hasUiReviewStep) {
      appendSteps(
        job.id,
        [{ command: 'ui-review', args: String(phaseNumber) }],
        'delegation',
        'Advisory UI audit after successful judge pass',
      );
      process.stderr.write(`[runner] ui-review queued as advisory audit [job=${job.id}]\n`);
    }
  }

  // ── Continuation Handlers ──────────────────────────────────────────────

  /**
   * Handle gaps_found verdict: re-delegate for continuation steps.
   * Appends new steps (plan-phase --gaps + execute-phase --gaps-only --auto + judge).
   * Guards against unbounded continuation loops via MAX_CONTINUATION_CYCLES.
   */
  private async handleGapsContinuation(
    job: Job,
    projectDir: string,
    verdict: JudgeVerdict,
  ): Promise<void> {
    const cycleKey = this.getCycleKey(job.id, 'gaps');
    const cycles = this.continuationCycles.get(cycleKey) ?? 0;

    // Budget gate — check BEFORE cycle count (proactive, not reactive)
    const remaining = getRemainingBudget(job.id);
    if (remaining < MIN_CONTINUATION_BUDGET) {
      // Gaps found but budget insufficient — this is substantially done, not a failure
      const totalSteps = getTotalStepCount(job.id);
      const msg = buildBudgetExhaustedMessage(remaining, MIN_CONTINUATION_BUDGET, totalSteps, 'judge:gaps', verdict.reason);
      const checklist = verdict.gaps && verdict.gaps.length > 0
        ? `Budget exhausted. Remaining review items:\n- ${verdict.gaps.join('\n- ')}`
        : `Budget exhausted. ${verdict.reason ?? 'Remaining work needs review.'}`;
      markCompletedPendingReview(job.id, checklist);
      this.log(msg);
      this.collectActualModels(job.id);
      await this.captureRecoveryHead(job.id, projectDir);
      const reviewJob = getJob(job.id);
      if (reviewJob) notifyJobCompletion(reviewJob).catch(() => {});
      return;
    }

    if (cycles >= MAX_CONTINUATION_CYCLES) {
      const totalSteps = getTotalStepCount(job.id);
      const steps = getJobSteps(job.id);
      const continuationSteps = steps.filter(s => s.source.startsWith('judge:')).length;
      markFailed(
        job.id,
        buildContinuationLimitMessage(MAX_CONTINUATION_CYCLES, continuationSteps, totalSteps, verdict.reason ?? 'unknown'),
      );
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    // Clear-and-redelegate: cancel stale pending steps before appending fresh pipeline
    const cleared = cancelPendingSteps(job.id, 'Cleared for gap closure re-delegation');
    if (cleared > 0) {
      this.log(`Cleared ${cleared} stale pending step(s) before gap closure for ${job.id}`);
    }

    try {
      const result = await reDelegateForContinuation(job, projectDir, {
        source: 'judge:gaps',
        reason: verdict.reason,
        gaps: verdict.gaps,
      });

      if (result._sessionTitle) updateSessionTitles(job.id, [result._sessionTitle]);

      if (result.steps.length > 0) {
        appendSteps(job.id, result.steps, 'judge:gaps', verdict.reason);
        this.continuationCycles.set(cycleKey, cycles + 1);
        this.log(`Appended ${result.steps.length} gap-closure step(s) for ${job.id} (cycle ${cycles + 1}/${MAX_CONTINUATION_CYCLES})`);
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
   * Handle failed verdict: clear stale pending steps, re-delegate for a fresh recovery pipeline.
   * Guards against unbounded continuation loops via MAX_CONTINUATION_CYCLES.
   */
  private async handleFailedContinuation(
    job: Job,
    projectDir: string,
    verdict: JudgeVerdict,
  ): Promise<void> {
    const cycleKey = this.getCycleKey(job.id, 'failed');
    const cycles = this.continuationCycles.get(cycleKey) ?? 0;

    // Budget gate — check BEFORE cycle count (proactive, not reactive)
    const remaining = getRemainingBudget(job.id);
    if (remaining < MIN_CONTINUATION_BUDGET) {
      const totalSteps = getTotalStepCount(job.id);
      const msg = buildBudgetExhaustedMessage(remaining, MIN_CONTINUATION_BUDGET, totalSteps, 'judge:failed', verdict.reason);
      markFailed(job.id, msg);
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    if (cycles >= MAX_CONTINUATION_CYCLES) {
      const totalSteps = getTotalStepCount(job.id);
      const steps = getJobSteps(job.id);
      const continuationSteps = steps.filter(s => s.source.startsWith('judge:')).length;
      markFailed(
        job.id,
        buildContinuationLimitMessage(MAX_CONTINUATION_CYCLES, continuationSteps, totalSteps, verdict.reason ?? 'unknown'),
      );
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    // Clear-and-redelegate: cancel stale pending steps before appending fresh pipeline
    const cleared = cancelPendingSteps(job.id, 'Cleared for failure recovery re-delegation');
    if (cleared > 0) {
      this.log(`Cleared ${cleared} stale pending step(s) before failure recovery for ${job.id}`);
    }

    try {
      const result = await reDelegateForContinuation(job, projectDir, {
        source: 'judge:failed',
        reason: verdict.reason,
      });

      if (result._sessionTitle) updateSessionTitles(job.id, [result._sessionTitle]);

      if (result.steps.length > 0) {
        appendSteps(job.id, result.steps, 'judge:failed', verdict.reason);
        this.continuationCycles.set(cycleKey, cycles + 1);
        this.log(`Appended ${result.steps.length} recovery step(s) for ${job.id} (cycle ${cycles + 1}/${MAX_CONTINUATION_CYCLES})`);
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
   * Handle hung session: clear stale pending steps, re-delegate for a fresh pipeline.
   * Guards against unbounded hung retry loops via MAX_CONTINUATION_CYCLES.
   */
  private async handleHungContinuation(
    job: Job,
    projectDir: string,
    step: JobStep,
    error: HungSessionError,
  ): Promise<void> {
    // Safety: debug jobs handle hung sessions in executeDebugFlow — never re-delegate
    if (job.scope === 'debug') {
      markFailed(job.id, `Debug session hung: ${error.hungReason}. Debug jobs do not re-delegate.`);
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    // Cycle guard — prevent unbounded hung retries (same budget as gaps/failed)
    const cycleKey = this.getCycleKey(job.id, 'hung');
    const cycles = this.continuationCycles.get(cycleKey) ?? 0;
    if (cycles >= MAX_CONTINUATION_CYCLES) {
      const totalSteps = getTotalStepCount(job.id);
      const stepList = getJobSteps(job.id);
      const continuationSteps = stepList.filter(s => s.source.startsWith('judge:')).length;
      markFailed(
        job.id,
        buildContinuationLimitMessage(MAX_CONTINUATION_CYCLES, continuationSteps, totalSteps, `Hung: ${error.hungReason}`),
      );
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      return;
    }

    // Clear-and-redelegate: cancel stale pending steps BEFORE appending fresh ones.
    // Without this, stale steps (e.g., an original judge step) would execute before
    // the recovery steps, causing wasted compute and confusing verdict cascades.
    const cleared = cancelPendingSteps(job.id, `Cleared for hung recovery: ${step.command} hung on ${error.hungReason}`);
    if (cleared > 0) {
      this.log(`Cleared ${cleared} stale pending step(s) before hung recovery for ${job.id}`);
    }

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
        this.continuationCycles.set(cycleKey, cycles + 1);
        this.log(`Appended ${result.steps.length} hung-recovery step(s) for ${job.id} (cycle ${cycles + 1}/${MAX_CONTINUATION_CYCLES})`);
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

  // ── Debug Lane ─────────────────────────────────────────────────────────

  /**
   * Execute a debug job using gsd-debugger directly with prefilled context.
   * Handles the full debug lifecycle: spawn → parse outcome → handle checkpoint continuation.
   *
   * Key differences from phase execution:
   * - Uses inline prompt (like judge) instead of --command flag
   * - No judge step — debugger self-verifies
   * - Autonomous continuation on human-verify checkpoints
   * - Blocks explicitly on human-action/decision checkpoints
   * - Never routes into phase-style judge logic
   */
  private async executeDebugFlow(
    job: Job,
    projectDir: string,
    intent: DelegationIntent & { type: 'debug' },
  ): Promise<void> {
    const slug = this.generateDebugSlug(job.description);
    const debugPrompt = buildDebugPrompt({
      description: job.description,
      symptoms: intent.symptoms,
      slug,
    });

    // Create a step record for observability (step 0 = initial debug investigation)
    createPendingStep(job.id, 0, 'debugger', job.description, 'delegation', 'direct gsd-debugger spawn');

    const ts = Date.now().toString(36).slice(-4);
    const title = truncateTitle(`${job.project}-debugger-${job.id}-${ts}`, 80);
    this.activeJobs.set(job.id, { job, title });
    updateSessionTitles(job.id, [title]);

    const step = getNextPendingStep(job.id);
    if (step) dbMarkStepRunning(step.id);

    try {
      // Spawn gsd-debugger with inline prompt (same pattern as judge sessions)
      // The scope is 'debug' which resolves to gsd-debugger model via resolveTopLevelModel
      await this.spawnAndWait(projectDir, 'debugger', '', title, undefined, debugPrompt);

      const sessionId = findSessionByTitle(title);
      if (step) dbMarkStepCompleted(step.id, sessionId ?? undefined, title);

      // Parse the debug outcome from session transcript
      const outcome = this.extractDebugOutcome(sessionId);

      await this.handleDebugOutcome(job, projectDir, outcome, slug, title);
    } catch (err) {
      if (err instanceof HungSessionError) {
        // Interactive prompt leak detected — this is exactly what we're fixing.
        // Do NOT re-delegate into phase logic. Mark failed with clear reason.
        const sessionId = findSessionByTitle(title);
        if (step) dbMarkStepFailed(step.id, errMsg(err), sessionId ?? undefined, title);
        markFailed(job.id, `Debug session hung on interactive prompt (${err.hungReason}). This indicates gsd-debugger tried to use an interactive tool in unattended mode. Tool: ${err.lastToolCall ?? 'unknown'}`);
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
      } else {
        const sessionId = findSessionByTitle(title);
        if (step) dbMarkStepFailed(step.id, errMsg(err), sessionId ?? undefined, title);
        throw err; // Propagate to launch() catch-all
      }
    }
  }

  /**
   * Extract debug outcome from session transcript.
   */
  private extractDebugOutcome(sessionId: string | null): DebugOutcome {
    if (!sessionId) {
      return { type: 'unknown', rawContent: 'No session found' };
    }

    try {
      const exported = exportSessionFromDb(sessionId) as { messages: Array<Record<string, unknown>> };
      if (exported.messages.length > 0) {
        const lastAssistant = [...exported.messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
          return parseDebugOutcome(String(lastAssistant.content ?? ''));
        }
      }
    } catch (err) {
      process.stderr.write(`[runner] debug outcome extraction failed: ${errMsg(err)}\n`);
    }

    return { type: 'unknown', rawContent: 'Could not extract session content' };
  }

  /**
   * Handle a parsed debug outcome — complete, continue, or fail.
   */
  private async handleDebugOutcome(
    job: Job,
    projectDir: string,
    outcome: DebugOutcome,
    slug: string,
    _previousTitle: string,
  ): Promise<void> {
    switch (outcome.type) {
      case 'debug_complete': {
        // Full success — debugger found, fixed, and verified
        process.stderr.write(`[runner] Debug complete for ${job.id}: ${outcome.rootCause}\n`);
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompleted(job.id);
        const completedJob = getJob(job.id);
        if (completedJob) notifyJobCompletion(completedJob).catch(() => {});
        return;
      }

      case 'root_cause_found': {
        // Diagnosis complete but no fix applied — mark as completed pending review
        process.stderr.write(`[runner] Debug root cause found for ${job.id}: ${outcome.rootCause}\n`);
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompletedPendingReview(job.id, `Root cause: ${outcome.rootCause}\nSuggested fix: ${outcome.suggestedFix}`);
        const reviewJob = getJob(job.id);
        if (reviewJob) notifyJobCompletion(reviewJob).catch(() => {});
        return;
      }

      case 'investigation_inconclusive': {
        // Could not find root cause — mark failed with diagnostic info
        process.stderr.write(`[runner] Debug investigation inconclusive for ${job.id}\n`);
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markFailed(job.id, `Investigation inconclusive. Recommendation: ${outcome.recommendation}. Checked: ${outcome.checked.join(', ')}`);
        const failedJob = getJob(job.id);
        if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
        return;
      }

      case 'checkpoint': {
        if (outcome.checkpointType === 'human-verify') {
          // Autonomous continuation — the debugger self-verified, we confirm on its behalf
          process.stderr.write(`[runner] Debug checkpoint human-verify for ${job.id} — spawning autonomous continuation\n`);
          await this.continueDebugAfterVerify(job, projectDir, slug);
          return;
        }
        // human-action or decision — these are truly interactive, block explicitly
        process.stderr.write(`[runner] Debug checkpoint ${outcome.checkpointType} for ${job.id} — blocking (requires human)\n`);
        markReviewHold(job.id, `Debug checkpoint requires human interaction: ${outcome.checkpointType}. ${outcome.details.slice(0, 200)}`);
        const heldJob = getJob(job.id);
        if (heldJob) notifyJobCompletion(heldJob).catch(() => {});
        return;
      }

      case 'unknown': {
        // No structured output — treat as success if session completed normally
        // (gsd-debugger may have done work without structured return)
        process.stderr.write(`[runner] Debug session completed without structured outcome for ${job.id}. Treating as complete.\n`);
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompleted(job.id);
        const completedJob2 = getJob(job.id);
        if (completedJob2) notifyJobCompletion(completedJob2).catch(() => {});
        return;
      }
    }
  }

  /**
   * Spawn a continuation gsd-debugger session after human-verify checkpoint.
   * Provides "confirmed fixed" response so the debugger can finalize/archive/commit.
   */
  private async continueDebugAfterVerify(
    job: Job,
    projectDir: string,
    slug: string,
  ): Promise<void> {
    const debugFilePath = `.planning/debug/${slug}.md`;
    const continuationPrompt = buildContinuationPrompt({ slug, debugFilePath });

    // Create continuation step for observability
    const stepCount = getTotalStepCount(job.id);
    createPendingStep(job.id, stepCount, 'debugger-continue', 'autonomous checkpoint continuation', 'delegation', 'auto-confirm human-verify checkpoint');

    const ts = Date.now().toString(36).slice(-4);
    const contTitle = truncateTitle(`${job.project}-dbg-cont-${job.id}-${ts}`, 80);
    this.activeJobs.set(job.id, { job, title: contTitle });
    updateSessionTitles(job.id, [contTitle]);

    const contStep = getNextPendingStep(job.id);
    if (contStep) dbMarkStepRunning(contStep.id);

    try {
      await this.spawnAndWait(projectDir, 'debugger', '', contTitle, undefined, continuationPrompt);

      const sessionId = findSessionByTitle(contTitle);
      if (contStep) dbMarkStepCompleted(contStep.id, sessionId ?? undefined, contTitle);

      // Parse continuation outcome
      const outcome = this.extractDebugOutcome(sessionId);

      if (outcome.type === 'debug_complete') {
        process.stderr.write(`[runner] Debug continuation complete for ${job.id}\n`);
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompleted(job.id);
        const completedJob = getJob(job.id);
        if (completedJob) notifyJobCompletion(completedJob).catch(() => {});
      } else {
        // Continuation didn't produce DEBUG COMPLETE — still treat as success
        // The debugger did its work, archived the session
        process.stderr.write(`[runner] Debug continuation for ${job.id} returned ${outcome.type} — treating as complete\n`);
        await this.captureRecoveryHead(job.id, projectDir);
        this.collectActualModels(job.id);
        markCompleted(job.id);
        const completedJob = getJob(job.id);
        if (completedJob) notifyJobCompletion(completedJob).catch(() => {});
      }
    } catch (err) {
      const sessionId = findSessionByTitle(contTitle);
      if (contStep) dbMarkStepFailed(contStep.id, errMsg(err), sessionId ?? undefined, contTitle);
      // Continuation failure — the initial debug work was done, mark with diagnostic
      if (err instanceof HungSessionError) {
        markFailed(job.id, `Debug continuation hung on interactive prompt: ${err.hungReason}`);
      } else {
        throw err; // Propagate to launch() catch-all
      }
      const failedJob = getJob(job.id);
      if (failedJob) notifyJobCompletion(failedJob).catch(() => {});
    }
  }

  /**
   * Generate a URL-safe slug from a debug job description.
   * Lowercase, hyphens, max 30 chars.
   */
  private generateDebugSlug(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
  }

  // ── Step Helpers ───────────────────────────────────────────────────────

  /**
   * Extract phase number from completed steps in the DB.
   * Looks for plan-phase or execute-phase step args and extracts the phase number.
   * Args format: "31 --auto" or "31 --gaps-only --auto" or legacy "31"
   */
  private extractPhaseNumberFromSteps(jobId: string): number | null {
    const steps = getJobSteps(jobId);
    // Look through steps in reverse (most recent first)
    for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i];
        if (step.command === 'plan-phase' || step.command === 'execute-phase') {
          const phaseNumber = extractPhaseNumberFromStepArgs(step.args);
          if (phaseNumber !== null) return phaseNumber;
        }
      }
    return null;
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
      // Always throw — let callers (executeCommandStep / runJudge) handle the error
      // via their own catch blocks. Returning silently here caused callers to proceed
      // into their success path (marking steps completed when nothing ran).
      throw new Error(`Insufficient memory after 5m wait: ${errMsg(memErr)}`);
    }
    await enforceSpawnRateLimit();
    await validateProjectConfig(cwd);
    await ensureAutonomousGsdConfig(cwd);

    // Resolve top-level model for --model flag
    // Use the job's actual scope when available — inline prompts are used for both
    // judge sessions AND debug sessions, so inlinePrompt alone does not imply judge scope.
    const jobEntry = [...this.activeJobs.values()].find(a => a.title === title);
    const jobScope = jobEntry?.job.scope;
    const scope = jobScope ?? (inlinePrompt !== undefined ? 'judge' as const : 'quick' as const);
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
        // Safety net: PID is dead and state is still working/hung — treat as complete
        // if there are assistant messages (session had activity before dying).
        // Without this, orphaned child sessions could cause an infinite poll loop.
        {
          const msgCount = getAssistantMessageCount(sessionId);
          if (msgCount > 0) {
            process.stderr.write(
              `[runner] Warning: process died for ${title} (state=${afterWal.state} after WAL wait) but session has ${msgCount} messages. Treating as complete.\n`,
            );
            return;
          }
          throw new Error(`Process died without clean completion for: ${title} (state=${afterWal.state})`);
        }
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

// ── Budget helpers ─────────────────────────────────────────────────────────

/**
 * Calculate remaining step budget for a job.
 * Pure helper — uses getTotalStepCount from db.ts.
 */
function getRemainingBudget(jobId: string): number {
  return MAX_STEPS_PER_JOB - getTotalStepCount(jobId);
}

// ── Message builder helpers ────────────────────────────────────────────────

/**
 * Build the step-cap failure message with per-source step breakdown.
 * Pure function — extracted for testability.
 */
function buildStepCapMessage(
  totalCap: number,
  delegationSteps: number,
  gapSteps: number,
  failSteps: number,
  hungSteps: number,
): string {
  return (
    `Step cap reached (${totalCap}). ` +
    `Breakdown: ${delegationSteps} initial, ${gapSteps} gap-closure, ${failSteps} failure-recovery, ${hungSteps} hung-recovery. ` +
    `This usually means the judge kept finding issues that continuation could not resolve.`
  );
}

/**
 * Build the continuation cycle limit failure message.
 * Pure function — extracted for testability.
 */
function buildContinuationLimitMessage(
  maxCycles: number,
  continuationSteps: number,
  totalSteps: number,
  lastVerdict: string,
): string {
  return (
    `Continuation cycle limit reached (${maxCycles}). ` +
    `${continuationSteps}/${totalSteps} steps were continuation-driven. ` +
    `Last verdict: ${lastVerdict.slice(0, 200)}`
  );
}

/**
 * Build the budget-exhaustion message — explains proactively that budget is insufficient.
 * Differentiates from step-cap (reactive) and continuation-limit (cycle-based).
 * For gaps_found: suggests completed_pending_review since work is substantially done.
 * For failed: explains budget ran out during recovery.
 */
function buildBudgetExhaustedMessage(
  remaining: number,
  required: number,
  totalSteps: number,
  source: 'judge:gaps' | 'judge:failed',
  lastReason?: string,
): string {
  const sourceLabel = source === 'judge:gaps' ? 'gap closure' : 'failure recovery';
  return (
    `Budget insufficient for ${sourceLabel}: ${remaining} steps remaining, ${required} needed. ` +
    `${totalSteps} steps already completed. ` +
    (lastReason ? `Last verdict: ${lastReason.slice(0, 200)}. ` : '') +
    (source === 'judge:gaps'
      ? 'The work is substantially complete — remaining items may need human review.'
      : 'Recovery could not proceed within remaining step budget.')
  );
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

/**
 * Build the step-cap failure message with per-source breakdown.
 * @internal — exported for tests only
 */
export { buildStepCapMessage as _buildStepCapMessage };

/**
 * Build the continuation cycle limit failure message.
 * @internal — exported for tests only
 */
export { buildContinuationLimitMessage as _buildContinuationLimitMessage };

/**
 * Build the budget-exhaustion failure message.
 * @internal — exported for tests only
 */
export { buildBudgetExhaustedMessage as _buildBudgetExhaustedMessage };

/**
 * Artifact-based UI-phase completion helpers.
 * @internal — exported for tests only
 */
export { findExistingUiSpec as _findExistingUiSpec };
export { isUiPhaseArtifactComplete as _isUiPhaseArtifactComplete };
export { resolveHungUiPhaseOutcome as _resolveHungUiPhaseOutcome };
