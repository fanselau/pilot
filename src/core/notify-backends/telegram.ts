/**
 * Telegram Bot API notification backend — stub for TDD RED phase.
 */
import type { NotifyBackend } from './types.js';

export const telegramBackend: NotifyBackend = {
  kind: 'telegram',
  displayName: 'Telegram',
  async deliver() { throw new Error('Not implemented'); },
  async detect() { throw new Error('Not implemented'); },
  validateConfig() { throw new Error('Not implemented'); },
};
