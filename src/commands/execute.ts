/**
 * pilot execute <project> <phase> — Execute a phase.
 *
 * Resolves project dir, spawns gsd-execute-phase with stdio: 'inherit'.
 * Supports --gaps-only flag.
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

export async function executeCommand(
  project: string,
  phase: string,
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

  const gsdCommand = 'gsd-execute-phase';
  let args = `${phase} --auto`;
  if (opts['gapsOnly']) args += ' --gaps-only';

  const title = truncateTitle(`${project}-${gsdCommand}-${sanitizeArgs(args)}`);

  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', gsdCommand,
    '--', args,
  ], { cwd: dir, stdio: 'inherit', reject: false });

  process.exit(result.exitCode ?? 0);
}
