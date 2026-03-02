/**
 * `pilot setup <dir>` — Set up a project directory for Pilot.
 *
 * Creates .opencode/ with symlinks to pilot-gsd, generates opencode.json,
 * adds .opencode/ to .gitignore, and initializes git if needed.
 *
 * With --verify, checks an existing setup without modifying anything.
 */

import { setupProject, verifySetup } from '../core/setup.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';

interface SetupOptions {
  verify?: boolean;
}

async function setupCommand(dir: string, opts: SetupOptions): Promise<void> {
  if (opts.verify) {
    const result = await verifySetup(dir);

    if (isJsonMode()) {
      outputJson({ verify: result });
      return;
    }

    outputHuman('');
    outputHuman(`  ${bold('Setup Verification')}: ${dir}`);
    outputHuman('');
    for (const f of result.findings) {
      const icon =
        f.status === 'pass' ? green('✓') : f.status === 'fail' ? red('✗') : yellow('⚠');
      outputHuman(`  ${icon} ${f.label.padEnd(24)} ${dim(f.detail)}`);
    }
    outputHuman('');
    outputHuman(
      `  ${result.passed} passed, ${result.failed} failed, ${result.warnings} warnings`,
    );
    outputHuman('');

    if (result.failed > 0) {
      process.exit(1);
    }
    return;
  }

  const result = await setupProject(dir);

  if (isJsonMode()) {
    outputJson({ setup: result });
    return;
  }

  for (const item of result.created) {
    outputHuman(`  ${green('✓')} ${item}`);
  }
  for (const item of result.skipped) {
    outputHuman(`  ${dim('⊘')} ${item} ${dim('(skipped)')}`);
  }
  for (const item of result.errors) {
    outputHuman(`  ${red('✗')} ${item}`);
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

export { setupCommand };
