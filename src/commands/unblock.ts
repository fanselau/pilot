/**
 * `pilot unblock <project>` — Unblock a project, allowing queued jobs to run.
 */

import { getProject, unblockProject } from '../core/db.js';
import { resolveProjectDir } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, dim } from '../util/colors.js';

async function unblockCommand(project: string): Promise<void> {
  const resolvedPath = resolveProjectDir(project);
  const existing = getProject(resolvedPath);

  if (!existing) {
    process.stderr.write(`Project not registered: ${resolvedPath}\nRun: pilot setup ${project}\n`);
    process.exit(1);
  }

  if (existing.status === 'active') {
    if (isJsonMode()) {
      outputJson({ unblocked: false, reason: 'already active', project: resolvedPath });
      return;
    }
    outputHuman(`  ${dim('⊘')} Project already active: ${resolvedPath}`);
    return;
  }

  unblockProject(resolvedPath);

  if (isJsonMode()) {
    outputJson({ unblocked: true, project: resolvedPath });
    return;
  }

  outputHuman(`  ${green('✓')} Unblocked: ${resolvedPath}`);
  outputHuman(`  ${dim('Queued jobs for this project will now run.')}`);
}

export { unblockCommand };
