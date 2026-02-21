/**
 * pilot scope <project> <desc> — Add phase to roadmap.
 *
 * Resolves project dir, spawns gsd-add-phase with stdio: 'inherit'.
 * With --build flag: also adds to queue.json and starts runner.
 */

import { execa } from 'execa';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';
import { addItem } from '../core/queue-store.js';
import { readPidFile, isProcessAlive } from '../core/process.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

function sanitizeArgs(args: string): string {
  return args
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function scopeCommand(
  project: string,
  desc: string,
  opts: Record<string, unknown>,
): Promise<void> {
  const config = getConfig();
  const dir = path.join(config.projectDir, project);

  try {
    await access(dir);
  } catch {
    process.stderr.write(`Error: Project directory not found: ${dir}\n`);
    process.exit(1);
  }

  const gsdCommand = 'gsd-add-phase';
  const title = truncateTitle(`${project}-${gsdCommand}-${sanitizeArgs(desc)}`);

  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', gsdCommand, desc,
  ], { cwd: dir, stdio: 'inherit', reject: false });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1);
  }

  // --build: also add to queue.json and start runner
  if (opts['build'] === true) {
    await addItem({
      project,
      mode: 'add-and-build',
      description: desc,
    });

    // Start runner if not active
    const runnerPid = await readPidFile('queue');
    const runnerAlive = runnerPid !== null && isProcessAlive(runnerPid);

    if (!runnerAlive) {
      try {
        const pilotBin = process.argv[1]!;
        const child = execa('node', [pilotBin, 'run'], {
          detached: true,
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'ignore',
        });
        child.unref();
      } catch {
        // Best effort
      }
    }
  }

  process.exit(0);
}
