/**
 * Telegram notification helper for Pilot daemon events.
 *
 * Fire-and-forget notifications — NEVER throws. All failures are logged to stderr.
 * Used for milestone pause notifications when a child phase job fails.
 *
 * Configuration via environment variables:
 *   PILOT_TELEGRAM_BOT_TOKEN  — Telegram bot token (from @BotFather)
 *   PILOT_TELEGRAM_CHAT_ID    — Chat/channel ID to send messages to
 *
 * Pure core module — no UI dependencies.
 */

import { getConfig } from './config.js';
import type { Job } from './types.js';

/**
 * Send a Telegram message via the Bot API.
 *
 * Reads bot token and chat ID from config. If either is not configured, returns false.
 * Uses built-in fetch() (Node.js 18+). Never throws — logs to stderr on failure.
 *
 * @param message - Markdown-formatted message text
 * @returns true if message was sent successfully, false otherwise
 */
async function sendTelegram(message: string): Promise<boolean> {
  try {
    const config = getConfig();
    const { telegramBotToken: token, telegramChatId: chatId } = config;

    if (!token || !chatId) {
      return false; // Not configured — silent skip
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    return resp.ok;
  } catch (err) {
    process.stderr.write(
      `[notify] sendTelegram failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return false;
  }
}

/**
 * Notify human via Telegram when a milestone pauses due to a child phase failure.
 *
 * Builds a Markdown message with:
 * - Milestone name, project, job ID
 * - Failed phase description, job ID, error
 * - Resume and skip commands for recovery
 *
 * @param milestoneJob - The paused milestone coordinator job
 * @param failedChildJob - The child phase job that failed
 * @returns true if notification was sent, false otherwise
 */
async function notifyMilestonePaused(milestoneJob: Job, failedChildJob: Job): Promise<boolean> {
  const milestoneName = milestoneJob.description;
  const project = milestoneJob.project;
  const milestoneId = milestoneJob.id;
  const failedPhaseDesc = failedChildJob.description;
  const failedPhaseId = failedChildJob.id;
  const errorSummary = failedChildJob.error ?? 'unknown error';

  const message = [
    `🔴 *Milestone Paused*`,
    ``,
    `*Milestone:* ${milestoneName}`,
    `*Project:* ${project}`,
    `*Milestone ID:* \`${milestoneId}\``,
    ``,
    `*Failed Phase:* ${failedPhaseDesc}`,
    `*Phase Job ID:* \`${failedPhaseId}\``,
    `*Error:* ${errorSummary.slice(0, 200)}`,
    ``,
    `*To resume* (retry failed phase):`,
    `\`pilot milestone resume ${milestoneId}\``,
    ``,
    `*To skip* (skip failed phase, continue):`,
    `\`pilot milestone skip ${milestoneId}\``,
  ].join('\n');

  return sendTelegram(message);
}

export { sendTelegram, notifyMilestonePaused };
