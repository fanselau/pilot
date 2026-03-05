/**
 * `pilot projects` — List all registered managed projects.
 */

import { getAllProjects } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, dim, bold, yellow } from '../util/colors.js';

async function projectsCommand(): Promise<void> {
  const projects = getAllProjects();

  if (isJsonMode()) {
    outputJson({ projects });
    return;
  }

  if (projects.length === 0) {
    outputHuman(`  ${dim('No registered projects. Use: pilot setup <dir> --owner <key>')}`);
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Managed Projects')}`);
  outputHuman('');

  for (const p of projects) {
    const statusIcon = p.status === 'active' ? green('●') : red('●');
    const statusLabel = p.status === 'active' ? green('active') : red('BLOCKED');
    const shortPath = p.path.replace(process.env['HOME'] ?? '', '~');
    outputHuman(`  ${statusIcon} ${shortPath}`);
    outputHuman(`    ${dim('owner:')}  ${p.owner ?? dim('(none)')}`);
    outputHuman(`    ${dim('status:')} ${statusLabel}`);
    if (p.status === 'blocked' && p.blockedReason) {
      outputHuman(`    ${dim('reason:')} ${yellow(p.blockedReason.slice(0, 120))}`);
      outputHuman(`    ${dim('actions:')} pilot retry <id>  ·  pilot unblock "${shortPath}"`);
    }
    outputHuman('');
  }
}

export { projectsCommand };
