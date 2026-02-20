/**
 * pilot plan <project> <phase> — Plan a phase.
 *
 * Resolves project dir, spawns gsd-plan-phase with stdio: 'inherit'.
 * Supports --research, --skip-research, --gaps flags.
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

export async function planCommand(
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

  const gsdCommand = 'gsd-plan-phase';
  let args = `${phase} --auto`;
  if (opts['research']) args += ' --research';
  if (opts['skipResearch']) args += ' --skip-research';
  if (opts['gaps']) args += ' --gaps';

  const title = truncateTitle(`${project}-${gsdCommand}-${sanitizeArgs(args)}`);

  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', gsdCommand,
    '--', args,
  ], { cwd: dir, stdio: 'inherit', reject: false });

  process.exit(result.exitCode ?? 0);
}
