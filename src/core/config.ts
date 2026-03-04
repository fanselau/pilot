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
    process.env.PILOT_GSD_DIR ?? `${home}/dev/pilot-gsd`,
  );

  const stuckThresholdRaw = parseInt(process.env.PILOT_STUCK_THRESHOLD ?? '90', 10);
  const stuckThreshold = Number.isNaN(stuckThresholdRaw) ? 90 : stuckThresholdRaw;

  // Auto-detect maxParallel from system RAM: <12GB → 1, <32GB → 2, <48GB → 3, ≥48GB → 4
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const defaultMaxParallel = totalMemMb < 12288 ? 1 : totalMemMb < 32768 ? 2 : totalMemMb < 49152 ? 3 : 4;
  const maxParallelRaw = parseInt(process.env.PILOT_MAX_PARALLEL ?? '', 10);
  const maxParallel = Number.isNaN(maxParallelRaw) ? defaultMaxParallel : maxParallelRaw;

  const pollIntervalRaw = parseInt(process.env.PILOT_POLL_INTERVAL ?? '5', 10);
  const pollInterval = Math.max(1, Number.isNaN(pollIntervalRaw) ? 5 : pollIntervalRaw);

  const defaultTimeoutRaw = parseInt(process.env.PILOT_DEFAULT_TIMEOUT ?? '60', 10);
  const defaultTimeout = Number.isNaN(defaultTimeoutRaw) ? 60 : defaultTimeoutRaw;

  const sessionMemoryMaxMbRaw = parseInt(process.env.PILOT_SESSION_MEMORY_MAX_MB ?? '8192', 10);
  const sessionMemoryMaxMb = Number.isNaN(sessionMemoryMaxMbRaw) ? 8192 : sessionMemoryMaxMbRaw;

  const reservedMemoryMbRaw = parseInt(process.env.PILOT_RESERVED_MEMORY_MB ?? '4096', 10);
  const reservedMemoryMb = Number.isNaN(reservedMemoryMbRaw) ? 4096 : reservedMemoryMbRaw;

  const memoryKillThresholdMbRaw = parseInt(process.env.PILOT_MEMORY_KILL_THRESHOLD_MB ?? '2048', 10);
  const memoryKillThresholdMb = Number.isNaN(memoryKillThresholdMbRaw) ? 2048 : memoryKillThresholdMbRaw;

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
    sessionMemoryMaxMb,
    reservedMemoryMb,
    memoryKillThresholdMb,
    logLevel,
    noColor,
  };
}

/**
 * Resolve a project argument to an absolute directory path.
 *
 * Resolution order (per requirements/robust-project-path-resolution.md):
 *   1. Absolute path  → use as-is
 *   2. Starts with ~  → expand tilde to home dir
 *   3. `.`, `./`, `../` → resolve relative to process.cwd()
 *   4. Otherwise     → shorthand name: path.join(config.projectDir, project)
 */
function resolveProjectDir(project: string): string {
  // 1. Absolute path
  if (path.isAbsolute(project)) {
    return project;
  }

  // 2. Tilde expansion
  if (project.startsWith('~')) {
    return expandTilde(project);
  }

  // 3. Relative path: `.`, `./something`, `../something`
  if (project === '.' || project.startsWith('./') || project.startsWith('../')) {
    return path.resolve(project);
  }

  // 4. Shorthand name — join with configured project dir
  return path.join(getConfig().projectDir, project);
}

export { getConfig, resolveProjectDir };
