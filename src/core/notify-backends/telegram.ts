/**
 * Telegram Bot API notification backend.
 *
 * Sends job completion messages via the Telegram Bot API sendMessage endpoint.
 * Uses native fetch() — no new dependencies.
 * Reads botToken from config with fallback to legacy flat field.
 */
import { loadConfigFile } from '../config.js';
import type { NotifyBackend, NotifyResult, NotifyRoute, DetectResult } from './types.js';

/**
 * Read the Telegram bot token from config, checking nested path first,
 * then falling back to the legacy flat field.
 */
function getBotToken(): string | null {
  const config = loadConfigFile();
  if (!config?.notifications) return null;

  // Nested: notifications.telegram.botToken
  const nested = (config.notifications as Record<string, unknown>).telegram;
  if (nested && typeof nested === 'object') {
    const token = (nested as Record<string, unknown>).botToken;
    if (typeof token === 'string' && token.length > 0) return token;
  }

  // Legacy flat: notifications.telegramBotToken
  const legacy = config.notifications.telegramBotToken;
  if (typeof legacy === 'string' && legacy.length > 0) return legacy;

  return null;
}

export const telegramBackend: NotifyBackend = {
  kind: 'telegram',
  displayName: 'Telegram',

  async deliver(route: NotifyRoute, prompt: string): Promise<NotifyResult> {
    if (route.kind !== 'telegram') {
      return { ok: false, error: 'wrong backend kind' };
    }

    const botToken = getBotToken();
    if (!botToken) {
      return { ok: false, error: 'Telegram botToken not configured' };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = {
      chat_id: route.chatId,
      text: prompt,
      parse_mode: 'Markdown',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `Telegram API returned ${response.status} ${response.statusText}`,
      };
    } catch (error) {
      const err = error as Error;
      return { ok: false, error: `Telegram request failed: ${err.message}` };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async detect(): Promise<DetectResult> {
    const token = getBotToken();
    return token ? 'detected' : 'not-configured';
  },

  validateConfig(): string | null {
    const token = getBotToken();
    if (!token) {
      return 'Telegram botToken is not configured. Set notifications.telegram.botToken in config.';
    }
    return null;
  },
};
