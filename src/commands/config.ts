/**
 * pilot config — Display all resolved configuration values.
 *
 * Shows env var names with their resolved values.
 * Detects whether the opencode binary is available.
 */

import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { bold, dim } from '../util/colors.js';

interface ConfigOpts {
  json?: boolean;
}

async function configCommand(opts: ConfigOpts): Promise<void> {
  void opts; // used via isJsonMode()
  const config = getConfig();

  // Detect opencode binary
  let binaryFound = false;
  let binaryPath = '';

  // Check common locations (opencode first, claude as secondary detection)
  const candidatePaths = [
    path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
    path.join(os.homedir(), '.claude', 'bin', 'claude'),
  ];

  for (const candidate of candidatePaths) {
    try {
      await access(candidate);
      binaryFound = true;
      binaryPath = candidate;
      break;
    } catch {
      // Not at this location
    }
  }

  // Fallback: check if opencode is in PATH via which (try opencode first)
  if (!binaryFound) {
    try {
      const { execa } = await import('execa');
      const result = await execa('which', ['opencode']);
      if (result.stdout.trim()) {
        binaryFound = true;
        binaryPath = result.stdout.trim();
      }
    } catch {
      // Not in PATH
    }
  }

  if (!binaryFound) {
    try {
      const { execa } = await import('execa');
      const result = await execa('which', ['claude']);
      if (result.stdout.trim()) {
        binaryFound = true;
        binaryPath = result.stdout.trim();
      }
    } catch {
      // Not in PATH
    }
  }

  // Check if queue.json exists
  let queueJsonExists = false;
  try {
    await access(config.queueJsonFile);
    queueJsonExists = true;
  } catch {
    // Does not exist
  }

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    outputJson({
      config: {
        PILOT_DIR: config.pilotDir,
        PILOT_QUEUE_JSON: config.queueJsonFile,
        PILOT_QUEUE_FILE: config.queueFile,
        PILOT_LOG_DIR: config.logDir,
        PILOT_STUCK_THRESHOLD: config.stuckThreshold,
        PILOT_PROJECT_DIR: config.projectDir,
        PILOT_GSD_DIR: config.gsdDir,
        PILOT_MAX_PARALLEL: config.maxParallel,
        PILOT_LOG_LEVEL: config.logLevel,
        NO_COLOR: config.noColor ? 'set' : null,
      },
      queue_json: {
        path: config.queueJsonFile,
        exists: queueJsonExists,
      },
      opencode_binary: {
        found: binaryFound,
        path: binaryPath || null,
      },
    });
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);
  const COL = 23;

  outputHuman(bold('Pilot Configuration'));
  outputHuman(sep);

  outputHuman(`${'PILOT_DIR'.padEnd(COL)}${config.pilotDir}`);
  const queueJsonStatus = queueJsonExists ? dim('(exists)') : dim('(not created)');
  outputHuman(`${'queue.json'.padEnd(COL)}${config.queueJsonFile} ${queueJsonStatus}`);
  outputHuman(`${'PILOT_QUEUE_FILE'.padEnd(COL)}${config.queueFile} ${dim('(legacy)')}`);
  outputHuman(`${'PILOT_LOG_DIR'.padEnd(COL)}${config.logDir}`);
  outputHuman(
    `${'PILOT_STUCK_THRESHOLD'.padEnd(COL)}${config.stuckThreshold} ${dim('(minutes)')}`,
  );
  outputHuman(`${'PILOT_PROJECT_DIR'.padEnd(COL)}${config.projectDir}`);
  outputHuman(`${'PILOT_GSD_DIR'.padEnd(COL)}${config.gsdDir}`);
  outputHuman(
    `${'PILOT_MAX_PARALLEL'.padEnd(COL)}${config.maxParallel} ${dim('(auto-detected)')}`,
  );
  outputHuman(
    `${'PILOT_LOG_LEVEL'.padEnd(COL)}${config.logLevel}`,
  );
  outputHuman(
    `${'NO_COLOR'.padEnd(COL)}${config.noColor ? 'set' : dim('(not set)')}`,
  );

  const binaryStatus = binaryFound
    ? `${binaryPath} ${dim('(found)')}`
    : dim('(not found)');
  outputHuman(`${'opencode'.padEnd(COL)}${binaryStatus}`);
}

export { configCommand };
