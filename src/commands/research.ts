/**
 * pilot research <project> <phase> — Research a phase.
 *
 * Resolves project dir, spawns gsd-research-phase with stdio: 'inherit'.
 */

import { execa } from 'execa';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { getConfig } from '../core/config.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

export async function researchCommand(
  project: string,
  phase: string,
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

  const gsdCommand = 'gsd-research-phase';
  const title = truncateTitle(`${project}-${gsdCommand}-${phase}`);

  const result = await execa('opencode', [
    'run', '--format', 'default', '--title', title,
    '--command', gsdCommand, phase,
  ], { cwd: dir, stdio: 'inherit', reject: false });

  process.exit(result.exitCode ?? 0);
}
