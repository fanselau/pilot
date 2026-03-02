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

import { getJob, getQueue } from '../core/db.js';
import {
  findSessionByTitle,
  getSessionParts,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, cyan, green, yellow } from '../util/colors.js';
import type { SessionPart } from '../core/types.js';

interface LogOptions {
  json?: boolean;
  follow?: boolean;
  last?: number;
  verbose?: boolean;
  delegation?: boolean;
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
  const verbose = opts.verbose ?? false;
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
