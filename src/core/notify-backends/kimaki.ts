/**
 * Kimaki (Discord) notification backend.
 *
 * Delivers notifications to Discord threads via the kimaki CLI.
 * - sessionId: posts to an existing agent session thread (wakes the agent)
 * - channelId: creates a new standalone notification thread in the channel
 * sessionId takes priority when both are present.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import type { NotifyBackend, NotifyResult, NotifyRoute, DetectResult } from './types.js';

function resolveKimakiBinary(): string {
  const override = process.env.KIMAKI_BIN?.trim();
  if (override) {
    return override;
  }

  const home = process.env.HOME?.trim() || homedir();
  const fnmBase = path.join(home, '.local', 'share', 'fnm', 'node-versions');

  try {
    const versions = readdirSync(fnmBase, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    for (const version of versions) {
      const candidate = path.join(fnmBase, version, 'installation', 'bin', 'kimaki');
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Fall back to PATH-based resolution below.
  }

  return 'kimaki';
}

async function runKimakiCli(args: string[], timeout: number) {
  return execa(resolveKimakiBinary(), args, {
    timeout,
    reject: false,
  });
}

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
      const result = await runKimakiCli(args, 30_000);

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
        return { ok: false, error: 'kimaki binary not found for notification delivery' };
      }
      return { ok: false, error: `Failed to execute kimaki: ${err.message}` };
    }
  },

  async detect(): Promise<DetectResult> {
    try {
      const result = await runKimakiCli(['--version'], 5_000);
      return result.exitCode === 0 ? 'detected' : 'not-found';
    } catch {
      return 'not-found';
    }
  },

  validateConfig(): string | null {
    return null; // No global config needed — defaults are per-project, session ID is per-job
  },
};
