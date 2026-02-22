/**
 * `pilot log [id]` — Session transcript from opencode DB.
 *
 * Smart default: if no ID, shows latest running job.
 * Looks up job from pilot.db, gets session titles, fetches messages.
 * --follow polls for new messages. --last N limits output.
 */

import { getJob, getQueue } from '../core/db.js';
import {
  findSessionByTitle,
  getSessionMessages,
} from '../core/opencode-db.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, cyan, green, yellow } from '../util/colors.js';
import type { SessionMessage } from '../core/types.js';

interface LogOptions {
  json?: boolean;
  follow?: boolean;
  last?: number;
}

/**
 * Collect all messages from sessions associated with a job.
 * Reads session titles from the job record and fetches messages
 * from each session via the opencode DB.
 */
function collectMessages(
  sessionTitles: string[],
  since?: number,
): SessionMessage[] {
  const allMessages: SessionMessage[] = [];

  for (const title of sessionTitles) {
    const sessionId = findSessionByTitle(title);
    if (!sessionId) continue;

    const messages = getSessionMessages(sessionId, since);
    allMessages.push(...messages);
  }

  // Sort by creation time across all sessions
  allMessages.sort((a, b) => a.createdAt - b.createdAt);
  return allMessages;
}

/**
 * Format a single message for human output.
 */
function formatMessage(msg: SessionMessage): string {
  const time = new Date(msg.createdAt).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const roleStr =
    msg.role === 'assistant'
      ? cyan('[assistant]')
      : msg.role === 'user'
        ? green('[user]')
        : yellow(`[${msg.role}]`);

  const content = msg.content.slice(0, 200).replace(/\n/g, ' ');
  return `  ${dim(time)}  ${roleStr} ${content}`;
}

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

  // Collect all messages
  const allMessages = collectMessages(sessionTitles);

  if (isJsonMode()) {
    outputJson({
      job: {
        id: job.id,
        project: job.project,
        scope: job.scope,
        description: job.description,
        status: job.status,
      },
      sessions: sessionTitles,
      messages: allMessages,
    });
    return;
  }

  // Header
  const desc =
    job.description.length > 50
      ? job.description.slice(0, 50) + '…'
      : job.description;
  outputHuman('');
  outputHuman(
    `  ${bold(job.project)} · ${job.scope} · "${desc}" · ${dim(job.id)}`,
  );
  outputHuman('');

  if (allMessages.length === 0 && !opts.follow) {
    outputHuman(`  ${dim('No messages yet')}`);
    if (sessionTitles.length === 0) {
      outputHuman(`  ${dim('(no sessions linked to this job)')}`);
    }
    outputHuman('');
    return;
  }

  // Apply --last filter
  const messages = opts.last
    ? allMessages.slice(-opts.last)
    : allMessages;

  for (const msg of messages) {
    outputHuman(formatMessage(msg));
  }

  outputHuman('');

  // --follow mode: poll for new messages
  if (opts.follow) {
    outputHuman(dim('  Following… (Ctrl-C to stop)'));
    let lastSeen =
      allMessages.length > 0
        ? allMessages[allMessages.length - 1].createdAt
        : 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 500));

      const newMsgs = collectMessages(sessionTitles, lastSeen);
      for (const msg of newMsgs) {
        outputHuman(formatMessage(msg));
        lastSeen = msg.createdAt;
      }
    }
  }
}

export { logCommand };
