/**
 * pilot status — Dashboard: running, stuck, queued, completed.
 *
 * Default command when `pilot` is called with no args.
 * Supports compact (default), verbose (-v), and JSON (--json) modes.
 */

import Table from 'cli-table3';
import { getConfig } from '../core/config.js';
import { listSessions } from '../core/sessions.js';
import { getItems } from '../core/queue-store.js';
import { scanPidFiles, readPidFile, isProcessAlive, getProcessRuntime } from '../core/process.js';
import { computeStuckScoreFast } from '../core/stuck.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { formatDuration } from '../util/format.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';
import type {
  PilotStatusJson,
  SessionInfo,
  StuckSession,
  StuckAssessment,
  QueueJsonItem,
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

  // 4. Read queue from queue.json
  let queueEntries: QueueJsonItem[] = [];
  try {
    queueEntries = await getItems();
  } catch {
    // Queue file may not exist — that's fine
  }
  const pendingEntries = queueEntries.filter((e) => e.status === 'queued');

  // 5. Runner status — check BEFORE stuck detection to exclude runner PID
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

  // 6. Stuck detection — exclude queue runner PID, use fast scoring (no CPU sampling)
  const scorablePidEntries = runnerPid !== null
    ? pidEntries.filter((e) => e.pid !== runnerPid)
    : pidEntries;

  const stuckResults: StuckAssessment[] = [];
  for (const pidEntry of scorablePidEntries) {
    try {
      const assessment = await computeStuckScoreFast(pidEntry.pid, pidEntry.session);
      stuckResults.push(assessment);
    } catch {
      // Skip if process disappeared during scoring
    }
  }

  const stuckProcesses = stuckResults.filter((r) => r.verdict === 'stuck');
  const suspectProcesses = stuckResults.filter((r) => r.verdict === 'suspect');

  // 7. Completed sessions: not matched to PIDs, sorted by updated desc, take 5
  const completedSessions = sessions
    .filter((s) => !runningSessions.has(s.id))
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 5);

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    // Backward compat: map queue-store statuses to legacy QueueItem shape
    const queueItems: QueueItem[] = queueEntries.map((e) => ({
      status: (e.status === 'queued' ? 'pending' : e.status === 'completed' ? 'done' : e.status) as QueueItem['status'],
      project: e.project,
      mode: e.mode,
      args: e.description,        // old 'args' maps to 'description'
      description: e.description,
      line_num: 0,                // deprecated — always 0
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
