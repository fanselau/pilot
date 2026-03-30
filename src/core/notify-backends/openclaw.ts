/**
 * OpenClaw notification backend.
 *
 * Moved from src/core/openclaw-deliver.ts — same execa call, same args, same timeout.
 * Implements the NotifyBackend interface for the modular notification system.
 */
import { execa } from 'execa';
import { loadConfigFile } from '../config.js';
import type { NotifyBackend, NotifyResult, NotifyRoute, DetectResult } from './types.js';

export const openclawBackend: NotifyBackend = {
  kind: 'openclaw-agent-deliver',
  displayName: 'OpenClaw',

  async deliver(route: NotifyRoute, prompt: string): Promise<NotifyResult> {
    if (route.kind !== 'openclaw-agent-deliver') {
      return { ok: false, error: 'wrong backend kind' };
    }

    const args = [
      'agent',
      '--agent', route.agentId,
      '--message', prompt,
      '--deliver',
      '--reply-channel', route.channel,
      '--reply-to', route.to,
      ...(route.accountId ? ['--reply-account', route.accountId] : []),
    ];

    try {
      const result = await execa('openclaw', args, {
        timeout: 30_000,
        reject: false,
      });

      if (result.exitCode === 0) {
        return { ok: true };
      }

      const detail = (result.stderr || result.stdout || '').trim();
      return {
        ok: false,
        error: detail
          ? `openclaw agent --deliver exited with code ${result.exitCode}: ${detail}`
          : `openclaw agent --deliver exited with code ${result.exitCode}`,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { ok: false, error: 'openclaw binary not found on PATH' };
      }
      return { ok: false, error: `Failed to execute openclaw agent --deliver: ${err.message}` };
    }
  },

  async detect(): Promise<DetectResult> {
    try {
      const result = await execa('openclaw', ['--version'], { timeout: 5_000, reject: false });
      return result.exitCode === 0 ? 'detected' : 'not-found';
    } catch {
      return 'not-found';
    }
  },

  validateConfig(): string | null {
    const config = loadConfigFile();
    // Check nested config first, then legacy flat field
    const hooksUrl =
      (config?.notifications as Record<string, unknown> | undefined)?.openclaw
        ? ((config?.notifications as Record<string, Record<string, unknown>>).openclaw?.hooksUrl as string | undefined)
        : config?.notifications?.openclawHooksUrl;

    if (!hooksUrl) {
      return 'OpenClaw hooksUrl is not configured. Set notifications.openclaw.hooksUrl in config.';
    }
    return null;
  },
};
