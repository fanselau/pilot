/**
 * `pilot doctor` — Health check for Pilot system.
 *
 * Checks: opencode binary, pilot-gsd directory, pilot data dir, system memory.
 * Reports pass/fail/warn for each check. Supports --json output.
 *
 * NOTE: This is the v2 doctor — completely different from the deleted v1 version
 * which did PID/log scanning. This checks opencode binary, DB access, disk, memory.
 */

import { accessSync, readFileSync, statSync } from 'node:fs';
import { execaSync } from 'execa';
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

  // Check config file
  const configPath = path.join(config.pilotDir, 'config.json');
  try {
    accessSync(configPath);
    // File exists — check valid JSON
    try {
      const raw = readFileSync(configPath, 'utf8');
      JSON.parse(raw);
      // Check permissions (warn if world/group readable — may expose tokens)
      const stats = statSync(configPath);
      const mode = stats.mode & 0o777;
      if ((mode & 0o044) !== 0) {
        checks.push({
          name: 'config file',
          status: 'warn',
          detail: `${configPath} — world/group readable (mode: ${mode.toString(8)}), may expose tokens. Run: chmod 600 ${configPath}`,
        });
      } else {
        checks.push({ name: 'config file', status: 'pass', detail: configPath });
      }
    } catch (parseErr) {
      checks.push({
        name: 'config file',
        status: 'fail',
        detail: `${configPath} — invalid JSON: ${(parseErr as Error).message}`,
      });
    }
  } catch {
    checks.push({
      name: 'config file',
      status: 'warn',
      detail: 'No config file — using defaults. Run: pilot config init',
    });
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

  // Check cgroups v2 availability (required for systemd-run memory limits)
  try {
    const mountResult = execaSync('mount', [], { reject: false });
    const hasCgroup2 = mountResult.stdout.includes('cgroup2');
    if (hasCgroup2) {
      checks.push({ name: 'cgroups v2', status: 'pass', detail: 'cgroup2 mounted' });
    } else {
      checks.push({
        name: 'cgroups v2',
        status: 'warn',
        detail: 'cgroup2 not mounted — systemd-run memory limits will not work (Ubuntu 20.04 or older)',
      });
    }
  } catch {
    checks.push({
      name: 'cgroups v2',
      status: 'warn',
      detail: 'cgroup2 not mounted — systemd-run memory limits will not work (Ubuntu 20.04 or older)',
    });
  }

  // Check user lingering (required for systemd-run --user without active login session)
  // Use os.userInfo().username — reliable in all execution contexts including systemd services
  // (process.env.USER can be empty in systemd service contexts)
  try {
    const username = os.userInfo().username;
    // Use array-form execa to prevent command injection via username
    const result = execaSync('loginctl', ['show-user', username, '--property=Linger'], {
      reject: false,
    });
    const lingerOutput = result.exitCode === 0 ? result.stdout.trim() : 'Linger=unknown';
    if (lingerOutput.includes('Linger=yes')) {
      checks.push({ name: 'user lingering', status: 'pass', detail: 'Enabled via loginctl' });
    } else {
      checks.push({
        name: 'user lingering',
        status: 'warn',
        detail: `Not enabled (${lingerOutput}) — run: loginctl enable-linger ${username}`,
      });
    }
  } catch {
    checks.push({
      name: 'user lingering',
      status: 'warn',
      detail: 'Could not check — run: loginctl enable-linger $USER',
    });
  }

  // Show resource management configuration
  const sessionMb = config.sessionMemoryMaxMb;
  const reservedMb = config.reservedMemoryMb;
  const killMb = config.memoryKillThresholdMb;
  checks.push({
    name: 'resource limits',
    status: 'pass',
    detail: `session cap: ${sessionMb}MB | reserved: ${reservedMb}MB | kill threshold: ${killMb}MB`,
  });

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
