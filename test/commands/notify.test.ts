/**
 * Tests for `pilot notify` command — list, enable, disable, config, test subcommands.
 *
 * Mocks: registry.ts (getAllBackends, getEnabledBackends, enableBackend, disableBackend,
 *        getBackend, getBackendConfig, setBackendConfig), output.ts, colors.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotifyBackend, NotifyBackendKind, NotifyResult, DetectResult } from '../../src/core/notify-backends/types.js';

// ── Mock data ──────────────────────────────────────────────────────────────

function makeBackend(overrides: Partial<NotifyBackend> & { kind: NotifyBackendKind }): NotifyBackend {
  return {
    displayName: overrides.kind.charAt(0).toUpperCase() + overrides.kind.slice(1),
    deliver: vi.fn(async (): Promise<NotifyResult> => ({ ok: true })),
    detect: vi.fn(async (): Promise<DetectResult> => 'available'),
    validateConfig: vi.fn(() => null),
    ...overrides,
  };
}

const mockKimaki = makeBackend({ kind: 'kimaki', displayName: 'Kimaki' });
const mockOpenclaw = makeBackend({ kind: 'openclaw-agent-deliver', displayName: 'OpenClaw Agent Deliver' });
const mockWebhook = makeBackend({ kind: 'webhook', displayName: 'Webhook' });
const mockTelegram = makeBackend({ kind: 'telegram', displayName: 'Telegram' });

const allBackends = [mockKimaki, mockOpenclaw, mockWebhook, mockTelegram];

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetAllBackends = vi.fn(() => allBackends);
const mockGetEnabledBackends = vi.fn((): NotifyBackendKind[] => ['kimaki']);
const mockEnableBackend = vi.fn();
const mockDisableBackend = vi.fn();
const mockGetBackend = vi.fn((kind: string): NotifyBackend | null => {
  return allBackends.find(b => b.kind === kind) ?? null;
});
const mockGetBackendConfig = vi.fn((_kind: string): Record<string, unknown> => ({}));
const mockSetBackendConfig = vi.fn();

vi.mock('../../src/core/notify-backends/registry.js', () => ({
  getAllBackends: () => mockGetAllBackends(),
  getEnabledBackends: () => mockGetEnabledBackends(),
  enableBackend: (kind: string) => mockEnableBackend(kind),
  disableBackend: (kind: string) => mockDisableBackend(kind),
  getBackend: (kind: string) => mockGetBackend(kind),
  getBackendConfig: (kind: string) => mockGetBackendConfig(kind),
  setBackendConfig: (kind: string, key: string, value: unknown) => mockSetBackendConfig(kind, key, value),
}));

let mockJsonMode = false;
const mockOutputJson = vi.fn();
const mockOutputHuman = vi.fn();

vi.mock('../../src/util/output.js', () => ({
  outputJson: (...args: unknown[]) => mockOutputJson(...args),
  outputHuman: (...args: unknown[]) => mockOutputHuman(...args),
  isJsonMode: () => mockJsonMode,
}));

vi.mock('../../src/util/colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  blue: (s: string) => s,
}));

import {
  notifyListCommand,
  notifyEnableCommand,
  notifyDisableCommand,
  notifyTestCommand,
  notifyConfigCommand,
} from '../../src/commands/notify.js';

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockJsonMode = false;
  mockGetAllBackends.mockReturnValue(allBackends);
  mockGetEnabledBackends.mockReturnValue(['kimaki']);
  mockGetBackend.mockImplementation((kind: string) => allBackends.find(b => b.kind === kind) ?? null);
  mockGetBackendConfig.mockReturnValue({});

  // Reset per-backend mock implementations
  for (const backend of allBackends) {
    (backend.detect as ReturnType<typeof vi.fn>).mockResolvedValue('available');
    (backend.deliver as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (backend.validateConfig as ReturnType<typeof vi.fn>).mockReturnValue(null);
  }
});

// ── notify list ────────────────────────────────────────────────────────────

describe('notify list', () => {
  it('lists all 4 backends with enabled/disabled status', async () => {
    await notifyListCommand();

    expect(mockGetAllBackends).toHaveBeenCalled();
    expect(mockGetEnabledBackends).toHaveBeenCalled();

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(output).toContain('kimaki');
    expect(output).toContain('webhook');
    expect(output).toContain('telegram');
    expect(output).toContain('openclaw');
  });

  it('shows enabled status correctly for enabled backends', async () => {
    mockGetEnabledBackends.mockReturnValue(['kimaki', 'webhook']);

    await notifyListCommand();

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(output).toContain('enabled');
    expect(output).toContain('disabled');
  });

  it('outputs JSON with { backends: [...] } shape', async () => {
    mockJsonMode = true;

    await notifyListCommand();

    expect(mockOutputJson).toHaveBeenCalledWith(
      expect.objectContaining({
        backends: expect.arrayContaining([
          expect.objectContaining({ kind: 'kimaki' }),
          expect.objectContaining({ kind: 'webhook' }),
          expect.objectContaining({ kind: 'telegram' }),
        ]),
      }),
    );
    expect(mockOutputHuman).not.toHaveBeenCalled();
  });

  it('shows detect result per backend', async () => {
    (mockKimaki.detect as ReturnType<typeof vi.fn>).mockResolvedValue('detected');
    (mockWebhook.detect as ReturnType<typeof vi.fn>).mockResolvedValue('not-configured');

    await notifyListCommand();

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(output).toContain('detected');
    expect(output).toContain('not configured');
  });
});

// ── notify enable ──────────────────────────────────────────────────────────

describe('notify enable', () => {
  it('enables a backend when validateConfig passes', async () => {
    await notifyEnableCommand('telegram');

    expect(mockEnableBackend).toHaveBeenCalledWith('telegram');
  });

  it('exits with error for invalid kind', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyEnableCommand('invalid-backend')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('Unknown backend kind');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error when validateConfig returns error string', async () => {
    (mockTelegram.validateConfig as ReturnType<typeof vi.fn>).mockReturnValue('Missing botToken');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyEnableCommand('telegram')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('Missing botToken');
    expect(mockEnableBackend).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── notify disable ─────────────────────────────────────────────────────────

describe('notify disable', () => {
  it('disables a backend', async () => {
    await notifyDisableCommand('webhook');

    expect(mockDisableBackend).toHaveBeenCalledWith('webhook');
  });

  it('exits with error for invalid kind', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyDisableCommand('bogus')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('Unknown backend kind');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── notify config ──────────────────────────────────────────────────────────

describe('notify config', () => {
  it('displays all config for a backend (read mode)', async () => {
    mockGetBackendConfig.mockReturnValue({ botToken: 'tok123', chatId: 'chat456' });

    await notifyConfigCommand('telegram');

    expect(mockGetBackendConfig).toHaveBeenCalledWith('telegram');
    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(output).toContain('telegram');
    expect(output).toContain('chatId');
  });

  it('sets a config value (write mode)', async () => {
    await notifyConfigCommand('telegram', 'botToken', 'token123');

    expect(mockSetBackendConfig).toHaveBeenCalledWith('telegram', 'botToken', 'token123');
  });

  it('shows a specific key', async () => {
    mockGetBackendConfig.mockReturnValue({ botToken: 'tok123' });

    await notifyConfigCommand('telegram', 'botToken');

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    // botToken contains "token" → masked
    expect(output).toContain('****');
  });

  it('shows (not set) for missing key', async () => {
    mockGetBackendConfig.mockReturnValue({});

    await notifyConfigCommand('telegram', 'nonExistentKey');

    const output = mockOutputHuman.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(output).toContain('(not set)');
  });

  it('exits with error for invalid kind', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyConfigCommand('nope')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ── notify test ────────────────────────────────────────────────────────────

describe('notify test', () => {
  it('sends test notification via backend.deliver()', async () => {
    await notifyTestCommand('webhook', 'https://example.com/hook');

    expect(mockWebhook.deliver).toHaveBeenCalledWith(
      { kind: 'webhook', url: 'https://example.com/hook' },
      expect.stringContaining('Test notification'),
      expect.objectContaining({ id: 'test', project: 'test' }),
    );
  });

  it('rejects openclaw-agent-deliver (too complex for test)', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyTestCommand('openclaw-agent-deliver', 'some-target')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('');
    expect(stderrOutput).toContain('too complex');

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('builds kimaki route with sessionId', async () => {
    await notifyTestCommand('kimaki', 'ses_abc');

    expect(mockKimaki.deliver).toHaveBeenCalledWith(
      { kind: 'kimaki', sessionId: 'ses_abc' },
      expect.any(String),
      expect.any(Object),
    );
  });

  it('builds telegram route with chatId', async () => {
    await notifyTestCommand('telegram', 'chat_123');

    expect(mockTelegram.deliver).toHaveBeenCalledWith(
      { kind: 'telegram', chatId: 'chat_123' },
      expect.any(String),
      expect.any(Object),
    );
  });

  it('exits with error when deliver returns ok:false', async () => {
    (mockWebhook.deliver as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'timeout' });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyTestCommand('webhook', 'https://example.com/hook')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error for invalid kind', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(notifyTestCommand('nope', 'target')).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
