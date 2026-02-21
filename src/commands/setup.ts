/**
 * pilot setup <dir> — Set up project for Pilot.
 * pilot setup --verify <dir> — Re-check existing setup without modifying.
 *
 * Validates that pilot-gsd directory exists, then delegates to core/setup.ts
 * for the actual work. Renders results with human-friendly icons or JSON.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import { setupProject, verifySetup } from '../core/setup.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';

interface SetupOpts {
  json?: boolean;
  verify?: boolean;
}

async function setupCommand(dir: string, opts: SetupOpts): Promise<void> {
  // ── --verify mode ──────────────────────────────────────────────────────
  if (opts.verify === true) {
    const absDir = path.resolve(dir);
    const result = await verifySetup(absDir);

    if (isJsonMode()) {
      outputJson({
        dir: absDir,
        findings: result.findings,
        summary: {
          passed: result.passed,
          failed: result.failed,
          warnings: result.warnings,
        },
      });
      if (result.failed > 0) {
        process.exit(1);
      }
      return;
    }

    // Human mode
    const sep = '─'.repeat(56);
    outputHuman(`${bold('Pilot Setup Verification')}`);
    outputHuman(sep);

    for (const finding of result.findings) {
      let icon: string;
      if (finding.status === 'pass') {
        icon = green('\u2713');
      } else if (finding.status === 'fail') {
        icon = red('\u2717');
      } else {
        icon = yellow('\u26A0');
      }
      outputHuman(`  ${icon} ${finding.label}: ${finding.detail}`);
    }

    outputHuman('');
    const parts: string[] = [];
    parts.push(`${result.passed} passed`);
    if (result.failed > 0) {
      parts.push(red(`${result.failed} failed`));
    } else {
      parts.push(`${result.failed} failed`);
    }
    if (result.warnings > 0) {
      parts.push(yellow(`${result.warnings} warnings`));
    } else {
      parts.push(`${result.warnings} warnings`);
    }
    outputHuman(parts.join(', '));

    if (result.failed > 0) {
      process.exit(1);
    }
    return;
  }

  // ── Normal setup mode ────────────────────────────────────────────────
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
