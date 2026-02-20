/**
 * pilot todos <subcommand> [args...] — Todo management.
 *
 * Routes subcommands to correct gsd-* commands:
 *   list <project> [area] → gsd-check-todos
 *   add <project> <desc>  → gsd-add-todo
 */

import { execa } from 'execa';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

const subcommandMap: Record<string, string> = {
  'list': 'gsd-check-todos',
  'add': 'gsd-add-todo',
};

export async function todosCommand(
  subcommand: string,
  args: string[],
  opts: Record<string, unknown>,
): Promise<void> {
  void opts;

  const gsdCommand = subcommandMap[subcommand];
  if (!gsdCommand) {
    process.stderr.write(
      `Error: Unknown todos subcommand: ${subcommand}\n` +
      `Valid subcommands: ${Object.keys(subcommandMap).join(', ')}\n`,
    );
    process.exit(2);
  }

  // First arg is the project name
  const project = args[0];
  if (!project) {
    process.stderr.write(`Error: Missing project name. Usage: pilot todos ${subcommand} <project> [...]\n`);
    process.exit(2);
  }

  const config = getConfig();
  const dir = path.join(config.projectDir, project);

  try {
    await access(dir);
  } catch {
    process.stderr.write(`Error: Project directory not found: ${dir}\n`);
    process.exit(1);
  }

  // Remaining args after project
  const remainingArgs = args.slice(1);
  const gsdArgs = remainingArgs.join(' ');

  const title = truncateTitle(`${project}-${gsdCommand}${gsdArgs ? '-' + gsdArgs.replace(/\s+/g, '-') : ''}`);

  const execArgs = ['run', '--format', 'default', '--title', title, '--command', gsdCommand];
  if (gsdArgs) execArgs.push(gsdArgs);

  const result = await execa('opencode', execArgs, {
    cwd: dir,
    stdio: 'inherit',
    reject: false,
  });

  process.exit(result.exitCode ?? 0);
}
