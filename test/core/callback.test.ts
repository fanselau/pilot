/**
 * Unit tests for callback.ts — notifyJobCompletion.
 *
 * Verifies fire-and-forget semantics, env var fallback, milestone skip,
 * auth header inclusion, and message content.
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
    maxAttempts: 3,
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
    // Reset config mock to defaults (no URL, no token)
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
    // Config already returns null for openclawHooksUrl
    const result = await notifyJobCompletion(job);
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends POST to job.callbackUrl when set (uses job URL over config URL)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://config-url/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackUrl: 'https://job-url.example.com/hooks/agent', callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://job-url.example.com/hooks/agent',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to PILOT_OPENCLAW_HOOKS_URL from config when job.callbackUrl is null', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackUrl: null, callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:18789/hooks/agent',
      expect.anything(),
    );
  });

  it('includes Authorization header when PILOT_OPENCLAW_HOOKS_TOKEN is set', async () => {
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

  it('sends agentId, unique sessionKey, and deliver:false when callbackSessionKey is set', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.agentId).toBe('main');
    expect(body.sessionKey).toBe('hook:pilot:ab12');
    expect(body.deliver).toBe(false);
    expect(body.name).toBe('Pilot');
    expect(body).not.toHaveProperty('deliver', true);
    expect(body.message as string).toContain('Notify session: agent:main:main');
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
    // Must not throw — call directly and verify result
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

  it('message includes job.id, scope, status, project, description, duration', async () => {
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
    const message = body.message as string;

    expect(message).toContain('ab12');
    expect(message).toContain('phase');
    expect(message).toContain('completed');
    expect(message).toContain('test-project');
    expect(message).toContain('Implement feature X');
    expect(message).toContain('47m');
    expect(message).toContain('Notify session: agent:main:main');
  });

  it('message includes error when job.error is set', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ status: 'failed', error: 'OOM killed', callbackSessionKey: 'main' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.message as string).toContain('OOM killed');
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
    const message = body.message as string;
    // The description line should not contain more than 100 chars from the original
    const descLine = (message.split('\n') as string[]).find(l => l.startsWith('Description:'))!;
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
    const message = body.message as string;
    const errorLine = (message.split('\n') as string[]).find(l => l.startsWith('Error:'))!;
    // Should be at most "Error: " (7 chars) + 200 chars = 207 chars
    expect(errorLine.length).toBeLessThanOrEqual(207);
  });

  it('uses callbackSessionKey as agentId (not as sessionKey)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.mocked(getConfig).mockReturnValue({
      openclawHooksUrl: 'http://127.0.0.1:18789/hooks/agent',
      openclawHooksToken: null,
    } as ReturnType<typeof getConfig>);

    const job = makeTestJob({ callbackSessionKey: 'benefitu' });
    await notifyJobCompletion(job);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect(body.agentId).toBe('benefitu');
    expect(body.sessionKey).toBe('hook:pilot:ab12');
    expect(body.message as string).toContain('Notify session: agent:benefitu:main');
  });
});
