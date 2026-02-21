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

  const queueFile = expandTilde(
    process.env.PILOT_QUEUE_FILE ?? `${home}/dev/QUEUE.md`,
  );

  const logDir = expandTilde(
    process.env.PILOT_LOG_DIR ?? '/tmp',
  );

  const stuckThreshold = parseInt(
    process.env.PILOT_STUCK_THRESHOLD ?? '90',
    10,
  );

  const projectDir = expandTilde(
    process.env.PILOT_PROJECT_DIR ?? `${home}/dev/punchlab`,
  );

  const gsdDir = expandTilde(
    process.env.PILOT_GSD_DIR ?? `${home}/dev/pilot-gsd`,
  );

  const noColor = process.env.NO_COLOR !== undefined;

  const pilotDir = path.join(home, '.pilot');
  const queueJsonFile = path.join(pilotDir, 'queue.json');

  return {
    queueFile,
    pilotDir,
    queueJsonFile,
    logDir,
    stuckThreshold: Number.isNaN(stuckThreshold) ? 90 : stuckThreshold,
    projectDir,
    gsdDir,
    noColor,
  };
}

export { getConfig };
