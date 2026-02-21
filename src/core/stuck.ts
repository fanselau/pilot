/**
 * Weighted multi-signal stuck detection algorithm.
 *
 * Evaluates independent signals to score whether a process is stuck.
 * Replaces the bash 3-way AND with a nuanced scoring system.
 *
 * Architecture:
 * - scoreFromSignals() is a pure function for testability (no I/O)
 * - Helper functions (getLogStaleness, sampleCpu, etc.) handle /proc I/O
 * - computeStuckScore() orchestrates: calls helpers → passes data to scorer
 * - isStuck() from opencode-db.ts provides DB-based stuck detection
 *   (replaces the old message-count Signal 3 heuristic)
 *
 * Pure core module — no UI dependencies.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { StuckAssessment, StuckSignal, DaemonStuckAssessment } from './types.js';
import { getConfig } from './config.js';
import { findPhaseDir, countSummaryFiles, countNonGapPlanFiles } from './phase-state.js';
import { isStuck, findSessionByTitle } from './opencode-db.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StuckSignalInput {
  logStaleness: number;       // seconds since last log write
  runtime: number;            // seconds process has been running
  cpuSamples: number[];       // CPU % samples over time
  messageCount: number | null; // session message count, null if unknown
  processRss: number;         // process RSS in MB
  systemFreeMb: number;       // system free memory in MB
  procState: string | null;   // /proc/pid/status State letter (R/S/D/Z/T)
  wchan: string | null;       // /proc/pid/wchan content
}

export interface StuckScoreResult {
  score: number;
  verdict: 'healthy' | 'suspect' | 'stuck';
  signals: StuckSignal[];
}

// ── Pure Scoring Function ──────────────────────────────────────────────────

function scoreFromSignals(input: StuckSignalInput): StuckScoreResult {
  let score = 0;
  const signals: StuckSignal[] = [];

  // ── Signal 1: Log staleness (max 50 points) ──
  // Exclusive: highest matching rule applies
  if (input.logStaleness > 900 && input.runtime > 900) {
    // 15min stale + 15min runtime → 30 points
    score += 30;
    signals.push({
      name: 'log_stale_15m',
      points: 30,
      detail: `Log stale ${Math.round(input.logStaleness / 60)}m`,
    });
  } else if (input.logStaleness > 300 && input.runtime > 600) {
    // 5min stale + 10min runtime → 20 points
    score += 20;
    signals.push({
      name: 'log_stale_5m',
      points: 20,
      detail: `Log stale ${Math.round(input.logStaleness / 60)}m`,
    });
  }

  // ── Signal 2: CPU usage trend (max 40 points) ──
  // Cumulative: both rules can fire
  const maxCpu = input.cpuSamples.length > 0
    ? Math.max(...input.cpuSamples)
    : 100; // assume active if no samples

  if (maxCpu < 0.5 && input.runtime > 600) {
    score += 25;
    signals.push({
      name: 'cpu_zero',
      points: 25,
      detail: `Max CPU ${maxCpu}% over ${input.cpuSamples.length} samples`,
    });
  }

  if (input.cpuSamples.length > 0 && input.cpuSamples.every(s => s < 0.1) && input.runtime > 600) {
    score += 15;
    signals.push({
      name: 'cpu_flatline',
      points: 15,
      detail: 'All samples <0.1%',
    });
  }

  // ── Signal 3: Session message count (max 40 points) ──
  // Exclusive: highest matching rule applies
  if (input.messageCount === 0 && input.runtime > 300) {
    // 0 messages after 5 min → 40 points
    score += 40;
    signals.push({
      name: 'no_messages',
      points: 40,
      detail: `0 messages after ${Math.round(input.runtime / 60)}m`,
    });
  } else if (
    input.messageCount !== null &&
    input.messageCount > 0 &&
    input.messageCount < 3 &&
    input.runtime > 600
  ) {
    // < 3 messages after 10 min → 20 points
    score += 20;
    signals.push({
      name: 'few_messages',
      points: 20,
      detail: `Only ${input.messageCount} messages after ${Math.round(input.runtime / 60)}m`,
    });
  }

  // ── Signal 4: Memory pressure (max 20 points) ──
  if (input.processRss > 1024) {
    score += 10;
    signals.push({
      name: 'high_rss',
      points: 10,
      detail: `RSS ${input.processRss}MB`,
    });
  }

  if (input.systemFreeMb < 500) {
    score += 10;
    signals.push({
      name: 'low_system_mem',
      points: 10,
      detail: `System free ${input.systemFreeMb}MB`,
    });
  }

  // ── Signal 5: /proc/pid/status checks (max 80 points) ──
  if (input.procState === 'T') {
    score += 50;
    signals.push({
      name: 'stopped',
      points: 50,
      detail: 'Process state: stopped (T)',
    });
  }

  if (input.procState === 'Z') {
    score += 80;
    signals.push({
      name: 'zombie',
      points: 80,
      detail: 'Process state: zombie (Z)',
    });
  }

  // Check stdin-blocked: wchan matches read|wait|poll
  if (input.wchan && /read|wait|poll/.test(input.wchan) && input.runtime > 600) {
    score += 30;
    signals.push({
      name: 'stdin_blocked',
      points: 30,
      detail: `wchan: ${input.wchan}`,
    });
  }

  // ── Verdict ──
  const verdict: 'healthy' | 'suspect' | 'stuck' =
    score >= 70 ? 'stuck' : score >= 40 ? 'suspect' : 'healthy';

  return { score, verdict, signals };
}

// ── I/O Helper Functions ───────────────────────────────────────────────────

/**
 * Seconds since the log file was last written to.
 * Returns Infinity if the file doesn't exist or is unreadable.
 */
async function getLogStaleness(logFile: string): Promise<number> {
  try {
    const fileStat = await stat(logFile);
    const now = Date.now();
    return (now - fileStat.mtimeMs) / 1000;
  } catch {
    return Infinity;
  }
}

/**
 * Sample CPU usage over time by reading /proc/pid/stat.
 * Returns array of CPU percentages for each interval.
 * Returns [0] repeated for non-existent PIDs.
 */
async function sampleCpu(pid: number, count: number, intervalMs: number, timeoutMs?: number): Promise<number[]> {
  const samples: number[] = [];
  const startTime = Date.now();

  /**
   * Read utime + stime (fields 14 + 15, 0-indexed 13 + 14) from /proc/pid/stat.
   * Returns total CPU ticks or null if unreadable.
   */
  async function readCpuTicks(): Promise<number | null> {
    try {
      const content = await readFile(`/proc/${pid}/stat`, 'utf8');
      // Fields are space-separated. The comm field (field 2) can contain spaces
      // and is wrapped in parens, so we split after the closing paren.
      const afterComm = content.slice(content.lastIndexOf(')') + 2);
      const fields = afterComm.split(' ');
      // After comm: field index 0 = state (field 3), so utime = index 11, stime = index 12
      const utime = parseInt(fields[11], 10);
      const stime = parseInt(fields[12], 10);
      if (Number.isNaN(utime) || Number.isNaN(stime)) return null;
      return utime + stime;
    } catch {
      return null;
    }
  }

  let prevTicks = await readCpuTicks();
  let prevTime = Date.now();

  if (prevTicks === null) {
    // Process doesn't exist — return zeros
    return Array.from({ length: Math.max(count, 1) }, () => 0);
  }

  for (let i = 0; i < count; i++) {
    // Check timeout before sleeping
    if (timeoutMs !== undefined && (Date.now() - startTime) >= timeoutMs) {
      break; // Return whatever samples we collected so far
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));

    // Check timeout after sleeping
    if (timeoutMs !== undefined && (Date.now() - startTime) >= timeoutMs) {
      break;
    }

    const currentTicks = await readCpuTicks();
    const currentTime = Date.now();

    if (currentTicks === null) {
      samples.push(0);
    } else {
      const tickDelta = currentTicks - prevTicks!;
      const timeDelta = (currentTime - prevTime) / 1000; // seconds
      // Ticks are in clock ticks (usually 100 Hz = USER_HZ)
      const cpuPercent = (tickDelta / (100 * timeDelta)) * 100;
      samples.push(Math.max(0, cpuPercent));
      prevTicks = currentTicks;
      prevTime = currentTime;
    }
  }

  return samples;
}

/**
 * Read process RSS from /proc/pid/status VmRSS field.
 * Returns MB. Returns 0 if unreadable.
 */
async function getProcessRss(pid: number): Promise<number> {
  try {
    const content = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = content.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (!match) return 0;
    return parseInt(match[1], 10) / 1024; // kB → MB
  } catch {
    return 0;
  }
}

/**
 * Read system free memory from /proc/meminfo MemAvailable field.
 * Returns MB.
 */
async function getSystemFreeMem(): Promise<number> {
  try {
    const content = await readFile('/proc/meminfo', 'utf8');
    const match = content.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (!match) return 0;
    return parseInt(match[1], 10) / 1024; // kB → MB
  } catch {
    return 0;
  }
}

/**
 * Read process state letter from /proc/pid/status.
 * Returns single letter (R/S/D/Z/T) or null if unreadable.
 */
async function readProcState(pid: number): Promise<string | null> {
  try {
    const content = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = content.match(/^State:\s+(\S)/m);
    if (!match) return null;
    return match[1];
  } catch {
    return null;
  }
}

/**
 * Read /proc/pid/wchan content.
 * Returns the wait channel name or null if unreadable.
 */
async function readProcWchan(pid: number): Promise<string | null> {
  try {
    const content = await readFile(`/proc/${pid}/wchan`, 'utf8');
    const trimmed = content.trim();
    // "0" means not waiting — treat as null
    if (trimmed === '0' || trimmed === '') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Get process runtime in seconds by reading /proc/pid/stat start time
 * and comparing to system uptime.
 */
async function getProcessRuntime(pid: number): Promise<number> {
  try {
    const [statContent, uptimeContent] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf8'),
      readFile('/proc/uptime', 'utf8'),
    ]);

    // starttime is field 22 (0-indexed 21) — after the comm field in parens
    const afterComm = statContent.slice(statContent.lastIndexOf(')') + 2);
    const fields = afterComm.split(' ');
    // After comm removal: field 0 = state (original 3), so starttime = index 19
    const startTimeTicks = parseInt(fields[19], 10);
    const uptimeSeconds = parseFloat(uptimeContent.split(' ')[0]);

    if (Number.isNaN(startTimeTicks) || Number.isNaN(uptimeSeconds)) return 0;

    // Convert start time from ticks to seconds (USER_HZ = 100 on Linux)
    const startTimeSeconds = startTimeTicks / 100;
    return Math.max(0, uptimeSeconds - startTimeSeconds);
  } catch {
    return 0;
  }
}

// ── DB-based stuck signal ──────────────────────────────────────────────────

/**
 * Query the opencode DB for a session's stuck status and return a StuckSignal.
 *
 * Maps isStuck() results to weighted signals:
 *   - waiting_for_user_input → 80 points (immediately stuck, no threshold)
 *   - child_stuck → 70 points (child stuck = parent should be killed)
 *   - long_running_command → 40 points
 *   - not_stuck → null (no signal)
 *
 * Fails gracefully: returns null if DB is unavailable or session not found.
 */
function getDbStuckSignal(session: string): StuckSignal | null {
  try {
    const sessionId = findSessionByTitle(session);
    if (sessionId === null) {
      return null;
    }

    const result = isStuck(sessionId);
    if (!result.stuck) {
      return null;
    }

    switch (result.reason) {
      case 'waiting_for_user_input':
        return {
          name: 'db_waiting_for_input',
          points: 80,
          detail: result.detail,
        };
      case 'child_stuck':
        return {
          name: 'db_child_stuck',
          points: 70,
          detail: result.detail,
        };
      case 'long_running_command':
        return {
          name: 'db_long_running',
          points: 40,
          detail: result.detail,
        };
      default:
        return null;
    }
  } catch {
    // DB unavailable — fail gracefully
    return null;
  }
}

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Full stuck assessment for a PID + session.
 * Calls I/O helpers → passes data to pure scorer → adds DB-based isStuck signal → returns assessment.
 */
async function computeStuckScore(pid: number, session: string): Promise<StuckAssessment> {
  const config = getConfig();
  const logFile = path.join(config.logDir, `gsd-${session}.log`);

  // Gather all signal data in parallel where possible
  const [logStaleness, processRss, systemFreeMb, procState, wchan, runtime] =
    await Promise.all([
      getLogStaleness(logFile),
      getProcessRss(pid),
      getSystemFreeMem(),
      readProcState(pid),
      readProcWchan(pid),
      getProcessRuntime(pid),
    ]);

  // CPU sampling is sequential by nature (needs time between samples)
  // Cap total sampling time at 3s to avoid long hangs
  const cpuSamples = await sampleCpu(pid, 3, 10_000, 3_000);

  // Score using pure function — messageCount: null so Signal 3 never fires
  let { score, signals } = scoreFromSignals({
    logStaleness,
    runtime,
    cpuSamples,
    messageCount: null,
    processRss,
    systemFreeMb,
    procState,
    wchan,
  });

  // Add DB-based stuck detection signal (replaces old message-count heuristic)
  const dbSignal = getDbStuckSignal(session);
  if (dbSignal !== null) {
    score += dbSignal.points;
    signals = [...signals, dbSignal];
  }

  const verdict: 'healthy' | 'suspect' | 'stuck' =
    score >= 70 ? 'stuck' : score >= 40 ? 'suspect' : 'healthy';

  return {
    pid,
    session,
    score,
    verdict,
    signals,
    runtime_seconds: runtime,
    log_staleness_seconds: logStaleness,
  };
}

/**
 * Fast stuck assessment — skips CPU sampling entirely.
 *
 * Used by `pilot status` for instant results. Computes all instantaneous
 * signals (log staleness, memory, proc state, wchan, runtime) but sets
 * cpuSamples to empty array so the scorer assumes active (maxCpu defaults to 100).
 *
 * Also queries the opencode DB for precise stuck detection via isStuck().
 *
 * This avoids the 30s hang from sampleCpu(3, 10_000) per process.
 */
async function computeStuckScoreFast(pid: number, session: string): Promise<StuckAssessment> {
  const config = getConfig();
  const logFile = path.join(config.logDir, `gsd-${session}.log`);

  // Gather all instantaneous signal data in parallel
  const [logStaleness, processRss, systemFreeMb, procState, wchan, runtime] =
    await Promise.all([
      getLogStaleness(logFile),
      getProcessRss(pid),
      getSystemFreeMem(),
      readProcState(pid),
      readProcWchan(pid),
      getProcessRuntime(pid),
    ]);

  // Score with no CPU samples — scorer defaults maxCpu to 100 (assume active)
  // messageCount: null so Signal 3 never fires
  let { score, signals } = scoreFromSignals({
    logStaleness,
    runtime,
    cpuSamples: [],       // Skip CPU sampling for speed
    messageCount: null,
    processRss,
    systemFreeMb,
    procState,
    wchan,
  });

  // Add DB-based stuck detection signal (replaces old message-count heuristic)
  const dbSignal = getDbStuckSignal(session);
  if (dbSignal !== null) {
    score += dbSignal.points;
    signals = [...signals, dbSignal];
  }

  const verdict: 'healthy' | 'suspect' | 'stuck' =
    score >= 70 ? 'stuck' : score >= 40 ? 'suspect' : 'healthy';

  return {
    pid,
    session,
    score,
    verdict,
    signals,
    runtime_seconds: runtime,
    log_staleness_seconds: logStaleness,
  };
}

// ── Daemon-Optimized Stuck Scorer ──────────────────────────────────────────

/**
 * Fast stuck assessment optimized for the daemon's 60-second check cycle.
 *
 * Checks 4 signal types (NO CPU sampling — too slow for periodic checks):
 *   1. Log staleness (max 50 points)
 *   2. Process state + wchan (max 80 points)
 *   3. Memory pressure (max 20 points)
 *   4. No output at all (max 40 points)
 *
 * Same thresholds as full scoring: ≥70 stuck, 40-69 suspect, <40 healthy.
 *
 * All /proc reads wrapped in try/catch — process may have just died.
 * Returns healthy if the process is unreadable (it will be reaped next cycle).
 */
async function computeDaemonStuckScore(
  pid: number,
  session: string,
  logFile: string,
  runtimeSeconds: number,
): Promise<DaemonStuckAssessment> {
  let score = 0;
  const signals: StuckSignal[] = [];

  try {
    // ── Signal 1: Log staleness (max 50 points) ──
    let logStaleness = Infinity;
    let logSize = 0;
    try {
      const logStat = await stat(logFile);
      logStaleness = (Date.now() - logStat.mtimeMs) / 1000;
      logSize = logStat.size;
    } catch {
      // Log file doesn't exist or unreadable — will be caught by Signal 4
    }

    if (logStaleness > 900 && runtimeSeconds > 900) {
      // 15min stale + 15min runtime → 30 points
      score += 30;
      signals.push({
        name: 'log_stale_15m',
        points: 30,
        detail: `Log stale ${Math.round(logStaleness / 60)}m`,
      });
    } else if (logStaleness > 300 && runtimeSeconds > 600) {
      // 5min stale + 10min runtime → 20 points
      score += 20;
      signals.push({
        name: 'log_stale_5m',
        points: 20,
        detail: `Log stale ${Math.round(logStaleness / 60)}m`,
      });
    }

    // ── Signal 2: Process state (max 80 points) ──
    const procState = await readProcState(pid);
    const wchan = await readProcWchan(pid);

    if (procState === 'T') {
      score += 50;
      signals.push({
        name: 'stopped',
        points: 50,
        detail: 'Process state: stopped (T)',
      });
    }

    if (procState === 'Z') {
      score += 80;
      signals.push({
        name: 'zombie',
        points: 80,
        detail: 'Process state: zombie (Z)',
      });
    }

    if (wchan && /read|wait|poll/.test(wchan) && runtimeSeconds > 600) {
      score += 30;
      signals.push({
        name: 'stdin_blocked',
        points: 30,
        detail: `wchan: ${wchan}`,
      });
    }

    // ── Signal 3: Memory pressure (max 20 points) ──
    const processRss = await getProcessRss(pid);
    const systemFreeMb = await getSystemFreeMem();

    if (processRss > 1024) {
      score += 10;
      signals.push({
        name: 'high_rss',
        points: 10,
        detail: `RSS ${processRss}MB`,
      });
    }

    if (systemFreeMb < 500) {
      score += 10;
      signals.push({
        name: 'low_system_mem',
        points: 10,
        detail: `System free ${systemFreeMb}MB`,
      });
    }

    // ── Signal 4: No output at all (max 40 points) ──
    if (runtimeSeconds > 300 && logSize === 0) {
      score += 40;
      signals.push({
        name: 'no_output',
        points: 40,
        detail: `No log output after ${Math.round(runtimeSeconds / 60)}m`,
      });
    }

    // ── Signal 5: DB-based stuck detection (replaces old message-count heuristic) ──
    const dbSignal = getDbStuckSignal(session);
    if (dbSignal !== null) {
      score += dbSignal.points;
      signals.push(dbSignal);
    }
  } catch {
    // Process may have died between checks — return healthy, will be reaped
    return { score: 0, verdict: 'healthy', signals: [], isFlaky: false };
  }

  // ── Verdict ──
  const verdict: 'healthy' | 'suspect' | 'stuck' =
    score >= 70 ? 'stuck' : score >= 40 ? 'suspect' : 'healthy';

  return { score, verdict, signals, isFlaky: false };
}

// ── Gap Closure Misconfiguration Detection ─────────────────────────────────

export interface GapClosureMisconfig {
  session: string;
  project: string;
  phase: number;
  summaryCount: number;
  originalPlanCount: number;
  detail: string;
}

/**
 * Detect if a session is running gap closure on an unexecuted phase.
 *
 * Parses the session title for gap closure patterns (--gaps, --gaps-only),
 * extracts the phase number, and checks whether the phase has enough
 * SUMMARY files to justify gap closure.
 *
 * Returns a GapClosureMisconfig if the phase lacks execution evidence,
 * or null if the session is not a gap closure session or the phase is valid.
 */
async function detectGapClosureMisconfig(
  session: string,
  projectDir: string,
): Promise<GapClosureMisconfig | null> {
  // Step 1: Check if session title matches gap closure patterns
  const isGapPlanning = session.includes('plan-phase') && session.includes('--gaps');
  const isGapExecution = session.includes('execute-phase') && session.includes('--gaps-only');

  if (!isGapPlanning && !isGapExecution) {
    return null; // Not a gap closure session
  }

  // Step 2: Extract phase number from session title
  const phaseMatch = /(?:plan-phase|execute-phase)\D*(\d+)/.exec(session);
  if (phaseMatch === null) {
    return null; // No phase number found
  }
  const phase = parseInt(phaseMatch[1]!, 10);

  // Step 3: Extract project name (everything before first -plan-phase or -execute-phase)
  const projectMatch = /^(.+?)-(?:plan-phase|execute-phase)/.exec(session);
  const extractedProject = projectMatch !== null ? projectMatch[1]! : session;

  // Step 4: Find phase directory
  const phaseDir = await findPhaseDir(projectDir, phase);
  if (phaseDir === null) {
    return null; // No phase dir found
  }

  // Step 5: Count non-gap plan files and summaries
  const originalPlanCount = await countNonGapPlanFiles(phaseDir);
  const summaryCount = await countSummaryFiles(phaseDir);

  // Step 6: If summaries < original plans → misconfiguration
  if (summaryCount < originalPlanCount) {
    return {
      session,
      project: extractedProject,
      phase,
      summaryCount,
      originalPlanCount,
      detail: `Gap closure on phase ${phase} but only ${summaryCount}/${originalPlanCount} original plans executed`,
    };
  }

  // Execution evidence exists, gap closure is valid
  return null;
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
  scoreFromSignals,
  getLogStaleness,
  sampleCpu,
  getProcessRss,
  getSystemFreeMem,
  readProcState,
  readProcWchan,
  computeStuckScore,
  computeStuckScoreFast,
  computeDaemonStuckScore,
  detectGapClosureMisconfig,
};
