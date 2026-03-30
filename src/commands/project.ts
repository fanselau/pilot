/**
 * `pilot project <path>` — Show or manage a registered project.
 *
 * Flags:
 *   (none)                       Show project info: status, routes, blocked reason, job counts
 *   --block                      Manually block a project with a reason
 *   --unblock                    Unblock a blocked project
 *   --notify-kimaki-channel      Set default kimaki channel for project notifications
 *   --notify-webhook             Set default webhook URL for project notifications
 *   --notify-telegram            Set default telegram chat for project notifications
 *   --clear-notify               Remove all project notification routes
 *   --jobs                       (nice-to-have) Show recent jobs for this project
 */

import {
  getProject,
  blockProject,
  unblockProject,
  updateProjectNotifyRoutes,
  getProjectJobCounts,
} from '../core/db.js';
import { resolveProjectDir } from '../core/config.js';
import { inspectProjectGsdState } from '../core/managed-gsd.js';
import type { NotifyRoute } from '../core/notify-backends/types.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { green, red, dim, bold, yellow } from '../util/colors.js';

interface ProjectOptions {
  block?: string;
  unblock?: boolean;
  jobs?: boolean;
  notifyKimakiChannel?: string;
  notifyWebhook?: string;
  notifyTelegram?: string;
  clearNotify?: boolean;
}

function formatRoutesSummary(routes: NotifyRoute[]): string {
  if (routes.length === 0) return 'none configured';
  return routes.map(r => {
    switch (r.kind) {
      case 'kimaki':
        if ('sessionId' in r && r.sessionId) return `kimaki (session: ${r.sessionId})`;
        if ('channelId' in r && r.channelId) return `kimaki (channel: ${r.channelId})`;
        return 'kimaki';
      case 'openclaw-agent-deliver':
        return `openclaw (agent: ${r.agentId})`;
      case 'webhook':
        return `webhook (${r.url})`;
      case 'telegram':
        return `telegram (chat: ${r.chatId})`;
      default:
        return (r as NotifyRoute).kind;
    }
  }).join(', ');
}

async function projectCommand(projectPath: string, opts: ProjectOptions): Promise<void> {
  const resolvedPath = resolveProjectDir(projectPath);
  const existing = getProject(resolvedPath);

  if (!existing) {
    process.stderr.write(`Project not registered: ${resolvedPath}\nRun: pilot setup ${projectPath}\n`);
    process.exit(1);
  }

  const routeFlagPresent =
    opts.notifyKimakiChannel !== undefined
    || opts.notifyWebhook !== undefined
    || opts.notifyTelegram !== undefined
    || opts.clearNotify;

  if (routeFlagPresent && (opts.block || opts.unblock)) {
    process.stderr.write('Route flags cannot be combined with --block or --unblock in the same command.\n');
    process.exit(2);
  }

  // Handle --clear-notify
  if (opts.clearNotify) {
    updateProjectNotifyRoutes(resolvedPath, []);

    if (isJsonMode()) {
      outputJson({ updated: true, project: resolvedPath, notifyRoutes: [] });
      return;
    }

    outputHuman(`  ${green('✓')} Cleared all notification routes: ${resolvedPath}`);
    return;
  }

  // Handle route additions (--notify-kimaki-channel, --notify-webhook, --notify-telegram)
  if (opts.notifyKimakiChannel || opts.notifyWebhook || opts.notifyTelegram) {
    let updatedRoutes: NotifyRoute[] = [...(existing.notifyRoutes ?? [])];

    if (opts.notifyKimakiChannel) {
      updatedRoutes = updatedRoutes.filter(r => r.kind !== 'kimaki');
      updatedRoutes.push({ kind: 'kimaki', channelId: opts.notifyKimakiChannel });
    }

    if (opts.notifyWebhook) {
      updatedRoutes = updatedRoutes.filter(r => r.kind !== 'webhook');
      updatedRoutes.push({ kind: 'webhook', url: opts.notifyWebhook });
    }

    if (opts.notifyTelegram) {
      updatedRoutes = updatedRoutes.filter(r => r.kind !== 'telegram');
      updatedRoutes.push({ kind: 'telegram', chatId: opts.notifyTelegram });
    }

    updateProjectNotifyRoutes(resolvedPath, updatedRoutes);

    if (isJsonMode()) {
      outputJson({ updated: true, project: resolvedPath, notifyRoutes: updatedRoutes });
      return;
    }

    outputHuman(`  ${green('✓')} Updated notification routes: ${resolvedPath}`);
    outputHuman(`  ${dim('notify:')}  ${formatRoutesSummary(updatedRoutes)}`);
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

  // Default: show project info
  const counts = getProjectJobCounts(resolvedPath);
  const gsdState = await inspectProjectGsdState(resolvedPath);
  const shortPath = resolvedPath.replace(process.env['HOME'] ?? '', '~');
  const routes = existing.notifyRoutes ?? [];

  if (isJsonMode()) {
    outputJson({
      project: {
        path: resolvedPath,
        notifyRoutes: routes,
        status: existing.status,
        blockedReason: existing.blockedReason,
        blockedAt: existing.blockedAt,
        createdAt: existing.createdAt,
        approvedGsdVersion: gsdState.approvedVersion,
        installedGsdVersion: gsdState.installedVersion,
        gsdDriftStatus: gsdState.driftStatus,
        gsdVersionCheckedAt: gsdState.checkedAt,
        gsdVersionError: gsdState.error,
        jobs: counts,
      },
    });
    return;
  }

  const statusIcon = existing.status === 'active' ? green('●') : red('●');
  const statusLabel = existing.status === 'active' ? green('active') : red('BLOCKED');

  outputHuman('');
  outputHuman(`  ${statusIcon} ${bold(shortPath)}`);
  outputHuman(`    ${dim('notify:')}  ${formatRoutesSummary(routes)}`);
  outputHuman(`    ${dim('status:')}  ${statusLabel}`);
  if (existing.status === 'blocked' && existing.blockedReason) {
    outputHuman(`    ${dim('reason:')}  ${yellow(existing.blockedReason.slice(0, 120))}`);
  }
  outputHuman(`    ${dim('jobs:')}    ${counts.pending} pending · ${counts.running} running · ${counts.failed} failed · ${counts.completed} done`);
  outputHuman(`    ${dim('approved gsd:')} ${gsdState.approvedVersion}`);
  outputHuman(`    ${dim('installed gsd:')} ${gsdState.installedVersion ?? 'unknown'}`);
  outputHuman(`    ${dim('drift:')} ${gsdState.driftStatus}`);
  if (gsdState.error) {
    outputHuman(`    ${dim('version note:')} ${gsdState.error || 'unknown / unreadable version'}`);
  }
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
