/**
 * pilot remove <project> <N> — Remove future phase.
 *
 * Resolves project dir, spawns gsd-remove-phase with stdio: 'inherit'.
 */

import { execa } from 'execa';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

export async function removeCommand(
  project: string,
  n: string,
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

  const gsdCommand = 'gsd-remove-phase';
  const title = truncateTitle(`${project}-${gsdCommand}-${n}`);

  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', gsdCommand, n,
  ], { cwd: dir, stdio: 'inherit', reject: false });

  process.exit(result.exitCode ?? 0);
}
