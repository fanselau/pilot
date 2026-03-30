import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetConfigCache } from '../../../src/core/config.js';

// Use a temp config file for each test to test real file I/O
let tmpDir: string;
let tmpConfigPath: string;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `pilot-test-registry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  tmpConfigPath = path.join(tmpDir, 'config.json');
  process.env.PILOT_CONFIG_FILE = tmpConfigPath;
  _resetConfigCache();
});

afterEach(() => {
  delete process.env.PILOT_CONFIG_FILE;
  _resetConfigCache();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Import after env is set up — modules cache, but loadConfigFile reads PILOT_CONFIG_FILE at call time
import {
  getBackend,
  getAllBackends,
  getEnabledBackends,
  enableBackend,
  disableBackend,
  getBackendConfig,
  setBackendConfig,
} from '../../../src/core/notify-backends/registry.js';

describe('registry', () => {
  describe('getBackend', () => {
    it('returns kimakiBackend for "kimaki"', () => {
      const backend = getBackend('kimaki');
      expect(backend).not.toBeNull();
      expect(backend!.kind).toBe('kimaki');
      expect(backend!.displayName).toBe('Kimaki (Discord)');
    });

    it('returns openclawBackend for "openclaw-agent-deliver"', () => {
      const backend = getBackend('openclaw-agent-deliver');
      expect(backend).not.toBeNull();
      expect(backend!.kind).toBe('openclaw-agent-deliver');
    });

    it('returns webhookBackend for "webhook"', () => {
      const backend = getBackend('webhook');
      expect(backend).not.toBeNull();
      expect(backend!.kind).toBe('webhook');
    });

    it('returns telegramBackend for "telegram"', () => {
      const backend = getBackend('telegram');
      expect(backend).not.toBeNull();
      expect(backend!.kind).toBe('telegram');
    });

    it('returns null for unknown kind', () => {
      const backend = getBackend('unknown' as any);
      expect(backend).toBeNull();
    });
  });

  describe('getAllBackends', () => {
    it('returns array of 4 backends', () => {
      const backends = getAllBackends();
      expect(backends).toHaveLength(4);
      const kinds = backends.map((b) => b.kind).sort();
      expect(kinds).toEqual(['kimaki', 'openclaw-agent-deliver', 'telegram', 'webhook']);
    });
  });

  describe('getEnabledBackends', () => {
    it('returns empty array when notifications.backends is undefined', () => {
      // No config file at all
      expect(getEnabledBackends()).toEqual([]);
    });

    it('returns empty array when config file exists but has no backends', () => {
      writeFileSync(tmpConfigPath, JSON.stringify({ notifications: {} }));
      _resetConfigCache();
      expect(getEnabledBackends()).toEqual([]);
    });

    it('reads enabled backends from config', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({ notifications: { backends: ['kimaki', 'webhook'] } }),
      );
      _resetConfigCache();
      const enabled = getEnabledBackends();
      expect(enabled).toEqual(['kimaki', 'webhook']);
    });

    it('filters out invalid kind values', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({ notifications: { backends: ['kimaki', 'invalid-backend', 'telegram'] } }),
      );
      _resetConfigCache();
      const enabled = getEnabledBackends();
      expect(enabled).toEqual(['kimaki', 'telegram']);
    });
  });

  describe('enableBackend', () => {
    it('adds kind to backends array in config', () => {
      writeFileSync(tmpConfigPath, JSON.stringify({ notifications: { backends: [] } }));
      _resetConfigCache();

      enableBackend('kimaki');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.backends).toContain('kimaki');
    });

    it('does not duplicate if already enabled', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({ notifications: { backends: ['kimaki'] } }),
      );
      _resetConfigCache();

      enableBackend('kimaki');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.backends.filter((b: string) => b === 'kimaki')).toHaveLength(1);
    });

    it('creates config file if it does not exist', () => {
      expect(existsSync(tmpConfigPath)).toBe(false);
      enableBackend('webhook');
      expect(existsSync(tmpConfigPath)).toBe(true);
      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.backends).toContain('webhook');
    });
  });

  describe('disableBackend', () => {
    it('removes kind from backends array', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({ notifications: { backends: ['kimaki', 'webhook'] } }),
      );
      _resetConfigCache();

      disableBackend('kimaki');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.backends).toEqual(['webhook']);
    });

    it('does nothing if kind not in array', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({ notifications: { backends: ['webhook'] } }),
      );
      _resetConfigCache();

      disableBackend('telegram');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.backends).toEqual(['webhook']);
    });
  });

  describe('getBackendConfig', () => {
    it('returns backend-specific config section', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({
          notifications: {
            telegram: { botToken: 'bot123:ABC', defaultChatId: '-518192' },
          },
        }),
      );
      _resetConfigCache();

      const config = getBackendConfig('telegram');
      expect(config.botToken).toBe('bot123:ABC');
      expect(config.defaultChatId).toBe('-518192');
    });

    it('maps openclaw-agent-deliver to openclaw config key', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({
          notifications: {
            openclaw: { hooksUrl: 'https://hooks.example.com' },
          },
        }),
      );
      _resetConfigCache();

      const config = getBackendConfig('openclaw-agent-deliver');
      expect(config.hooksUrl).toBe('https://hooks.example.com');
    });

    it('returns empty object when no config section exists', () => {
      writeFileSync(tmpConfigPath, JSON.stringify({}));
      _resetConfigCache();
      expect(getBackendConfig('kimaki')).toEqual({});
    });
  });

  describe('setBackendConfig', () => {
    it('sets a value in backend-specific config section', () => {
      writeFileSync(tmpConfigPath, JSON.stringify({}));
      _resetConfigCache();

      setBackendConfig('telegram', 'botToken', 'bot123:ABC');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.telegram.botToken).toBe('bot123:ABC');
    });

    it('maps openclaw-agent-deliver to openclaw config key', () => {
      writeFileSync(tmpConfigPath, JSON.stringify({}));
      _resetConfigCache();

      setBackendConfig('openclaw-agent-deliver', 'hooksUrl', 'https://hooks.example.com');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.notifications.openclaw.hooksUrl).toBe('https://hooks.example.com');
    });

    it('preserves existing config values', () => {
      writeFileSync(
        tmpConfigPath,
        JSON.stringify({
          runner: { maxParallel: 2 },
          notifications: { telegram: { botToken: 'existing' } },
        }),
      );
      _resetConfigCache();

      setBackendConfig('telegram', 'defaultChatId', '-518192');

      const raw = JSON.parse(readFileSync(tmpConfigPath, 'utf-8'));
      expect(raw.runner.maxParallel).toBe(2);
      expect(raw.notifications.telegram.botToken).toBe('existing');
      expect(raw.notifications.telegram.defaultChatId).toBe('-518192');
    });
  });
});
