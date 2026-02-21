/**
 * pilot doctor — Health check: validate setup.
 *
 * Validates 9 aspects of the Pilot setup and reports pass/fail/warn.
 * Supports --fix to auto-repair fixable issues, and --json for machine output.
 */

import { runDoctor } from '../core/doctor.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';
import { green, red, yellow, bold } from '../util/colors.js';

interface DoctorOpts {
  json?: boolean;
  fix?: boolean;
}

/** Friendly display names for check names. */
const CHECK_LABELS: Record<string, string> = {
  binary: 'Binary',
  gsd_dir: 'GSD Dir',
  symlinks: 'Symlinks',
  git_gc: 'Git GC',
  memory: 'Memory',
  zombies: 'Zombies',
  stale_pids: 'Stale PIDs',
  queue: 'Queue',
  pilot_dir: 'Pilot Dir',
};

async function doctorCommand(opts: DoctorOpts): Promise<void> {
  const fix = opts.fix === true;
  const result = await runDoctor({ fix });

  // ── JSON mode ────────────────────────────────────────────────────────
  if (isJsonMode()) {
    outputJson({
      checks: result.checks,
      summary: {
        passed: result.passed,
        failed: result.failed,
        warnings: result.warnings,
      },
    });
    // Exit 1 if any check failed
    if (result.failed > 0) {
      process.exit(1);
    }
    return;
  }

  // ── Human mode ───────────────────────────────────────────────────────
  const sep = '─'.repeat(56);

  outputHuman(`${bold('Pilot Health Check')}`);
  outputHuman(sep);

  for (const check of result.checks) {
    const label = CHECK_LABELS[check.name] ?? check.name;

    let icon: string;
    let prefix = '';

    if (check.status === 'pass') {
      icon = green('✓');
      // Show if this was fixed
      if (fix && check.fixAction) {
        prefix = `${red('✗')} → ${green('✓')} `;
        icon = '';
      }
    } else if (check.status === 'fail') {
      icon = red('✗');
    } else {
      icon = yellow('⚠');
    }

    if (prefix) {
      outputHuman(`  ${prefix}${label}: ${check.message}`);
    } else {
      outputHuman(`  ${icon} ${label}: ${check.message}`);
    }
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

  // Exit 1 if any check failed
  if (result.failed > 0) {
    process.exit(1);
  }
}

export { doctorCommand };
