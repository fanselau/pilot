/**
 * Kimaki (Discord) notification backend — stub for TDD RED phase.
 */
import type { NotifyBackend } from './types.js';

export const kimakiBackend: NotifyBackend = {
  kind: 'kimaki',
  displayName: 'Kimaki (Discord)',
  async deliver() { throw new Error('Not implemented'); },
  async detect() { throw new Error('Not implemented'); },
  validateConfig() { throw new Error('Not implemented'); },
};
