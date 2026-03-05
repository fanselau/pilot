/**
 * `pilot update` — Update pilot-gsd definitions via git pull.
 *
 * Runs `git pull` in the pilot-gsd directory to fetch latest
 * commands, agents, and workflow definitions.
 */

import { accessSync } from 'node:fs';
import { execa } from 'execa';
import { getConfig } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { errMsg } from '../util/errors.js';
import { green, red, dim } from '../util/colors.js';

async function updateCommand(): Promise<void> {
  const config = getConfig();

  // Verify gsd dir exists
  try {
    accessSync(config.gsdDir);
  } catch {
    process.stderr.write(`Error: pilot-gsd not found at ${config.gsdDir}\n`);
    process.stderr.write(`Set PILOT_GSD_DIR or clone the pilot-gsd repo.\n`);
    process.exit(1);
  }

  outputHuman(`  ${dim('Updating pilot-gsd...')}`);

  try {
    const { stdout } = await execa('git', ['pull'], { cwd: config.gsdDir });

    if (isJsonMode()) {
      outputJson({ updated: true, output: stdout });
      return;
    }

    outputHuman(`  ${stdout.trim()}`);
    outputHuman(`  ${green('✓')} pilot-gsd is current`);
  } catch (err) {
    if (isJsonMode()) {
      outputJson({
        updated: false,
        error: errMsg(err),
      });
      return;
    }

    process.stderr.write(
      `  ${red('✗')} git pull failed: ${errMsg(err)}\n`,
    );
    process.exit(1);
  }
}

export { updateCommand };
