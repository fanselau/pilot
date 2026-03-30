/**
 * Kimaki (Discord) notification backend.
 *
 * Delivers notifications to Discord threads via the kimaki CLI.
 * - sessionId: posts to an existing agent session thread (wakes the agent)
 * - channelId: creates a new standalone notification thread in the channel
 * sessionId takes priority when both are present.
 */
import { execa } from 'execa';
import type { NotifyBackend, NotifyResult, NotifyRoute, DetectResult } from './types.js';

export const kimakiBackend: NotifyBackend = {
  kind: 'kimaki',
  displayName: 'Kimaki (Discord)',

  async deliver(route: NotifyRoute, prompt: string): Promise<NotifyResult> {
    if (route.kind !== 'kimaki') {
      return { ok: false, error: 'wrong backend kind' };
    }

    const { sessionId, channelId } = route;
    let args: string[];

    if (sessionId) {
      args = ['send', '--session', sessionId, '--prompt', prompt];
    } else if (channelId) {
      args = ['send', '--channel', channelId, '--prompt', prompt];
    } else {
      return { ok: false, error: 'kimaki route missing sessionId and channelId' };
    }

    try {
      const result = await execa('kimaki', args, { timeout: 30_000, reject: false });

      if (result.exitCode === 0) {
        return { ok: true };
      }

      const detail = (result.stderr || result.stdout || '').trim();
      return {
        ok: false,
        error: detail
          ? `kimaki send exited with code ${result.exitCode}: ${detail}`
          : `kimaki send exited with code ${result.exitCode}`,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { ok: false, error: 'kimaki binary not found on PATH' };
      }
      return { ok: false, error: `Failed to execute kimaki send: ${err.message}` };
    }
  },

  async detect(): Promise<DetectResult> {
    try {
      const result = await execa('kimaki', ['--version'], { timeout: 5_000, reject: false });
      return result.exitCode === 0 ? 'detected' : 'not-found';
    } catch {
      return 'not-found';
    }
  },

  validateConfig(): string | null {
    return null; // No global config needed — defaults are per-project, session ID is per-job
  },
};
