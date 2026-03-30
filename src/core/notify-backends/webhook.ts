/**
 * Webhook (HTTP POST) notification backend — stub for TDD RED phase.
 */
import type { NotifyBackend } from './types.js';

export const webhookBackend: NotifyBackend = {
  kind: 'webhook',
  displayName: 'Webhook (HTTP POST)',
  async deliver() { throw new Error('Not implemented'); },
  async detect() { throw new Error('Not implemented'); },
  validateConfig() { throw new Error('Not implemented'); },
};
