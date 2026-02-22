/**
 * `pilot config` — Show resolved configuration values.
 *
 * Displays all PilotConfig fields with their current values.
 * Supports --json for machine-readable output.
 */

import { getConfig } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim } from '../util/colors.js';

async function configCommand(): Promise<void> {
  const config = getConfig();

  if (isJsonMode()) {
    outputJson({ config });
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Pilot v2 Configuration')}`);
  outputHuman('');
  outputHuman(`  ${'pilotDir'.padEnd(22)} ${config.pilotDir}`);
  outputHuman(`  ${'pilotDbPath'.padEnd(22)} ${config.pilotDbPath}`);
  outputHuman(`  ${'projectDir'.padEnd(22)} ${config.projectDir}`);
  outputHuman(`  ${'gsdDir'.padEnd(22)} ${config.gsdDir}`);
  outputHuman(`  ${'stuckThreshold'.padEnd(22)} ${config.stuckThreshold} ${dim('minutes')}`);
  outputHuman(`  ${'maxParallel'.padEnd(22)} ${config.maxParallel}`);
  outputHuman(`  ${'pollInterval'.padEnd(22)} ${config.pollInterval} ${dim('seconds')}`);
  outputHuman(`  ${'defaultTimeout'.padEnd(22)} ${config.defaultTimeout} ${dim('minutes')}`);
  outputHuman(`  ${'logLevel'.padEnd(22)} ${config.logLevel}`);
  outputHuman(`  ${'noColor'.padEnd(22)} ${config.noColor}`);
  outputHuman('');
}

export { configCommand };
