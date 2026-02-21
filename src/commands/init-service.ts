/**
 * pilot init-service — Generate systemd user service file.
 *
 * Creates ~/.config/systemd/user/pilot.service with the correct paths
 * and environment variables for running `pilot run` as a daemon.
 *
 * With --dry-run: prints what would be written without creating the file.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getConfig } from '../core/config.js';
import { isJsonMode, outputJson, outputHuman } from '../util/output.js';

export async function initServiceCommand(opts: Record<string, unknown>): Promise<void> {
  const config = getConfig();
  const home = os.homedir();
  const pilotBin = process.argv[1]!;
  const nodeBin = process.execPath;

  // Build PATH with all likely binary locations
  const pathParts = [
    path.join(home, '.opencode', 'bin'),
    path.dirname(nodeBin),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ];
  const fnmDir = path.join(home, '.local', 'share', 'fnm');
  if (existsSync(fnmDir)) {
    pathParts.unshift(path.join(fnmDir, 'aliases', 'default', 'bin'));
  }

  const pathEnv = pathParts.join(':');

  const serviceContent = `[Unit]
Description=Pilot Queue Runner
After=network.target

[Service]
Type=simple
ExecStart=${nodeBin} ${pilotBin} run
Restart=on-failure
RestartSec=10
Environment=PATH=${pathEnv}
Environment=HOME=${home}
Environment=PILOT_PROJECT_DIR=${config.projectDir}
Environment=PILOT_LOG_DIR=${config.logDir}

[Install]
WantedBy=default.target
`;

  const serviceDir = path.join(home, '.config', 'systemd', 'user');
  const servicePath = path.join(serviceDir, 'pilot.service');

  // --dry-run: show what would be created
  if (opts['dryRun'] === true) {
    if (isJsonMode()) {
      outputJson({ action: 'dry-run', path: servicePath, content: serviceContent });
    } else {
      outputHuman('Would write to: ' + servicePath);
      outputHuman('');
      outputHuman(serviceContent);
    }
    return;
  }

  // Create directory and write service file
  await mkdir(serviceDir, { recursive: true });
  await writeFile(servicePath, serviceContent, 'utf8');

  if (isJsonMode()) {
    outputJson({ action: 'created', path: servicePath });
  } else {
    outputHuman(`✓ Created ${servicePath}`);
    outputHuman('');
    outputHuman('Enable and start:');
    outputHuman('  systemctl --user daemon-reload');
    outputHuman('  systemctl --user enable pilot');
    outputHuman('  systemctl --user start pilot');
    outputHuman('');
    outputHuman('Check status:');
    outputHuman('  systemctl --user status pilot');
    outputHuman('  journalctl --user -u pilot -f');
  }
}
