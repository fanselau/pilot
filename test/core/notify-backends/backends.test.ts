import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock execa for kimaki and openclaw backends
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Mock config for telegram and openclaw validateConfig
vi.mock('../../../src/core/config.js', () => ({
  loadConfigFile: vi.fn(),
  _resetConfigCache: vi.fn(),
}));

import { execa } from 'execa';
import { loadConfigFile } from '../../../src/core/config.js';
import type { NotifyRoute } from '../../../src/core/notify-backends/types.js';

const mockExeca = vi.mocked(execa);
const mockLoadConfig = vi.mocked(loadConfigFile);

// Lazy imports so mocks are in place
let kimakiBackend: typeof import('../../../src/core/notify-backends/kimaki.js').kimakiBackend;
let openclawBackend: typeof import('../../../src/core/notify-backends/openclaw.js').openclawBackend;
let webhookBackend: typeof import('../../../src/core/notify-backends/webhook.js').webhookBackend;
let telegramBackend: typeof import('../../../src/core/notify-backends/telegram.js').telegramBackend;

const MOCK_JOB = {
  id: 'ab12',
  project: '/home/user/dev/myapp',
  status: 'completed',
  description: 'Fix the login page',
  startedAt: '2026-03-30T10:00:00Z',
  completedAt: '2026-03-30T10:15:00Z',
  error: null,
};

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset modules to re-evaluate with fresh mocks
  const kimakiMod = await import('../../../src/core/notify-backends/kimaki.js');
  kimakiBackend = kimakiMod.kimakiBackend;
  const openclawMod = await import('../../../src/core/notify-backends/openclaw.js');
  openclawBackend = openclawMod.openclawBackend;
  const webhookMod = await import('../../../src/core/notify-backends/webhook.js');
  webhookBackend = webhookMod.webhookBackend;
  const telegramMod = await import('../../../src/core/notify-backends/telegram.js');
  telegramBackend = telegramMod.telegramBackend;
});

// ── Kimaki Backend ────────────────────────────────────────────────────────

describe('kimakiBackend', () => {
  it('deliver with sessionId calls execa with --session', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '' } as any);
    const route: NotifyRoute = { kind: 'kimaki', sessionId: 'ses_xxx' };
    const result = await kimakiBackend.deliver(route, 'Job done', MOCK_JOB);
    expect(result.ok).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'kimaki',
      ['send', '--session', 'ses_xxx', '--prompt', 'Job done'],
      expect.objectContaining({ timeout: 30_000, reject: false }),
    );
  });

  it('deliver with channelId calls execa with --channel', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '' } as any);
    const route: NotifyRoute = { kind: 'kimaki', channelId: 'ch_xxx' };
    const result = await kimakiBackend.deliver(route, 'Job done', MOCK_JOB);
    expect(result.ok).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'kimaki',
      ['send', '--channel', 'ch_xxx', '--prompt', 'Job done'],
      expect.objectContaining({ timeout: 30_000, reject: false }),
    );
  });

  it('deliver with both sessionId and channelId uses sessionId (priority)', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '' } as any);
    const route: NotifyRoute = { kind: 'kimaki', sessionId: 'ses_xxx', channelId: 'ch_xxx' };
    const result = await kimakiBackend.deliver(route, 'Job done', MOCK_JOB);
    expect(result.ok).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'kimaki',
      ['send', '--session', 'ses_xxx', '--prompt', 'Job done'],
      expect.objectContaining({ timeout: 30_000, reject: false }),
    );
  });

  it('detect returns detected on exit 0, not-found otherwise', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '1.0.0' } as any);
    expect(await kimakiBackend.detect()).toBe('detected');

    mockExeca.mockResolvedValueOnce({ exitCode: 1, stderr: '', stdout: '' } as any);
    expect(await kimakiBackend.detect()).toBe('not-found');
  });

  it('deliver returns ok:false when binary not found (ENOENT)', async () => {
    const err = new Error('spawn kimaki ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(err);
    const route: NotifyRoute = { kind: 'kimaki', sessionId: 'ses_xxx' };
    const result = await kimakiBackend.deliver(route, 'Job done', MOCK_JOB);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('kimaki binary not found on PATH');
  });

  it('deliver returns ok:false on non-zero exit code', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 64, stderr: 'session not found', stdout: '' } as any);
    const route: NotifyRoute = { kind: 'kimaki', sessionId: 'ses_xxx' };
    const result = await kimakiBackend.deliver(route, 'Job done', MOCK_JOB);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('session not found');
  });

  it('deliver returns ok:false when route missing sessionId and channelId', async () => {
    const route: NotifyRoute = { kind: 'kimaki' };
    const result = await kimakiBackend.deliver(route, 'Job done', MOCK_JOB);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing sessionId and channelId');
  });
});

// ── OpenClaw Backend ──────────────────────────────────────────────────────

describe('openclawBackend', () => {
  it('deliver calls execa with same args as current openclaw-deliver.ts', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '' } as any);
    const route: NotifyRoute = {
      kind: 'openclaw-agent-deliver',
      agentId: 'benefitu',
      channel: 'telegram',
      to: 'telegram:-5181925291',
      accountId: 'benefitu',
    };
    const result = await openclawBackend.deliver(route, 'Job completed', MOCK_JOB);
    expect(result.ok).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'openclaw',
      [
        'agent',
        '--agent', 'benefitu',
        '--message', 'Job completed',
        '--deliver',
        '--reply-channel', 'telegram',
        '--reply-to', 'telegram:-5181925291',
        '--reply-account', 'benefitu',
      ],
      expect.objectContaining({ timeout: 30_000, reject: false }),
    );
  });

  it('detect returns detected on exit 0, not-found otherwise', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: 'openclaw 2.0' } as any);
    expect(await openclawBackend.detect()).toBe('detected');

    mockExeca.mockResolvedValueOnce({ exitCode: 1, stderr: '', stdout: '' } as any);
    expect(await openclawBackend.detect()).toBe('not-found');
  });

  it('deliver omits --reply-account when accountId is absent', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '' } as any);
    const route: NotifyRoute = {
      kind: 'openclaw-agent-deliver',
      agentId: 'main',
      channel: 'telegram',
      to: 'telegram:6102973659',
    };
    await openclawBackend.deliver(route, 'Job failed', MOCK_JOB);
    const calledArgs = mockExeca.mock.calls[0]![1] as string[];
    expect(calledArgs).not.toContain('--reply-account');
  });

  it('validateConfig returns error when hooksUrl missing', () => {
    mockLoadConfig.mockReturnValue({});
    expect(openclawBackend.validateConfig()).toContain('hooksUrl');
  });

  it('validateConfig returns null when hooksUrl set', () => {
    mockLoadConfig.mockReturnValue({ notifications: { openclaw: { hooksUrl: 'https://hooks.example.com' } } } as any);
    expect(openclawBackend.validateConfig()).toBeNull();
  });

  it('validateConfig reads flat legacy field as fallback', () => {
    mockLoadConfig.mockReturnValue({ notifications: { openclawHooksUrl: 'https://hooks.example.com' } } as any);
    expect(openclawBackend.validateConfig()).toBeNull();
  });
});

// ── Webhook Backend ───────────────────────────────────────────────────────

describe('webhookBackend', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deliver calls fetch with correct URL, method POST, JSON body', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const route: NotifyRoute = { kind: 'webhook', url: 'https://hooks.example.com/notify' };
    const result = await webhookBackend.deliver(route, 'Job completed', MOCK_JOB);

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.example.com/notify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );

    // Verify body contains expected fields
    const callArgs = mockFetch.mock.calls[0]!;
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.jobId).toBe('ab12');
    expect(body.status).toBe('completed');
    expect(body.project).toBe('/home/user/dev/myapp');
    expect(body.description).toBe('Fix the login page');
    expect(body.prompt).toBe('Job completed');
    expect(body.timestamp).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('deliver includes route.headers as additional request headers', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const route: NotifyRoute = {
      kind: 'webhook',
      url: 'https://hooks.example.com/notify',
      headers: { Authorization: 'Bearer token123' },
    };
    await webhookBackend.deliver(route, 'Job completed', MOCK_JOB);

    const callArgs = mockFetch.mock.calls[0]!;
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('detect returns available always', async () => {
    expect(await webhookBackend.detect()).toBe('available');
  });

  it('deliver returns ok:false on non-2xx response', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response('Forbidden', { status: 403, statusText: 'Forbidden' }));

    const route: NotifyRoute = { kind: 'webhook', url: 'https://hooks.example.com/notify' };
    const result = await webhookBackend.deliver(route, 'Job completed', MOCK_JOB);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── Telegram Backend ──────────────────────────────────────────────────────

describe('telegramBackend', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deliver calls fetch with bot API sendMessage URL', async () => {
    mockLoadConfig.mockReturnValue({ notifications: { telegram: { botToken: 'bot123:ABC' } } } as any);
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const route: NotifyRoute = { kind: 'telegram', chatId: '-518192' };
    const result = await telegramBackend.deliver(route, 'Job completed', MOCK_JOB);

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot123:ABC/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );

    const callArgs = mockFetch.mock.calls[0]!;
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.chat_id).toBe('-518192');
    expect(body.text).toBe('Job completed');
    expect(body.parse_mode).toBe('Markdown');
  });

  it('detect returns detected if botToken configured, not-configured if not', async () => {
    mockLoadConfig.mockReturnValue({ notifications: { telegram: { botToken: 'bot123:ABC' } } } as any);
    expect(await telegramBackend.detect()).toBe('detected');

    mockLoadConfig.mockReturnValue({});
    expect(await telegramBackend.detect()).toBe('not-configured');
  });

  it('validateConfig returns error if botToken not set', () => {
    mockLoadConfig.mockReturnValue({});
    expect(telegramBackend.validateConfig()).toContain('botToken');
  });

  it('validateConfig returns null if botToken is set', () => {
    mockLoadConfig.mockReturnValue({ notifications: { telegram: { botToken: 'bot123:ABC' } } } as any);
    expect(telegramBackend.validateConfig()).toBeNull();
  });

  it('validateConfig reads legacy flat field as fallback', () => {
    mockLoadConfig.mockReturnValue({ notifications: { telegramBotToken: 'bot123:ABC' } } as any);
    expect(telegramBackend.validateConfig()).toBeNull();
  });

  it('deliver returns ok:false if botToken not configured', async () => {
    mockLoadConfig.mockReturnValue({});
    const route: NotifyRoute = { kind: 'telegram', chatId: '-518192' };
    const result = await telegramBackend.deliver(route, 'Job completed', MOCK_JOB);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('botToken');
  });
});
