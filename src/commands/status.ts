/**
 * pilot status — Dashboard: running, stuck, queued, completed.
 *
 * Default command when `pilot` is called with no args.
 * Supports compact (default), verbose (-v), and JSON (--json) modes.
 */

import Table from 'cli-table3';
import { getConfig } from '../core/config.js';
import { listSessions } from '../core/sessions.js';
import { parseQueueFile } from '../core/queue-parser.js';
import { scanPidFiles, readPidFile, isProcessAlive, getProcessRuntime } from '../core/process.js';
import { computeStuckScore } from '../core/stuck.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { formatDuration } from '../util/format.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';
import type {
  PilotStatusJson,
  SessionInfo,
  StuckSession,
  StuckAssessment,
  QueueEntry,
  QueueItem,
} from '../core/types.js';

interface StatusOpts {
  json?: boolean;
  verbose?: boolean;
}

async function statusCommand(opts: StatusOpts): Promise<void> {
  const config = getConfig();

  // 1. List sessions
  const sessions = await listSessions();

  // 2. Scan PID files for running processes
  const pidEntries = await scanPidFiles();

  // 3. Cross-reference: sessions matched to PIDs are "running"
  const runningSessionInfos: SessionInfo[] = [];
  const runningSessions = new Set<string>();

  for (const pidEntry of pidEntries) {
    // Find session whose title contains the PID session name (case-insensitive)
    const matched = sessions.find((s) =>
      s.title.toLowerCase().includes(pidEntry.session.toLowerCase()),
    );
    if (matched) {
      runningSessionInfos.push(matched);
      runningSessions.add(matched.id);
    }
  }

  // 4. Parse queue
  let queueEntries: QueueEntry[] = [];
  try {
    queueEntries = await parseQueueFile(config.queueFile);
  } catch {
    // Queue file may not exist — that's fine
  }
  const pendingEntries = queueEntries.filter((e) => e.status === 'pending');

  // 5. Stuck detection on all PID entries
  const stuckResults: StuckAssessment[] = [];
  for (const pidEntry of pidEntries) {
    try {
      const assessment = await computeStuckScore(pidEntry.pid, pidEntry.session);
      stuckResults.push(assessment);
    } catch {
      // Skip if process disappeared during scoring
    }
  }

  const stuckProcesses = stuckResults.filter((r) => r.verdict === 'stuck');
  const suspectProcesses = stuckResults.filter((r) => r.verdict === 'suspect');

  // 6. Completed sessions: not matched to PIDs, sorted by updated desc, take 5
  const completedSessions = sessions
    .filter((s) => !runningSessions.has(s.id))
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 5);

  // 7. Runner status
  let runnerActive = false;
  let runnerPid: number | null = null;
  let runnerUptime: number | null = null;
  try {
    const queuePid = await readPidFile('queue');
    if (queuePid !== null && isProcessAlive(queuePid)) {
      runnerActive = true;
      runnerPid = queuePid;
      const runtime = await getProcessRuntime(queuePid);
      runnerUptime = runtime ?? null;
    }
  } catch {
    // No runner
  }

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    const queueItems: QueueItem[] = queueEntries.map((e) => ({
      status: e.status,
      project: e.project,
      mode: e.mode,
      args: e.args,
      description: e.description ?? '',
      line_num: e.lineNum,
    }));

    const stuckSessions: StuckSession[] = stuckProcesses.map((r) => {
      const session = sessions.find((s) =>
        s.title.toLowerCase().includes(r.session.toLowerCase()),
      );
      return {
        id: session?.id ?? '',
        title: session?.title ?? r.session,
        updated: session?.updated ?? 0,
        created: session?.created ?? 0,
        message_count: session?.message_count ?? 0,
        pid: r.pid,
        runtime_seconds: r.runtime_seconds,
        log_staleness_seconds: r.log_staleness_seconds,
        score: r.score,
        verdict: 'stuck' as const,
        signals: r.signals,
      };
    });

    const suspectSessions: StuckSession[] = suspectProcesses.map((r) => {
      const session = sessions.find((s) =>
        s.title.toLowerCase().includes(r.session.toLowerCase()),
      );
      return {
        id: session?.id ?? '',
        title: session?.title ?? r.session,
        updated: session?.updated ?? 0,
        created: session?.created ?? 0,
        message_count: session?.message_count ?? 0,
        pid: r.pid,
        runtime_seconds: r.runtime_seconds,
        log_staleness_seconds: r.log_staleness_seconds,
        score: r.score,
        verdict: 'suspect' as const,
        signals: r.signals,
      };
    });

    const data: PilotStatusJson = {
      timestamp: new Date().toISOString(),
      summary: {
        running: pidEntries.length,
        stuck: stuckProcesses.length,
        suspect: suspectProcesses.length,
        queued: pendingEntries.length,
        completed: completedSessions.length,
      },
      sessions: {
        running: runningSessionInfos,
        stuck: stuckSessions,
        suspect: suspectSessions,
      },
      queue: queueItems,
      completed: completedSessions,
      runner: {
        active: runnerActive,
        pid: runnerPid,
        uptime_seconds: runnerUptime,
      },
    };

    outputJson(data as unknown as Record<string, unknown>);
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`📊 ${bold('Pilot Status')}`);
  outputHuman(sep);
  outputHuman('');

  // Summary line
  const runCount = green(`${pidEntries.length} running`);
  const stuckCount = stuckProcesses.length > 0
    ? red(`${stuckProcesses.length} stuck`)
    : `${stuckProcesses.length} stuck`;
  const queueCount = pendingEntries.length > 0
    ? yellow(`${pendingEntries.length} queued`)
    : `${pendingEntries.length} queued`;
  outputHuman(`${runCount}  ${stuckCount}  ${queueCount}`);

  // ── Verbose mode: table with PID, runtime, log idle, score ───────────
  if (opts.verbose && pidEntries.length > 0) {
    outputHuman('');
    const table = new Table({
      head: ['PID', 'SESSION', 'RUNTIME', 'LOG IDLE', 'SCORE'],
      style: { head: [], border: [] },
    });

    for (const pidEntry of pidEntries) {
      const assessment = stuckResults.find((r) => r.pid === pidEntry.pid);
      table.push([
        String(pidEntry.pid),
        pidEntry.session,
        assessment ? formatDuration(assessment.runtime_seconds) : '?',
        assessment ? formatDuration(assessment.log_staleness_seconds) : '?',
        assessment ? String(assessment.score) : '?',
      ]);
    }

    outputHuman(table.toString());
  } else {
    // ── Compact mode ─────────────────────────────────────────────────
    if (pidEntries.length > 0) {
      outputHuman('');
      outputHuman(bold('Running'));
      for (const pidEntry of pidEntries) {
        outputHuman(`  ${green('●')} ${pidEntry.session}`);
      }
    }
  }

  // Queued
  if (pendingEntries.length > 0) {
    outputHuman('');
    outputHuman(bold('Queued'));
    const showCount = Math.min(pendingEntries.length, 5);
    for (let i = 0; i < showCount; i++) {
      outputHuman(`  ${dim('○')} ${pendingEntries[i]!.project}`);
    }
    const remaining = pendingEntries.length - showCount;
    if (remaining > 0) {
      outputHuman(dim(`  ... and ${remaining} more`));
    }
  }

  // Recently Completed
  if (completedSessions.length > 0) {
    outputHuman('');
    outputHuman(bold('Recently Completed'));
    for (const session of completedSessions) {
      outputHuman(`  ${green('✓')} ${session.title} ${dim('(done)')}`);
    }
  }
}

export { statusCommand };
