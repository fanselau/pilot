/**
 * `pilot projects` — List all registered managed projects.
 *
 * Options:
 *   --blocked    Show only blocked projects
 */

import { getAllProjects, getProjectJobCounts } from '../core/db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, dim, bold, yellow } from '../util/colors.js';

async function projectsCommand(opts: { blocked?: boolean } = {}): Promise<void> {
  let projects = getAllProjects();

  if (opts.blocked) {
    projects = projects.filter(p => p.status === 'blocked');
  }

  if (isJsonMode()) {
    outputJson({ projects: projects.map(p => ({ ...p, jobs: getProjectJobCounts(p.path) })) });
    return;
  }

  if (projects.length === 0) {
    if (opts.blocked) {
      outputHuman(`  ${dim('No blocked projects.')}`);
    } else {
      outputHuman(`  ${dim('No registered projects. Use: pilot setup <dir> --owner <agentId>')}`);
    }
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold(opts.blocked ? 'Blocked Projects' : 'Managed Projects')}`);
  outputHuman('');

  for (const p of projects) {
    const statusIcon = p.status === 'active' ? green('●') : red('●');
    const statusLabel = p.status === 'active' ? green('active') : red('BLOCKED');
    const shortPath = p.path.replace(process.env['HOME'] ?? '', '~');
    const counts = getProjectJobCounts(p.path);
    outputHuman(`  ${statusIcon} ${shortPath}`);
    outputHuman(`    ${dim('owner:')}  ${p.owner ?? dim('(none)')}`);
    outputHuman(`    ${dim('status:')} ${statusLabel}`);
    if (p.status === 'blocked' && p.blockedReason) {
      outputHuman(`    ${dim('reason:')} ${yellow(p.blockedReason.slice(0, 120))}`);
      outputHuman(`    ${dim('actions:')} pilot retry <id>  ·  pilot unblock "${shortPath}"`);
    }
    outputHuman(`    ${dim('jobs:')}    ${counts.pending} pending · ${counts.running} running · ${counts.failed} failed`);
    outputHuman('');
  }
}

export { projectsCommand };
