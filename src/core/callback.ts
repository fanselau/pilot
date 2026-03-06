/**
 * Job completion callback — OpenClaw session wake via /hooks/agent webhook.
 *
 * Fire-and-forget notifications — NEVER throws. All failures are logged to stderr.
 * Used to wake dormant OpenClaw sessions when a pilot job completes or fails.
 *
 * Configuration:
 *   PILOT_OPENCLAW_HOOKS_URL   — base webhook URL (default: http://127.0.0.1:18789/hooks/agent)
 *   PILOT_OPENCLAW_HOOKS_TOKEN — auth token for the hooks endpoint
 *
 * Pure core module — no UI dependencies.
 */

import { getConfig } from './config.js';
import { errMsg } from '../util/errors.js';
import type { Job } from './types.js';

/**
 * Private IP patterns to reject for custom callback URLs.
 * Prevents SSRF attacks against internal services.
 */
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/127\./,
  /^https?:\/\/localhost([:\/]|$)/i,
  /^https?:\/\/0\.0\.0\.0([:\/]|$)/,
  /^https?:\/\/\[::1\]/,
];

/**
 * Validate that a custom callback URL is safe to call.
 * Returns null if valid, or an error message string if rejected.
 */
function validateCallbackUrl(url: string): string | null {
  if (!url.startsWith('https://')) {
    return 'non-HTTPS callback URL';
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(url)) {
      return 'private IP callback URL';
    }
  }
  return null;
}

/**
 * Notify the originating OpenClaw session that a job has completed or failed.
 *
 * Fire-and-forget: returns true on success, false on failure. NEVER throws.
 *
 * Sends POST to job.callbackUrl (or falls back to PILOT_OPENCLAW_HOOKS_URL).
 * If neither is configured, returns false silently.
 *
 * For milestone coordinator jobs (scope === 'milestone'), skips notification
 * since they just spawn children — the children carry the real work.
 *
 * @param job - The completed/failed job (must have completedAt set)
 * @returns true if webhook was sent successfully, false otherwise
 */
async function notifyJobCompletion(job: Job): Promise<boolean> {
  try {
    // Don't notify for milestone coordinator jobs
    if (job.scope === 'milestone') return false;

    const config = getConfig();
    const url = job.callbackUrl ?? config.openclawHooksUrl;
    const token = config.openclawHooksToken;

    // No URL configured — silent skip
    if (!url) return false;

    // Determine if this is a trusted URL (matches configured openclawHooksUrl)
    const isTrustedUrl = url === config.openclawHooksUrl;

    // Validate custom (non-trusted) callback URLs
    if (!isTrustedUrl) {
      const validationError = validateCallbackUrl(url);
      if (validationError) {
        process.stderr.write(`[callback] Rejecting ${validationError}: ${url}\n`);
        return false;
      }
    }

    // Calculate duration
    const duration = formatDuration(job.startedAt, job.completedAt);

    // Extract judge verdict if available
    let verdict: { verdict: string; confidence: number; reason: string } | null = null;
    if (job.judgeVerdict) {
      try {
        verdict = JSON.parse(job.judgeVerdict) as { verdict: string; confidence: number; reason: string };
      } catch { /* ignore parse errors */ }
    }

    // callbackSessionKey now stores just the agent ID (e.g. "main")
    const agentId = job.callbackSessionKey;
    if (!agentId) return false;

    // Build message
    const lines = [
      `🏗️ Pilot job ${job.id} (${job.scope}) ${job.status}.`,
      `Project: ${job.project}`,
      `Description: ${job.description.length > 100 ? job.description.slice(0, 100) + '…' : job.description}`,
      `Duration: ${duration}`,
    ];
    if (job.error) {
      lines.push(`Error: ${job.error.slice(0, 200)}`);
    }
    if (verdict?.reason) {
      lines.push(`Verdict: ${verdict.verdict} (confidence: ${verdict.confidence}%)`);
      lines.push(`Reason: ${verdict.reason.slice(0, 300)}`);
    }
    lines.push(`Notify session: agent:${agentId}:main`);

    const body: Record<string, unknown> = {
      message: lines.join('\n'),
      name: 'Pilot',
      agentId,
      sessionKey: `hook:pilot:${job.id}`,
      deliver: false,
      wakeMode: 'now',
    };
    if (verdict) {
      body.verdict = verdict.verdict;
      body.confidence = verdict.confidence;
      body.reason = verdict.reason;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // Only send auth token to trusted openclawHooksUrl — never to custom URLs
    if (token && isTrustedUrl) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    return resp.ok;
  } catch (err) {
    process.stderr.write(
      `[callback] notifyJobCompletion failed for job ${job.id}: ${errMsg(err)}\n`,
    );
    return false;
  }
}

/**
 * Format duration from startedAt to completedAt as human-readable string.
 * Returns "unknown" if either timestamp is missing.
 */
function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return 'unknown';
  try {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0 || Number.isNaN(ms)) return 'unknown';
    const totalMinutes = Math.round(ms / 60_000);
    if (totalMinutes < 1) return '<1m';
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } catch {
    return 'unknown';
  }
}

export { notifyJobCompletion };
