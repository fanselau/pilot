/**
 * pilot setup <dir> — Set up project for Pilot.
 *
 * Validates that pilot-gsd directory exists, then delegates to core/setup.ts
 * for the actual work. Renders results with human-friendly icons or JSON.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import { setupProject } from '../core/setup.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { green, red, dim } from '../util/colors.js';

interface SetupOpts {
  json?: boolean;
}

async function setupCommand(dir: string, opts: SetupOpts): Promise<void> {
  void opts; // used via isJsonMode()
  const config = getConfig();

  // Validate pilot-gsd directory exists
  try {
    await access(config.gsdDir);
  } catch {
    process.stderr.write(
      `Error: pilot-gsd not found at ${config.gsdDir}. Set PILOT_GSD_DIR or clone https://github.com/lucafanselau/pilot-gsd\n`,
    );
    process.exit(1);
  }

  const result = await setupProject(dir);
  const absDir = path.resolve(dir);

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    outputJson({
      dir: absDir,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
    });
    if (result.errors.length > 0) {
      process.exit(1);
    }
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  for (const item of result.created) {
    outputHuman(`${green('\u2713')} Created ${item}`);
  }

  for (const item of result.skipped) {
    outputHuman(`${dim('\u25CB')} Skipped ${item}`);
  }

  for (const item of result.errors) {
    outputHuman(`${red('\u2717')} Error: ${item}`);
  }

  outputHuman(`Setup complete: ${absDir}`);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

export { setupCommand };
