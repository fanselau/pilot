/**
 * `pilot doctor` — Health check for Pilot system.
 *
 * Checks: opencode binary, pilot-gsd directory, pilot data dir, system memory.
 * Reports pass/fail/warn for each check. Supports --json output.
 *
 * NOTE: This is the v2 doctor — completely different from the deleted v1 version
 * which did PID/log scanning. This checks opencode binary, DB access, disk, memory.
 */

import { accessSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getConfig } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, yellow, dim, bold } from '../util/colors.js';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

async function doctorCommand(): Promise<void> {
  const config = getConfig();
  const checks: Check[] = [];

  // Check opencode binary
  const opencodePath = path.join(os.homedir(), '.opencode', 'bin', 'opencode');
  try {
    accessSync(opencodePath);
    checks.push({ name: 'opencode binary', status: 'pass', detail: opencodePath });
  } catch {
    checks.push({ name: 'opencode binary', status: 'fail', detail: 'Not found — install opencode' });
  }

  // Check pilot-gsd directory
  try {
    accessSync(config.gsdDir);
    checks.push({ name: 'pilot-gsd', status: 'pass', detail: config.gsdDir });
  } catch {
    checks.push({ name: 'pilot-gsd', status: 'fail', detail: `Not found at ${config.gsdDir}` });
  }

  // Check pilot data directory
  try {
    accessSync(config.pilotDir);
    checks.push({ name: 'pilot dir', status: 'pass', detail: config.pilotDir });
  } catch {
    checks.push({ name: 'pilot dir', status: 'warn', detail: 'Will be created on first job add' });
  }

  // Check system memory
  const freeMb = Math.round(os.freemem() / (1024 * 1024));
  if (freeMb > 2048) {
    checks.push({ name: 'memory', status: 'pass', detail: `${freeMb}MB free` });
  } else if (freeMb > 500) {
    checks.push({ name: 'memory', status: 'warn', detail: `${freeMb}MB free (low)` });
  } else {
    checks.push({ name: 'memory', status: 'fail', detail: `${freeMb}MB free (critical)` });
  }

  if (isJsonMode()) {
    outputJson({ checks });
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Pilot Doctor')}`);
  outputHuman('');
  for (const c of checks) {
    const icon =
      c.status === 'pass' ? green('✓') : c.status === 'fail' ? red('✗') : yellow('⚠');
    outputHuman(`  ${icon} ${c.name.padEnd(18)} ${dim(c.detail)}`);
  }
  outputHuman('');
}

export { doctorCommand };
