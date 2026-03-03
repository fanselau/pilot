/**
 * `pilot log [id]` — Full session activity stream from opencode DB.
 *
 * Shows tool calls, patches, text, delegation/execution session sections.
 * Smart default: if no ID, shows latest running job.
 *
 * Flags:
 *   --follow     Poll for new parts in real-time
 *   --last N     Show last N parts
 *   --verbose    Show reasoning parts and full tool output
 *   --delegation Show ONLY delegation session(s)
 */

import { getJob, getQueue, getJobSteps } from '../core/db.js';
import {
  findSessionByTitle,
  getSessionParts,
  getChildSessions,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, cyan, green, yellow, red } from '../util/colors.js';
import type { SessionPart, JobStep } from '../core/types.js';

interface LogOptions {
  json?: boolean;
  follow?: boolean;
  last?: number;
  verbose?: boolean;
  delegation?: boolean;
  flat?: boolean;    // suppress child session expansion
  task?: number;     // show only the Nth child session (1-indexed)
}

// ── Session categorization ────────────────────────────────────────────────

interface CategorizedSession {
  title: string;
  sessionId: string | null;
  type: 'delegation' | 'execution';
  command?: string;   // extracted command for execution sessions
}

/**
 * Categorize session titles into delegation vs execution.
 * Delegation pattern: `pilot-delegate-{jobId}-N`
 * Everything else is execution.
 */
function categorizeSessions(sessionTitles: string[]): CategorizedSession[] {
  return sessionTitles.map((title) => {
    const isDelegation = title.startsWith('pilot-delegate-');
    const sessionId = findSessionByTitle(title);

    if (isDelegation) {
      return { title, sessionId, type: 'delegation' as const };
    }

    // Extract command from execution title: "{project}-{command}-{jobId}"
    // e.g. "resume-roast-quick-ab12" → command = "quick"
    const parts = title.split('-');
    // The last part is the jobId (4 chars), second-to-last is the command
    let command: string | undefined;
    if (parts.length >= 3) {
      command = parts[parts.length - 2];
    }

    return { title, sessionId, type: 'execution' as const, command };
  });
}

// ── Part formatting ───────────────────────────────────────────────────────

/**
 * Format a timestamp as HH:MM:SS.
 */
function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a single part for human output (compact, one line per part).
 */
function formatPart(part: SessionPart, verbose: boolean): string[] {
  const time = dim(formatTime(part.createdAt));
  const lines: string[] = [];

  if (part.type === 'tool') {
    const tool = part.tool ?? 'unknown';

    if (tool === 'bash') {
      const cmd = verbose
        ? (part.toolInput ?? '')
        : (part.toolInput ?? '').slice(0, 100);
      lines.push(`  ${time}  ${yellow(`[assistant] bash $ ${cmd}`)}`);
      // Show first 2 lines of output (dim, indented)
      if (part.toolOutput) {
        const output = verbose ? part.toolOutput : part.toolOutput.slice(0, 200);
        if (output.trim()) {
          lines.push(`  ${dim('             → ' + output.replace(/\n/g, '\n               '))}`);
        }
      }
    } else if (tool === 'read' || tool === 'write' || tool === 'edit') {
      lines.push(`  ${time}  ${yellow(`[assistant] ${tool} ${part.toolInput ?? ''}`)}`);
    } else if (tool === 'glob' || tool === 'grep') {
      const input = verbose
        ? (part.toolInput ?? '')
        : (part.toolInput ?? '').slice(0, 80);
      lines.push(`  ${time}  ${yellow(`[assistant] ${tool} ${input}`)}`);
    } else {
      const input = verbose
        ? (part.toolInput ?? '')
        : (part.toolInput ?? '').slice(0, 80);
      lines.push(`  ${time}  ${yellow(`[assistant] ${tool} ${input}`)}`);
    }
    return lines;
  }

  if (part.type === 'text') {
    const text = part.text ?? '';
    if (!text.trim()) return [];

    const roleStr = part.role === 'user'
      ? green('[user]')
      : cyan('[assistant]');
    const content = verbose
      ? text.replace(/\n/g, '\n               ')
      : text.slice(0, 200).replace(/\n/g, ' ');
    lines.push(`  ${time}  ${roleStr} ${content}`);
    return lines;
  }

  if (part.type === 'patch') {
    const files = part.patchFiles?.join(', ') ?? 'unknown';
    lines.push(`  ${time}  ${green(`[assistant] patch ${files}`)}`);
    return lines;
  }

  if (part.type === 'reasoning') {
    if (!verbose) return []; // Skip by default
    const text = part.text ?? '';
    if (!text.trim()) return [];
    const content = text.replace(/\n/g, '\n               ');
    lines.push(`  ${time}  ${dim(`[thinking] ${content}`)}`);
    return lines;
  }

  // step-start, step-finish — skip entirely
  return [];
}

// ── Step formatting ───────────────────────────────────────────────────

/**
 * Format duration in human-friendly form (Xs, Xm Ys).
 */
function formatStepDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Render a compact step summary for the human log output.
 */
function formatStepsSummary(steps: JobStep[]): string[] {
  if (steps.length === 0) return [];

  const lines: string[] = [];
  lines.push(`  ${dim('Steps:')}`);

  for (const step of steps) {
    const num = `${step.stepIndex + 1}.`;
    const cmd = step.command + (step.args ? ` ${step.args}` : '');
    const duration = formatStepDuration(step.durationMs);
    const durationStr = duration ? ` (${duration})` : '';

    let icon: string;
    let statusColor: (s: string) => string;
    switch (step.status) {
      case 'completed':
        icon = '✓';
        statusColor = green;
        break;
      case 'failed':
        icon = '✗';
        statusColor = red;
        break;
      case 'skipped':
        icon = '○';
        statusColor = dim;
        break;
      default: // running
        icon = '⟳';
        statusColor = yellow;
        break;
    }

    let verdictStr = '';
    if (step.verdictSource || step.verdictReason) {
      const parts: string[] = [];
      if (step.verdictSource) parts.push(step.verdictSource);
      if (step.verdictReason) {
        // Truncate long reasons
        const reason = step.verdictReason.length > 60
          ? step.verdictReason.slice(0, 57) + '...'
          : step.verdictReason;
        parts.push(reason);
      }
      verdictStr = ` [${parts.join(': ')}]`;
    }

    lines.push(`    ${statusColor(`${icon} ${num} ${cmd}${durationStr}${verdictStr}`)}`);
  }

  return lines;
}

// ── Child session rendering ───────────────────────────────────────────────

/**
 * Render child sessions for a parent session inline.
 * Used for expanding task tool parts to show subagent activity.
 */
function renderChildSessions(
  parentSessionId: string,
  verbose: boolean,
  indent: string = '    ',
  depth: number = 0,
): void {
  if (depth >= 2) return;  // max 2 levels

  const children = getChildSessions(parentSessionId);
  if (children.length === 0) return;

  for (const child of children) {
    // Extract agent type from title
    let agentType = 'subagent';
    const agentMatch = child.title.match(/gsd-(\w+(?:-\w+)*)/);
    if (agentMatch) agentType = agentMatch[0];

    outputHuman(`${indent}${dim(`── Subagent: ${agentType} ──`)}`);
    outputHuman('');

    const childParts = getSessionParts(child.id);
    if (childParts.length === 0) {
      outputHuman(`${indent}${dim('(no activity yet)')}`);
    } else {
      for (const part of childParts) {
        const lines = formatPart(part, verbose);
        for (const line of lines) {
          outputHuman(`${indent}${line}`);
        }
      }
      // Recurse into grandchildren
      renderChildSessions(child.id, verbose, indent + '  ', depth + 1);
    }
    outputHuman('');
  }
}

// ── Part collection ───────────────────────────────────────────────────────

/**
 * Collect parts from a set of categorized sessions.
 * Returns parts grouped by session for sectioned display.
 */
function collectSessionParts(
  sessions: CategorizedSession[],
  since?: number,
): Array<{ session: CategorizedSession; parts: SessionPart[] }> {
  const result: Array<{ session: CategorizedSession; parts: SessionPart[] }> = [];

  for (const session of sessions) {
    if (!session.sessionId) {
      result.push({ session, parts: [] });
      continue;
    }
    const parts = getSessionParts(session.sessionId, since);
    result.push({ session, parts });
  }

  return result;
}

// ── Main command ──────────────────────────────────────────────────────────

async function logCommand(
  idOrUndefined: string | undefined,
  opts: LogOptions,
): Promise<void> {
  let jobId = idOrUndefined;

  // Smart default: if no ID, show latest running job
  if (!jobId) {
    const queue = getQueue();
    const running = queue.find((j) => j.status === 'running');
    if (running) {
      jobId = running.id;
    } else {
      process.stderr.write(
        'No running jobs. Specify a job ID: pilot log <id>\n',
      );
      process.exit(1);
    }
  }

  const job = getJob(jobId);
  if (!job) {
    process.stderr.write(`Job not found: ${jobId}\n`);
    process.exit(1);
  }

  // Get session titles for this job
  let sessionTitles: string[] = [];
  if (job.sessionTitles) {
    try {
      sessionTitles = JSON.parse(job.sessionTitles) as string[];
    } catch {
      sessionTitles = [];
    }
  }

  // Categorize sessions
  const allSessions = categorizeSessions(sessionTitles);

  // Apply --delegation filter
  const sessions = opts.delegation
    ? allSessions.filter((s) => s.type === 'delegation')
    : allSessions;

  // Get step records for this job
  const steps = getJobSteps(jobId);

  // JSON mode
  if (isJsonMode()) {
    const sessionData = collectSessionParts(sessions);
    outputJson({
      job: {
        id: job.id,
        project: job.project,
        scope: job.scope,
        description: job.description,
        status: job.status,
      },
      steps,
      sessions: sessionData.map(({ session, parts }) => ({
        title: session.title,
        type: session.type,
        command: session.command,
        parts,
      })),
    });
    return;
  }

  // Human header
  const desc =
    job.description.length > 50
      ? job.description.slice(0, 50) + '…'
      : job.description;
  outputHuman('');
  outputHuman(
    `  ${bold(job.project)} · ${job.scope} · "${desc}" · ${dim(job.id)}`,
  );
  outputHuman('');

  // Step summary (if steps exist)
  if (steps.length > 0) {
    const stepLines = formatStepsSummary(steps);
    for (const line of stepLines) {
      outputHuman(line);
    }
    outputHuman('');
  }

  const verbose = opts.verbose ?? false;

  // --task N: show only the Nth child session across all sessions
  if (opts.task !== undefined) {
    let taskIndex = 0;
    let found = false;

    for (const sess of sessions) {
      if (!sess.sessionId) continue;
      const children = getChildSessions(sess.sessionId);
      for (const child of children) {
        taskIndex++;
        if (taskIndex === opts.task) {
          // Extract agent type from title
          let agentType = 'subagent';
          const agentMatch = child.title.match(/gsd-(\w+(?:-\w+)*)/);
          if (agentMatch) agentType = agentMatch[0];

          outputHuman('');
          outputHuman(`  ${bold(agentType)} · ${dim(child.title)}`);
          outputHuman('');

          const childParts = getSessionParts(child.id);
          if (childParts.length === 0) {
            outputHuman(`  ${dim('No activity yet')}`);
          } else {
            for (const part of childParts) {
              const lines = formatPart(part, verbose);
              for (const line of lines) {
                outputHuman(line);
              }
            }
          }
          outputHuman('');
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      process.stderr.write(`Task ${opts.task} not found. Use pilot log ${jobId} to see available tasks.\n`);
      process.exit(1);
    }
    return;
  }

  // "Waiting" state: job is running but no sessions yet
  if (job.status === 'running' && (sessionTitles.length === 0 || sessions.every((s) => s.sessionId === null))) {
    outputHuman(`  ${dim('Waiting for session to start...')}`);
    if (!opts.follow) {
      outputHuman('');
      return;
    }
  }

  // Collect and render parts by session
  const sessionData = collectSessionParts(sessions);
  let totalParts = 0;

  for (const { session, parts } of sessionData) {
    // Section header
    if (sessions.length > 1 || session.type === 'delegation') {
      const sectionLabel = session.type === 'delegation'
        ? `── Delegation ──`
        : `── Execution: ${session.command ?? 'unknown'} ──`;
      outputHuman(`  ${dim(sectionLabel)}`);
      outputHuman('');
    }

    if (parts.length === 0) {
      if (!opts.follow) {
        outputHuman(`  ${dim('(no activity yet)')}`);
        outputHuman('');
      }
      continue;
    }

    // Apply --last filter (per-session)
    const displayParts = opts.last ? parts.slice(-opts.last) : parts;

    for (const part of displayParts) {
      const lines = formatPart(part, verbose);
      for (const line of lines) {
        outputHuman(line);
      }

      // Expand child sessions for task parts (unless --flat)
      if (!opts.flat && part.type === 'tool' && part.tool === 'task' && session.sessionId) {
        renderChildSessions(session.sessionId, verbose, '    ');
      }
    }
    totalParts += displayParts.length;
    outputHuman('');
  }

  if (totalParts === 0 && !opts.follow) {
    outputHuman(`  ${dim('No activity yet')}`);
    outputHuman('');
    return;
  }

  // --follow mode: poll for new parts
  if (opts.follow) {
    outputHuman(dim('  Following… (Ctrl-C to stop)'));

    // Track lastSeen per session
    const lastSeenMap = new Map<string, number>();
    for (const { session, parts } of sessionData) {
      if (session.sessionId && parts.length > 0) {
        lastSeenMap.set(session.sessionId, parts[parts.length - 1].createdAt);
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 500));

      // Re-read session titles (new sessions may appear)
      let currentTitles: string[] = [];
      const updatedJob = getJob(jobId);
      if (updatedJob?.sessionTitles) {
        try {
          currentTitles = JSON.parse(updatedJob.sessionTitles) as string[];
        } catch {
          currentTitles = sessionTitles;
        }
      }

      const currentSessions = categorizeSessions(currentTitles);
      const filteredSessions = opts.delegation
        ? currentSessions.filter((s) => s.type === 'delegation')
        : currentSessions;

      for (const session of filteredSessions) {
        if (!session.sessionId) continue;

        const since = lastSeenMap.get(session.sessionId);
        const newParts = getSessionParts(session.sessionId, since);

        for (const part of newParts) {
          const lines = formatPart(part, verbose);
          for (const line of lines) {
            outputHuman(line);
          }
          lastSeenMap.set(session.sessionId, part.createdAt);
        }
      }
    }
  }
}

export { logCommand };
