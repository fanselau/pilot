/**
 * OpenClaw notification backend — stub for TDD RED phase.
 */
import type { NotifyBackend } from './types.js';

export const openclawBackend: NotifyBackend = {
  kind: 'openclaw-agent-deliver',
  displayName: 'OpenClaw',
  async deliver() { throw new Error('Not implemented'); },
  async detect() { throw new Error('Not implemented'); },
  validateConfig() { throw new Error('Not implemented'); },
};
