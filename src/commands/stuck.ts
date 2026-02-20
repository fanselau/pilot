/**
 * pilot stuck — Find stuck processes with weighted scoring.
 *
 * Scans PID files, runs stuck detection algorithm, displays results.
 * Supports --kill/--force to terminate stuck processes.
 */

import { createInterface } from 'node:readline';
import { getConfig } from '../core/config.js';
import { scanPidFiles, removePidFile } from '../core/process.js';
import { computeStuckScore } from '../core/stuck.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { formatDuration, truncateString } from '../util/format.js';
import { bold, red, yellow, dim } from '../util/colors.js';
import type { StuckAssessment } from '../core/types.js';

interface StuckOpts {
  json?: boolean;
  threshold?: string;
  kill?: boolean;
  force?: boolean;
}

async function stuckCommand(opts: StuckOpts): Promise<void> {
  const config = getConfig();
  const thresholdMinutes = opts.threshold
    ? parseInt(opts.threshold, 10)
    : config.stuckThreshold;

  // Scan PID files
  const pidEntries = await scanPidFiles();

  // Score each process
  const assessments: StuckAssessment[] = [];
  for (const pidEntry of pidEntries) {
    try {
      const assessment = await computeStuckScore(pidEntry.pid, pidEntry.session);
      assessments.push(assessment);
    } catch {
      // Process may have died during scoring
    }
  }

  const stuck = assessments.filter((a) => a.verdict === 'stuck');
  const suspect = assessments.filter((a) => a.verdict === 'suspect');

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    outputJson({
      threshold_minutes: thresholdMinutes,
      stuck: stuck.map(toJsonEntry),
      suspect: suspect.map(toJsonEntry),
    });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`${bold(`Stuck Processes`)} (threshold: ${thresholdMinutes}m)`);
  outputHuman(sep);

  if (stuck.length === 0 && suspect.length === 0) {
    outputHuman(dim('No stuck or suspect processes found.'));
    return;
  }

  // Stuck processes
  if (stuck.length > 0) {
    outputHuman(formatTable(stuck, red));
  }

  // Suspect processes
  if (suspect.length > 0) {
    outputHuman('');
    outputHuman(bold('Suspect (monitoring)'));
    outputHuman(formatTable(suspect, yellow));
  }

  // ── Kill mode ────────────────────────────────────────────────────────
  if (opts.kill && stuck.length > 0) {
    if (!opts.force) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          'Error: --kill requires --force when stdin is not a TTY\n',
        );
        process.exit(1);
      }

      const confirmed = await promptConfirmation(
        `Kill ${stuck.length} stuck process(es)? [y/N] `,
      );
      if (!confirmed) {
        outputHuman('Aborted.');
        return;
      }
    }

    for (const assessment of stuck) {
      try {
        process.kill(assessment.pid, 'SIGTERM');
        await removePidFile(assessment.session);
        outputHuman(`  Killed PID ${assessment.pid} (${assessment.session})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        outputHuman(`  Failed to kill PID ${assessment.pid}: ${msg}`);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTable(
  assessments: StuckAssessment[],
  colorFn: (s: string) => string,
): string {
  const header = `${'PID'.padEnd(9)}${'SESSION'.padEnd(26)}${'RUNTIME'.padEnd(13)}${'LOG IDLE'.padEnd(15)}SCORE`;
  const lines = [header];

  for (const a of assessments) {
    const pid = String(a.pid).padEnd(9);
    const session = truncateString(a.session, 24).padEnd(26);
    const runtime = formatDuration(a.runtime_seconds).padEnd(13);
    const logIdle = formatDuration(a.log_staleness_seconds).padEnd(15);
    const score = colorFn(String(a.score));
    lines.push(`${pid}${session}${runtime}${logIdle}${score}`);
  }

  return lines.join('\n');
}

function toJsonEntry(a: StuckAssessment): Record<string, unknown> {
  return {
    pid: a.pid,
    session: a.session,
    runtime_seconds: a.runtime_seconds,
    log_staleness_seconds: a.log_staleness_seconds,
    score: a.score,
    verdict: a.verdict,
    signals: a.signals,
  };
}

function promptConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export { stuckCommand };
