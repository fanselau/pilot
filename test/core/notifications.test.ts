import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  loadNotificationConfig,
  sendNotification,
} from '../../src/core/notifications.js';
import type {
  NotificationConfig,
  NotificationPayload,
} from '../../src/core/notifications.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'pilot-notif-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tmpDir, { recursive: true, force: true });
});

// ── loadNotificationConfig ─────────────────────────────────────────────────

describe('loadNotificationConfig', () => {
  it('returns null when config file does not exist', async () => {
    const result = await loadNotificationConfig(path.join(tmpDir, 'nonexistent.json'));
    expect(result).toBeNull();
  });

  it('returns null when file is not valid JSON', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await writeFile(configPath, 'not json {{{');
    const result = await loadNotificationConfig(configPath);
    expect(result).toBeNull();
  });

  it('returns null when no notifications section', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await writeFile(configPath, JSON.stringify({ foo: 'bar' }));
    const result = await loadNotificationConfig(configPath);
    expect(result).toBeNull();
  });

  it('returns config with valid notifications section', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        notifications: {
          enabled: true,
          on: ['complete', 'fail'],
          webhook: 'https://hooks.example.com/pilot',
        },
      }),
    );

    const result = await loadNotificationConfig(configPath);
    expect(result).toEqual({
      enabled: true,
      on: ['complete', 'fail'],
      webhook: 'https://hooks.example.com/pilot',
    });
  });

  it('filters invalid event types from on array', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        notifications: {
          enabled: true,
          on: ['complete', 'invalid', 'stuck', 123],
          webhook: 'https://hooks.example.com/pilot',
        },
      }),
    );

    const result = await loadNotificationConfig(configPath);
    expect(result?.on).toEqual(['complete', 'stuck']);
  });

  it('defaults on to empty array when not an array', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        notifications: {
          enabled: false,
          on: 'invalid',
        },
      }),
    );

    const result = await loadNotificationConfig(configPath);
    expect(result?.on).toEqual([]);
    expect(result?.enabled).toBe(false);
  });

  it('webhook is undefined when not a string', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        notifications: {
          enabled: true,
          on: ['complete'],
          webhook: 12345,
        },
      }),
    );

    const result = await loadNotificationConfig(configPath);
    expect(result?.webhook).toBeUndefined();
  });
});

// ── sendNotification ───────────────────────────────────────────────────────

describe('sendNotification', () => {
  const payload: NotificationPayload = {
    event: 'complete',
    project: 'test-project',
    title: 'test-project-build-full',
    duration_ms: 60000,
    commits: 5,
  };

  it('calls fetch with correct URL, method, and body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      enabled: true,
      on: ['complete', 'fail'],
      webhook: 'https://hooks.example.com/pilot',
    };

    await sendNotification(config, payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.example.com/pilot');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body['event']).toBe('complete');
    expect(body['project']).toBe('test-project');
    expect(body['title']).toBe('test-project-build-full');
    expect(body['duration_ms']).toBe(60000);
    expect(body['commits']).toBe(5);
    expect(body['timestamp']).toBeDefined();
  });

  it('skips if config.enabled is false', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      enabled: false,
      on: ['complete'],
      webhook: 'https://hooks.example.com/pilot',
    };

    await sendNotification(config, payload);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips if event not in config.on', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      enabled: true,
      on: ['fail'], // only fail, not complete
      webhook: 'https://hooks.example.com/pilot',
    };

    await sendNotification(config, payload);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips if no webhook URL configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      enabled: true,
      on: ['complete'],
      // no webhook
    };

    await sendNotification(config, payload);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('silently catches fetch errors (no throw)', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const config: NotificationConfig = {
      enabled: true,
      on: ['complete'],
      webhook: 'https://hooks.example.com/pilot',
    };

    // Should NOT throw
    await expect(sendNotification(config, payload)).resolves.toBeUndefined();

    // Should log to stderr
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notification] Failed to send webhook'),
    );

    stderrSpy.mockRestore();
  });

  it('sends fail event with error info', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      enabled: true,
      on: ['fail'],
      webhook: 'https://hooks.example.com/pilot',
    };

    const failPayload: NotificationPayload = {
      event: 'fail',
      project: 'broken-project',
      title: 'broken-project-build-full',
      error: 'exit code 1',
    };

    await sendNotification(config, failPayload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body['event']).toBe('fail');
    expect(body['error']).toBe('exit code 1');
  });

  it('sends stuck event with score', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const config: NotificationConfig = {
      enabled: true,
      on: ['stuck'],
      webhook: 'https://hooks.example.com/pilot',
    };

    const stuckPayload: NotificationPayload = {
      event: 'stuck',
      project: 'stuck-project',
      title: 'stuck-project-execute-phase-3',
      stuckScore: 85,
    };

    await sendNotification(config, stuckPayload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body['event']).toBe('stuck');
    expect(body['stuckScore']).toBe(85);
  });
});
