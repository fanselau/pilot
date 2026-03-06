/**
 * `pilot service <action>` — Systemd daemon management.
 *
 * Subcommands:
 *   install — Generate and install systemd user unit file
 *   start   — Start the pilot-runner service
 *   stop    — Stop the pilot-runner service
 *   status  — Show service status
 */

import { execa } from 'execa';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { getConfig } from '../core/config.js';
import { outputHuman } from '../util/output.js';
import { errMsg } from '../util/errors.js';
import { green, dim } from '../util/colors.js';

async function serviceCommand(action: string): Promise<void> {
  const unit = 'pilot-runner';

  switch (action) {
    case 'install': {
      const home = os.homedir();
      const unitDir = path.join(home, '.config', 'systemd', 'user');
      await mkdir(unitDir, { recursive: true });
      const pilotBin = process.argv[1]; // resolved pilot binary path
      const config = getConfig();
      const unitContent = `[Unit]
Description=Pilot Queue Runner
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${pilotBin} run --daemon
Restart=always
RestartSec=10
Environment=PATH=${process.env.PATH ?? ''}
WorkingDirectory=${config.projectDir}

[Install]
WantedBy=default.target
`;
      const unitPath = path.join(unitDir, `${unit}.service`);
      await writeFile(unitPath, unitContent);
      await execa('systemctl', ['--user', 'daemon-reload']);
      await execa('systemctl', ['--user', 'enable', unit]);
      outputHuman(`  ${green('✓')} Installed ${unitPath}`);
      outputHuman(`  ${dim('Run:')} pilot service start`);
      outputHuman('');
      outputHuman(`  ${dim('Warning: The systemd unit bakes in the current PATH.')}`);
      outputHuman(`  ${dim('If you update Node.js/Bun or change PATH, run:')}`);
      outputHuman(`  ${dim('  pilot service install')}`);
      outputHuman(`  ${dim('to regenerate the unit file.')}`);
      break;
    }
    case 'start':
      try {
        await execa('systemctl', ['--user', 'start', unit]);
        outputHuman(`  ${green('✓')} Started ${unit}`);
      } catch (err) {
        process.stderr.write(
          `Failed to start ${unit}: ${errMsg(err)}\n`,
        );
        process.exit(1);
      }
      break;
    case 'stop':
      try {
        await execa('systemctl', ['--user', 'stop', unit]);
        outputHuman(`  ${green('✓')} Stopped ${unit}`);
      } catch (err) {
        process.stderr.write(
          `Failed to stop ${unit}: ${errMsg(err)}\n`,
        );
        process.exit(1);
      }
      break;
    case 'status':
      try {
        const { stdout } = await execa('systemctl', ['--user', 'status', unit]);
        outputHuman(stdout);
      } catch (err) {
        // systemctl returns non-zero for inactive services
        if (err && typeof err === 'object' && 'stdout' in err) {
          outputHuman(String((err as Record<string, unknown>).stdout));
        } else {
          outputHuman(`  ${dim('Service not found or not running')}`);
        }
      }
      break;
    default:
      process.stderr.write(
        `Unknown action: ${action}. Use: install, start, stop, status\n`,
      );
      process.exit(2);
  }
}

export { serviceCommand };
