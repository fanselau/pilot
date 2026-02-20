/**
 * pilot init <project> [desc] — Initialize new project.
 *
 * Special command: creates project directory if needed, runs setupProject
 * for .claude/ symlinks + claude.json, then spawns gsd-new-project.
 */

import { execa } from 'execa';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../core/config.js';
import { setupProject } from '../core/setup.js';

function truncateTitle(title: string, max = 80): string {
  return title.length > max ? title.slice(0, max) : title;
}

export async function initCommand(
  project: string,
  desc: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  const config = getConfig();
  const projectDir = path.join(config.projectDir, project);

  // Create project dir if needed
  await mkdir(projectDir, { recursive: true });

  // Run setup if .claude/ doesn't exist
  const claudeDir = path.join(projectDir, '.claude');
  try {
    await access(claudeDir);
  } catch {
    const result = await setupProject(projectDir);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        process.stderr.write(`Setup error: ${err}\n`);
      }
      process.exit(1);
    }
    for (const item of result.created) {
      process.stderr.write(`\u2713 ${item}\n`);
    }
  }

  // Build args for gsd-new-project
  const gsdArgs: string[] = [];
  if (opts['auto']) gsdArgs.push('--auto');
  if (desc) gsdArgs.push(desc);

  const title = truncateTitle(`${project}-new-project`);

  const execArgs = ['run', '--format', 'default', '--title', title, '--command', 'gsd-new-project'];
  if (gsdArgs.some(a => a.startsWith('--'))) {
    execArgs.push('--', ...gsdArgs);
  } else if (gsdArgs.length > 0) {
    execArgs.push(...gsdArgs);
  }

  const result = await execa('opencode', execArgs, {
    cwd: projectDir,
    stdio: 'inherit',
    reject: false,
  });

  process.exit(result.exitCode ?? 0);
}
