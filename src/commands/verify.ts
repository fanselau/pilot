/**
 * pilot verify <project> <phase> — Automated UAT.
 *
 * Resolves project dir, spawns gsd-verify-auto with stdio: 'inherit'.
 * Supports --port flag.
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

export async function verifyCommand(
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

  const gsdCommand = 'gsd-verify-auto';
  let args = phase;
  if (opts['port']) args += ` --port ${String(opts['port'])}`;

  const title = truncateTitle(`${project}-${gsdCommand}-${sanitizeArgs(args)}`);

  const execArgs = args.includes('--')
    ? ['run', '--format', 'default', '--title', title, '--command', gsdCommand, '--', args]
    : ['run', '--format', 'default', '--title', title, '--command', gsdCommand, args];

  const result = await execa('opencode', execArgs, {
    cwd: dir,
    stdio: 'inherit',
    reject: false,
  });

  process.exit(result.exitCode ?? 0);
}
