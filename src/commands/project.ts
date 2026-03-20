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

import {
  getProject,
  blockProject,
  unblockProject,
  updateProjectOwner,
  updateProjectNotifyOpenClawRoute,
  getProjectJobCounts,
} from '../core/db.js';
import { resolveProjectDir } from '../core/config.js';
import { validateOpenClawDeliverRoute } from '../core/notify-route.js';
import type { OpenClawDeliverRoute } from '../core/types.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, dim, bold, yellow } from '../util/colors.js';

interface ProjectOptions {
  block?: string;
  unblock?: boolean;
  owner?: string;
  jobs?: boolean;
  notifyOpenclaw?: boolean;
  clearNotifyOpenclaw?: boolean;
  notifyAgent?: string;
  notifyChannel?: string;
  notifyTo?: string;
  notifyAccount?: string;
}

function usageError(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function formatRouteSummary(route: OpenClawDeliverRoute): string {
  const account = route.accountId ? route.accountId : '(none)';
  return `agent=${route.agentId} channel=${route.channel} to=${route.to} account=${account}`;
}

async function projectCommand(projectPath: string, opts: ProjectOptions): Promise<void> {
  const resolvedPath = resolveProjectDir(projectPath);
  const existing = getProject(resolvedPath);

  if (!existing) {
    process.stderr.write(`Project not registered: ${resolvedPath}\nRun: pilot setup ${projectPath} --owner <agentId>\n`);
    process.exit(1);
  }

  const routeFlagPresent =
    opts.notifyOpenclaw
    || opts.clearNotifyOpenclaw
    || opts.notifyAgent !== undefined
    || opts.notifyChannel !== undefined
    || opts.notifyTo !== undefined
    || opts.notifyAccount !== undefined;

  if (routeFlagPresent && (opts.block || opts.unblock || opts.owner)) {
    usageError('Route flags cannot be combined with --block, --unblock, or --owner in the same command.');
  }

  if ((opts.notifyAgent || opts.notifyChannel || opts.notifyTo || opts.notifyAccount) && !opts.notifyOpenclaw) {
    usageError('Route fields require --notify-openclaw. Example: pilot project <path> --notify-openclaw --notify-agent <id> --notify-channel <channel> --notify-to <target> [--notify-account <id>]');
  }

  if (opts.notifyOpenclaw && opts.clearNotifyOpenclaw) {
    usageError('Use either --notify-openclaw or --clear-notify-openclaw, not both.');
  }

  if (opts.clearNotifyOpenclaw && (opts.notifyAgent || opts.notifyChannel || opts.notifyTo || opts.notifyAccount)) {
    usageError('--clear-notify-openclaw cannot be combined with route fields.');
  }

  if (opts.notifyOpenclaw) {
    if (!opts.notifyAgent || !opts.notifyChannel || !opts.notifyTo) {
      usageError('Missing route fields. Use --notify-agent <id>, --notify-channel <channel>, and --notify-to <target> with --notify-openclaw.');
    }

    const validated = validateOpenClawDeliverRoute(
      {
        kind: 'openclaw-agent-deliver',
        agentId: opts.notifyAgent,
        channel: opts.notifyChannel,
        to: opts.notifyTo,
        ...(opts.notifyAccount ? { accountId: opts.notifyAccount } : {}),
      },
      'project notify route',
    );
    if (!validated.ok) {
      usageError(`Invalid notify route: ${validated.error.message}`);
    }

    updateProjectNotifyOpenClawRoute(resolvedPath, validated.route);

    if (isJsonMode()) {
      outputJson({
        updated: true,
        project: resolvedPath,
        notifyOpenclawRoute: validated.route,
      });
      return;
    }

    outputHuman(`  ${green('✓')} Updated OpenClaw notify route: ${resolvedPath}`);
    outputHuman(`  ${dim('notify:')}  ${formatRouteSummary(validated.route)}`);
    return;
  }

  if (opts.clearNotifyOpenclaw) {
    updateProjectNotifyOpenClawRoute(resolvedPath, null);

    if (isJsonMode()) {
      outputJson({
        updated: true,
        project: resolvedPath,
        notifyOpenclawRoute: null,
      });
      return;
    }

    outputHuman(`  ${green('✓')} Cleared OpenClaw notify route: ${resolvedPath}`);
    return;
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
        notifyOpenclawRoute: existing.notifyOpenClawRoute,
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
  if (existing.notifyOpenClawRoute) {
    outputHuman(`    ${dim('notify:')}  ${formatRouteSummary(existing.notifyOpenClawRoute)}`);
  } else {
    outputHuman(`    ${dim('notify:')}  ${dim('none configured')}`);
  }
  outputHuman(`    ${dim('status:')}  ${statusLabel}`);
  if (existing.status === 'blocked' && existing.blockedReason) {
    outputHuman(`    ${dim('reason:')}  ${yellow(existing.blockedReason.slice(0, 120))}`);
  }
  outputHuman(`    ${dim('jobs:')}    ${counts.pending} pending · ${counts.running} running · ${counts.failed} failed · ${counts.completed} done`);
  if (existing.defaultCategories && existing.defaultCategories.length > 0) {
    outputHuman(`    ${dim('categories:')} ${existing.defaultCategories.join(', ')}`);
  }

  if (existing.status === 'blocked') {
    outputHuman('');
    outputHuman(`  ${dim('actions:')} pilot project "${shortPath}" --unblock  ·  queue a new job with pilot add`);
  }
  outputHuman('');
}

export { projectCommand };
export type { ProjectOptions };
