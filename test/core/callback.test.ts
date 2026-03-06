/**
 * Unit tests for callback.ts — notifyJobCompletion.
 *
 * Verifies fire-and-forget semantics, env var fallback,
 * /hooks/wake payload, auth header inclusion, and message content.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from '../../src/core/types.js';

// Mock config to control openclawHooksUrl and openclawHooksToken
vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn(() => ({
    openclawHooksUrl: null,
    openclawHooksToken: null,
  })),
  resolveProjectDir: vi.fn((p: string) => `/projects/${p}`),
}));

import { notifyJobCompletion } from '../../src/core/callback.js';
import { getConfig } from '../../src/core/config.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeTestJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'test-project',
    scope: 'phase',
    description: 'Implement feature X',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-04T10:00:00',
    startedAt: '2026-03-04T10:05:00',
    completedAt: '2026-03-04T10:52:00',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 1,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    categories: null,
    ...overrides,
  };
}

// ── notifyJobCompletion ───────────────────────────────────────────────────

describe('notifyJobCompletion', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: null,
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns false and skips for milestone scope jobs', async () => {
    const job = makeTestJob({ scope: 'milestone' });
    const result = await notifyJobCompletion(job);
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns false when no callbackUrl and no PILOT_OPENCLAW_HOOKS_URL configured', async () => {
    const job = makeTestJob({ callbackUrl: null });
    const result = await notifyJobCompletion(job);
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns false when callbackSessionKey is null (no agentId)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: null });
    const result = await notifyJobCompletion(job);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('derives /hooks/wake URL from config openclawHooksUrl', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackUrl: null, callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:18789/hooks/wake',
      expect.anything(),
    );
  });

  it('sends /hooks/wake payload with text and mode:now', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.text).toBeDefined();
    expect(body.mode).toBe('now');
    // Should NOT have old /hooks/agent fields
    expect(body).not.toHaveProperty('agentId');
    expect(body).not.toHaveProperty('sessionKey');
    expect(body).not.toHaveProperty('deliver');
  });

  it('uses job.callbackUrl directly when set (non-trusted URL)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: 'secret',
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({
      callbackUrl: 'https://external.example.com/hooks/agent',
      callbackSessionKey: 'main',
    });
    await notifyJobCompletion(job);

    // Non-trusted URL: uses it as-is, no /wake derivation, no auth header
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://external.example.com/hooks/agent');
    expect(callArgs[1].headers['Authorization']).toBeUndefined();
  });

  it('includes Authorization header when PILOT_OPENCLAW_HOOKS_TOKEN is set (trusted URL)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: 'secret-token',
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers['Authorization']).toBe('Bearer secret-token');
  });

  it('text includes job.id, scope, status, project, description, duration', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({
      id: 'ab12',
      scope: 'phase',
      status: 'completed',
      project: 'test-project',
      description: 'Implement feature X',
      startedAt: '2026-03-04T10:00:00',
      completedAt: '2026-03-04T10:47:00',
      callbackSessionKey: 'main',
    });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    const text = body.text as string;

    expect(text).toContain('ab12');
    expect(text).toContain('phase');
    expect(text).toContain('completed');
    expect(text).toContain('test-project');
    expect(text).toContain('Implement feature X');
    expect(text).toContain('47m');
  });

  it('text includes error when job.error is set', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ status: 'failed', error: 'OOM killed', callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.text as string).toContain('OOM killed');
  });

  it('description is truncated at 100 chars', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const longDescription = 'A'.repeat(150);
    const job = makeTestJob({ description: longDescription, callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    const text = body.text as string;
    const descLine = (text.split('\n') as string[]).find(l => l.startsWith('Description:'))!;
    expect(descLine).toContain('…');
    expect(descLine.length).toBeLessThan(150);
  });

  it('error is truncated at 200 chars', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const longError = 'E'.repeat(250);
    const job = makeTestJob({ status: 'failed', error: longError, callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    const text = body.text as string;
    const errorLine = (text.split('\n') as string[]).find(l => l.startsWith('Error:'))!;
    expect(errorLine.length).toBeLessThanOrEqual(207);
  });

  it('returns true on successful fetch (resp.ok = true)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'main' });
    const result = await notifyJobCompletion(job);
    expect(result).toBe(true);
  });

  it('returns false on fetch failure (network error) — never throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'main' });
    const result = await notifyJobCompletion(job);
    expect(result).toBe(false);
  });

  it('returns false on non-ok response (e.g., 500) — never throws', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'main' });
    const result = await notifyJobCompletion(job);
    expect(result).toBe(false);
  });
});
