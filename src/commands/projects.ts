/**
 * `pilot projects` — List all registered managed projects.
 *
 * Options:
 *   --blocked    Show only blocked projects
 */

import { getAllProjects, getProjectJobCounts } from '../core/db.js';
import { inspectProjectGsdState } from '../core/managed-gsd.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, dim, bold, yellow } from '../util/colors.js';

async function projectsCommand(opts: { blocked?: boolean } = {}): Promise<void> {
  let projects = getAllProjects();

  if (opts.blocked) {
    projects = projects.filter(p => p.status === 'blocked');
  }

  const projectStates = await Promise.all(projects.map(async (project) => {
    const gsdState = await inspectProjectGsdState(project.path);
    return {
      ...project,
      approvedGsdVersion: gsdState.approvedVersion,
      installedGsdVersion: gsdState.installedVersion,
      gsdDriftStatus: gsdState.driftStatus,
      gsdVersionCheckedAt: gsdState.checkedAt,
      gsdVersionError: gsdState.error,
      jobs: getProjectJobCounts(project.path),
    };
  }));

  if (isJsonMode()) {
    outputJson({ projects: projectStates });
    return;
  }

  if (projectStates.length === 0) {
    if (opts.blocked) {
      outputHuman(`  ${dim('No blocked projects.')}`);
    } else {
      outputHuman(`  ${dim('No registered projects. Use: pilot setup <dir>')}`);
    }
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold(opts.blocked ? 'Blocked Projects' : 'Managed Projects')}`);
  outputHuman('');

  for (const p of projectStates) {
    const statusIcon = p.status === 'active' ? green('●') : red('●');
    const statusLabel = p.status === 'active' ? green('active') : red('BLOCKED');
    const shortPath = p.path.replace(process.env['HOME'] ?? '', '~');
    outputHuman(`  ${statusIcon} ${shortPath}`);
    const routeKinds = (p.notifyRoutes ?? []).map((r: { kind: string }) => r.kind).join(', ');
    outputHuman(`    ${dim('notify:')}  ${routeKinds || dim('none configured')}`);
    outputHuman(`    ${dim('status:')} ${statusLabel}`);
    if (p.status === 'blocked' && p.blockedReason) {
      outputHuman(`    ${dim('reason:')} ${yellow(p.blockedReason.slice(0, 120))}`);
      outputHuman(`    ${dim('actions:')} pilot unblock "${shortPath}"  ·  queue a new job with pilot add`);
    }
    outputHuman(`    ${dim('jobs:')}    ${p.jobs.pending} pending · ${p.jobs.running} running · ${p.jobs.failed} failed`);
    outputHuman(`    ${dim('gsd:')}     installed ${p.installedGsdVersion ?? 'unknown'} · drift ${p.gsdDriftStatus} · approved ${p.approvedGsdVersion}`);
    if (p.gsdVersionError) {
      outputHuman(`    ${dim('version note:')} ${p.gsdVersionError || 'unknown / unreadable version'}`);
    }
    outputHuman('');
  }
}

export { projectsCommand };
