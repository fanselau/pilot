import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { buildOpenClawDeliverArgs, executeOpenClawDeliver } from '../../src/core/openclaw-deliver.js';
import type { OpenClawDeliverRoute } from '../../src/core/types.js';

const mockExeca = vi.mocked(execa);

const BASE_ROUTE: OpenClawDeliverRoute = {
  kind: 'openclaw-agent-deliver',
  agentId: 'benefitu',
  channel: 'telegram',
  to: 'telegram:-5181925291',
  accountId: 'benefitu',
};

describe('openclaw-deliver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds deterministic deliver args with explicit reply routing', () => {
    const args = buildOpenClawDeliverArgs(BASE_ROUTE, 'Job completed');

    expect(args).toEqual([
      'agent',
      '--agent', 'benefitu',
      '--message', 'Job completed',
      '--deliver',
      '--reply-channel', 'telegram',
      '--reply-to', 'telegram:-5181925291',
      '--reply-account', 'benefitu',
    ]);
  });

  it('omits --reply-account when accountId is not provided', () => {
    const route: OpenClawDeliverRoute = {
      kind: 'openclaw-agent-deliver',
      agentId: 'main',
      channel: 'telegram',
      to: 'telegram:6102973659',
    };

    const args = buildOpenClawDeliverArgs(route, 'Job failed');

    expect(args).toEqual([
      'agent',
      '--agent', 'main',
      '--message', 'Job failed',
      '--deliver',
      '--reply-channel', 'telegram',
      '--reply-to', 'telegram:6102973659',
    ]);
    expect(args).not.toContain('--reply-account');
  });

  it('returns ok:false with stderr details on non-zero command exit', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stderr: 'invalid reply route',
      stdout: '',
    } as Awaited<ReturnType<typeof execa>>);

    const result = await executeOpenClawDeliver(BASE_ROUTE, 'Job update');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('exited with code 1');
    expect(result.error).toContain('invalid reply route');
    expect(mockExeca).toHaveBeenCalledWith(
      'openclaw',
      expect.any(Array),
      { timeout: 30_000, reject: false },
    );
  });

  it('returns ok:false when openclaw binary cannot be spawned', async () => {
    mockExeca.mockRejectedValueOnce(new Error('spawn openclaw ENOENT'));

    const result = await executeOpenClawDeliver(BASE_ROUTE, 'Job update');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Failed to execute openclaw agent --deliver');
    expect(result.error).toContain('spawn openclaw ENOENT');
  });
});
