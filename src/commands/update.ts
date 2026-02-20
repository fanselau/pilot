/**
 * pilot update — Update pilot-gsd definitions by running git pull.
 *
 * Validates that the pilot-gsd directory exists, runs `git pull` in it,
 * and reports the result. Supports --json output.
 */

import { access } from 'node:fs/promises';
import { execa } from 'execa';
import { getConfig } from '../core/config.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { green } from '../util/colors.js';

interface UpdateOpts {
  json?: boolean;
}

async function updateCommand(opts: UpdateOpts): Promise<void> {
  void opts; // used via isJsonMode()
  const config = getConfig();

  // Validate pilot-gsd directory exists
  try {
    await access(config.gsdDir);
  } catch {
    process.stderr.write(
      `Error: pilot-gsd not found at ${config.gsdDir}. Set PILOT_GSD_DIR or clone https://github.com/punchlab-dev/pilot-gsd\n`,
    );
    process.exit(1);
  }

  outputHuman('Updating pilot-gsd...');

  try {
    const result = await execa('git', ['pull'], { cwd: config.gsdDir });
    const output = result.stdout.trim();

    if (isJsonMode()) {
      outputJson({
        gsd_dir: config.gsdDir,
        git_output: output,
      });
      return;
    }

    outputHuman(output);
    outputHuman(`${green('\u2713')} pilot-gsd is current`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (isJsonMode()) {
      outputJson({
        gsd_dir: config.gsdDir,
        error: `git pull failed: ${message}`,
      });
      process.exit(1);
    }

    process.stderr.write(`Error: git pull failed: ${message}\n`);
    process.exit(1);
  }
}

export { updateCommand };
