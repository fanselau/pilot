/**
 * Environment variable resolution with typed defaults.
 *
 * Resolves PILOT_* env vars with sensible defaults, expands ~ to homedir.
 * Pure core module — no UI dependencies.
 */

import os from 'node:os';
import path from 'node:path';
import type { PilotConfig } from './types.js';

function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return filepath.replace('~', os.homedir());
  }
  return filepath;
}

function getConfig(): PilotConfig {
  const home = os.homedir();

  const projectDir = expandTilde(
    process.env.PILOT_PROJECT_DIR ?? `${home}/dev/punchlab`,
  );

  const gsdDir = expandTilde(
    process.env.PILOT_GSD_DIR ?? `${home}/dev/punchlab/pilot-gsd`,
  );

  const stuckThresholdRaw = parseInt(process.env.PILOT_STUCK_THRESHOLD ?? '90', 10);
  const stuckThreshold = Number.isNaN(stuckThresholdRaw) ? 90 : stuckThresholdRaw;

  // Auto-detect maxParallel from system RAM: <32GB → 1, ≥32GB → 5
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const defaultMaxParallel = totalMemMb < 32768 ? 1 : 5;
  const maxParallelRaw = parseInt(process.env.PILOT_MAX_PARALLEL ?? '', 10);
  const maxParallel = Number.isNaN(maxParallelRaw) ? defaultMaxParallel : maxParallelRaw;

  const pollIntervalRaw = parseInt(process.env.PILOT_POLL_INTERVAL ?? '5', 10);
  const pollInterval = Math.max(1, Number.isNaN(pollIntervalRaw) ? 5 : pollIntervalRaw);

  const defaultTimeoutRaw = parseInt(process.env.PILOT_DEFAULT_TIMEOUT ?? '60', 10);
  const defaultTimeout = Number.isNaN(defaultTimeoutRaw) ? 60 : defaultTimeoutRaw;

  // Log level: DEBUG, INFO, WARN, ERROR (default INFO)
  const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
  type LogLevel = typeof validLogLevels[number];
  const logLevelRaw = (process.env.PILOT_LOG_LEVEL ?? 'INFO').toUpperCase();
  const logLevel: LogLevel = (validLogLevels as readonly string[]).includes(logLevelRaw)
    ? (logLevelRaw as LogLevel)
    : 'INFO';

  const noColor = process.env.NO_COLOR !== undefined;

  // Derived paths (not from env vars)
  const pilotDir = path.join(home, '.pilot');
  const pilotDbPath = path.join(pilotDir, 'pilot.db');

  return {
    pilotDir,
    pilotDbPath,
    projectDir,
    gsdDir,
    stuckThreshold,
    maxParallel,
    pollInterval,
    defaultTimeout,
    logLevel,
    noColor,
  };
}

export { getConfig };
