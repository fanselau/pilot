/**
 * pilot scope <project> <desc> — Add phase to roadmap.
 *
 * Resolves project dir, spawns gsd-add-phase with stdio: 'inherit'.
 * --build flag is deferred to Plan 04 (queue runner integration).
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

  if (opts['build']) {
    process.stderr.write('Note: --build flag requires queue runner (Plan 04). Running gsd-add-phase only.\n');
  }

  const gsdCommand = 'gsd-add-phase';
  const title = truncateTitle(`${project}-${gsdCommand}-${sanitizeArgs(desc)}`);

  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', gsdCommand, desc,
  ], { cwd: dir, stdio: 'inherit', reject: false });

  process.exit(result.exitCode ?? 0);
}
