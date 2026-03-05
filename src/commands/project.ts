/**
 * `pilot project <path>` — Show or manage a registered project.
 *
 * Flags:
 *   (none)        Show project info: status, owner, blocked reason, job counts
 *   --block       Manually block a project with a reason
 *   --unblock     Unblock a blocked project
 *   --owner       Change project owner (session key)
 *   --jobs        (nice-to-have) Show recent jobs for this project
 */

import { getProject, blockProject, unblockProject, updateProjectOwner, getProjectJobCounts } from '../core/db.js';
import { resolveProjectDir } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, dim, bold, yellow } from '../util/colors.js';

interface ProjectOptions {
  block?: string;
  unblock?: boolean;
  owner?: string;
  jobs?: boolean;
}

async function projectCommand(projectPath: string, opts: ProjectOptions): Promise<void> {
  const resolvedPath = resolveProjectDir(projectPath);
  const existing = getProject(resolvedPath);

  if (!existing) {
    process.stderr.write(`Project not registered: ${resolvedPath}\nRun: pilot setup ${projectPath} --owner <agentId>\n`);
    process.exit(1);
  }

  // Handle --block
  if (opts.block) {
    blockProject(resolvedPath, opts.block);
    if (isJsonMode()) {
      outputJson({ blocked: true, project: resolvedPath, reason: opts.block });
      return;
    }
    outputHuman(`  ${red('●')} Blocked: ${resolvedPath}`);
    outputHuman(`  ${dim('reason:')} ${opts.block}`);
    return;
  }

  // Handle --unblock
  if (opts.unblock) {
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
    return;
  }

  // Handle --owner
  if (opts.owner) {
    updateProjectOwner(resolvedPath, opts.owner);
    if (isJsonMode()) {
      outputJson({ updated: true, project: resolvedPath, owner: opts.owner });
      return;
    }
    outputHuman(`  ${green('✓')} Updated owner: ${opts.owner}`);
    return;
  }

  // Default: show project info
  const counts = getProjectJobCounts(resolvedPath);
  const shortPath = resolvedPath.replace(process.env['HOME'] ?? '', '~');

  if (isJsonMode()) {
    outputJson({
      project: {
        path: resolvedPath,
        owner: existing.owner,
        status: existing.status,
        blockedReason: existing.blockedReason,
        blockedAt: existing.blockedAt,
        createdAt: existing.createdAt,
        jobs: counts,
      },
    });
    return;
  }

  const statusIcon = existing.status === 'active' ? green('●') : red('●');
  const statusLabel = existing.status === 'active' ? green('active') : red('BLOCKED');

  outputHuman('');
  outputHuman(`  ${statusIcon} ${bold(shortPath)}`);
  outputHuman(`    ${dim('owner:')}   ${existing.owner ?? dim('(none)')}`);
  outputHuman(`    ${dim('status:')}  ${statusLabel}`);
  if (existing.status === 'blocked' && existing.blockedReason) {
    outputHuman(`    ${dim('reason:')}  ${yellow(existing.blockedReason.slice(0, 120))}`);
  }
  outputHuman(`    ${dim('jobs:')}    ${counts.pending} pending · ${counts.running} running · ${counts.failed} failed · ${counts.completed} done`);

  if (existing.status === 'blocked') {
    outputHuman('');
    outputHuman(`  ${dim('actions:')} pilot project "${shortPath}" --unblock  ·  pilot retry <id>`);
  }
  outputHuman('');
}

export { projectCommand };
export type { ProjectOptions };
