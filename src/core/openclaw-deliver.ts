import { execa } from 'execa';
import type { OpenClawDeliverRoute } from './types.js';
import { errMsg } from '../util/errors.js';

export interface OpenClawDeliverResult {
  ok: boolean;
  error?: string;
}

function buildOpenClawDeliverArgs(route: OpenClawDeliverRoute, prompt: string): string[] {
  return [
    'agent',
    '--agent', route.agentId,
    '--message', prompt,
    '--deliver',
    '--reply-channel', route.channel,
    '--reply-to', route.to,
    ...(route.accountId ? ['--reply-account', route.accountId] : []),
  ];
}

async function executeOpenClawDeliver(
  route: OpenClawDeliverRoute,
  prompt: string,
): Promise<OpenClawDeliverResult> {
  const args = buildOpenClawDeliverArgs(route, prompt);

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
    return {
      ok: false,
      error: `Failed to execute openclaw agent --deliver: ${errMsg(error)}`,
    };
  }
}

export { buildOpenClawDeliverArgs, executeOpenClawDeliver };
