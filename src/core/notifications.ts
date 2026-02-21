/**
 * Webhook notification sender — fire-and-forget POSTs on runner events.
 *
 * Reads config from ~/.pilot/config.json (notifications section).
 * Uses built-in fetch (Node.js 20+). Never throws — notifications must
 * not crash the runner.
 *
 * Pure core module — no UI dependencies.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ── Types ──────────────────────────────────────────────────────────────────

export interface NotificationConfig {
  enabled: boolean;
  on: Array<'complete' | 'fail' | 'stuck'>;
  webhook?: string;
}

export interface NotificationPayload {
  event: 'complete' | 'fail' | 'stuck';
  project: string;
  title: string;
  duration_ms?: number;
  commits?: number;
  error?: string;
  stuckScore?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(os.homedir(), '.pilot', 'config.json');
const FETCH_TIMEOUT_MS = 5000;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load notification config from ~/.pilot/config.json.
 *
 * Returns null if:
 * - File doesn't exist
 * - File is not valid JSON
 * - No `notifications` section in the config
 *
 * Does NOT throw on missing file.
 *
 * @param configPath - Override config path (for testing).
 */
async function loadNotificationConfig(
  configPath: string = CONFIG_PATH,
): Promise<NotificationConfig | null> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const notif = parsed['notifications'];
  if (notif === null || notif === undefined || typeof notif !== 'object') {
    return null;
  }

  const n = notif as Record<string, unknown>;
  const enabled = n['enabled'] === true;
  const on = Array.isArray(n['on'])
    ? (n['on'] as unknown[]).filter(
        (v): v is 'complete' | 'fail' | 'stuck' =>
          v === 'complete' || v === 'fail' || v === 'stuck',
      )
    : [];
  const webhook = typeof n['webhook'] === 'string' ? n['webhook'] : undefined;

  return { enabled, on, webhook };
}

/**
 * Send a notification via webhook POST.
 *
 * Fire-and-forget: catches all errors, logs to stderr, never throws.
 * Skips if:
 * - config.enabled is false
 * - payload.event is not in config.on
 * - config.webhook is not set
 *
 * Uses AbortController with 5s timeout.
 *
 * @param config - Notification configuration.
 * @param payload - Event payload to send.
 */
async function sendNotification(
  config: NotificationConfig,
  payload: NotificationPayload,
): Promise<void> {
  // Skip if disabled
  if (!config.enabled) return;

  // Skip if event not in config.on
  if (!config.on.includes(payload.event)) return;

  // Skip if no webhook URL configured
  if (!config.webhook) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Fire-and-forget: log but never throw
    process.stderr.write(
      `[notification] Failed to send webhook: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export { loadNotificationConfig, sendNotification };
