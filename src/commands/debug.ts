/**
 * pilot debug <project> [desc] — Debug session.
 *
 * Resolves project dir, spawns gsd-debug with stdio: 'inherit'.
 */

import { execa } from 'execa';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

function sanitizeArgs(args: string): string {
  return args
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function debugCommand(
  project: string,
  desc: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  void opts;
  const config = getConfig();
  const dir = path.join(config.projectDir, project);

  try {
    await access(dir);
  } catch {
    process.stderr.write(`Error: Project directory not found: ${dir}\n`);
    process.exit(1);
  }

  const gsdCommand = 'gsd-debug';
  const titleSuffix = desc ? `-${sanitizeArgs(desc)}` : '';
  const title = truncateTitle(`${project}-${gsdCommand}${titleSuffix}`);

  const execArgs = ['run', '--format', 'default', '--title', title, '--command', gsdCommand];
  if (desc) execArgs.push(desc);

  const result = await execa('opencode', execArgs, {
    cwd: dir,
    stdio: 'inherit',
    reject: false,
  });

  process.exit(result.exitCode ?? 0);
}
