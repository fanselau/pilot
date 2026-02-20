/**
 * Custom React hook for TUI dashboard data fetching.
 *
 * Fetches all dashboard data (running sessions, queue, completed, runner status)
 * on a configurable interval using core/ data layer functions.
 *
 * Uses fast stuck scoring (log staleness + memory only, no CPU sampling)
 * to avoid the 30s delay per process that full computeStuckScore() requires.
 *
 * TUI module — depends on React. Only imported by tui/ components.
 */

import { useState, useEffect, useCallback } from 'react';
import type { QueueEntry, SessionInfo } from '../core/types.js';
import { listSessions } from '../core/sessions.js';
import { parseQueueFile } from '../core/queue-parser.js';
import { scanPidFiles, readPidFile, isProcessAlive, getProcessRuntime } from '../core/process.js';
import { scoreFromSignals, getLogStaleness, getProcessRss, getSystemFreeMem } from '../core/stuck.js';
import type { StuckScoreResult } from '../core/stuck.js';
import { getConfig } from '../core/config.js';
import path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunningSession {
  session: string;
  pid: number;
  runtimeSeconds: number;
  logStaleSeconds: number;
  score: number;
  verdict: string;
}

export interface RunnerStatus {
  active: boolean;
  pid: number | null;
}

export interface StatusSummary {
  running: number;
  stuck: number;
  queued: number;
  done: number;
  failed: number;
}

export interface StatusData {
  running: RunningSession[];
  queue: QueueEntry[];
  completed: SessionInfo[];
  runner: RunnerStatus;
  summary: StatusSummary;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetch all dashboard data on a configurable interval.
 *
 * @param opts.intervalMs - Refresh interval in milliseconds
 * @returns StatusData with running sessions, queue, completed, runner status, and summary counts
 */
export function useStatusData(opts: { intervalMs: number }): StatusData {
  const [running, setRunning] = useState<RunningSession[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [completed, setCompleted] = useState<SessionInfo[]>([]);
  const [runner, setRunner] = useState<RunnerStatus>({ active: false, pid: null });
  const [summary, setSummary] = useState<StatusSummary>({
    running: 0, stuck: 0, queued: 0, done: 0, failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const config = getConfig();

      // Fetch sessions + PID entries + queue in parallel
      const [sessions, pidEntries, queueEntries] = await Promise.all([
        listSessions().catch((): SessionInfo[] => []),
        scanPidFiles().catch((): Array<{ session: string; pid: number }> => []),
        parseQueueFile(config.queueFile).catch((): QueueEntry[] => []),
      ]);

      // Check runner status
      const runnerPid = await readPidFile('queue').catch(() => null);
      const runnerActive = runnerPid !== null && isProcessAlive(runnerPid);
      setRunner({ active: runnerActive, pid: runnerPid });

      // Build running sessions with quick stuck scoring
      const runningResults: RunningSession[] = [];
      const runningSessionNames = new Set<string>();

      for (const entry of pidEntries) {
        const logFile = path.join(config.logDir, `gsd-${entry.session}.log`);

        // Gather fast signals (all /proc reads, no CPU sampling)
        const [logStale, runtime, rss, freeMem] = await Promise.all([
          getLogStaleness(logFile).catch(() => 0),
          getProcessRuntime(entry.pid).catch(() => null),
          getProcessRss(entry.pid).catch(() => 0),
          getSystemFreeMem().catch(() => 4096),
        ]);

        const runtimeSeconds = runtime ?? 0;

        // Score with fast signals only (no CPU, no message count)
        const result: StuckScoreResult = scoreFromSignals({
          logStaleness: logStale,
          runtime: runtimeSeconds,
          cpuSamples: [],
          messageCount: null,
          processRss: rss,
          systemFreeMb: freeMem,
          procState: null,
          wchan: null,
        });

        runningResults.push({
          session: entry.session,
          pid: entry.pid,
          runtimeSeconds,
          logStaleSeconds: logStale,
          score: result.score,
          verdict: result.verdict,
        });

        runningSessionNames.add(entry.session);
      }

      setRunning(runningResults);

      // Filter completed sessions (not matched to PID files)
      const completedSessions = sessions
        .filter((s) => !runningSessionNames.has(s.title))
        .sort((a, b) => b.updated - a.updated)
        .slice(0, 10);
      setCompleted(completedSessions);

      // Set queue
      setQueue(queueEntries);

      // Build summary counts
      const stuckCount = runningResults.filter((r) => r.verdict === 'stuck').length;
      const queuedCount = queueEntries.filter((e) => e.status === 'pending').length;
      const doneCount = queueEntries.filter((e) => e.status === 'done').length;
      const failedCount = queueEntries.filter((e) => e.status === 'failed').length;

      setSummary({
        running: runningResults.length,
        stuck: stuckCount,
        queued: queuedCount,
        done: doneCount,
        failed: failedCount,
      });

      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch immediately on mount
    void fetchData();

    // Set up interval
    const timer = setInterval(() => {
      void fetchData();
    }, opts.intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [fetchData, opts.intervalMs]);

  return {
    running,
    queue,
    completed,
    runner,
    summary,
    loading,
    error,
    refresh: fetchData,
  };
}
