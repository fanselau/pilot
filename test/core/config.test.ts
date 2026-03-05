/**
 * Tests for resolveProjectDir(), gsdDir resolution, resource management config fields,
 * and config file loading with layered resolution in src/core/config.ts.
 *
 * Covers:
 *   - resolveProjectDir four resolution modes (absolute, tilde, relative, shorthand)
 *   - gsdDir 3-step fallback: PILOT_GSD_DIR env → submodule → ~/pilot-gsd/
 *   - Resource management config fields (sessionMemoryMaxMb, reservedMemoryMb, memoryKillThresholdMb)
 *   - Config file loading: loadConfigFile reads ~/.pilot/config.json
 *   - Resolution order: env var > config file > default
 *   - Missing config file = silent (null), malformed = error, invalid values = error
 *   - getConfigFileDefaults() returns modelProfile, providerMode, scope
 *   - getConfigSource() returns source for each config key
 *   - _resetConfigCache() for test isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// resolveProjectDir calls getConfig() internally, and getConfig() reads
// PILOT_PROJECT_DIR from environment. We control it via env var so we don't
// need to mock the module internals.
const MOCK_PROJECT_DIR = '/home/test/projects';

beforeEach(() => {
  process.env.PILOT_PROJECT_DIR = MOCK_PROJECT_DIR;
});

afterEach(() => {
  delete process.env.PILOT_PROJECT_DIR;
});

// Import after setting env to ensure getConfig picks up the test value
import {
  resolveProjectDir,
  getConfig,
  loadConfigFile,
  getConfigFileDefaults,
  getConfigSource,
  _resetConfigCache,
} from '../../src/core/config.js';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('resolveProjectDir', () => {
  it('returns absolute path as-is', () => {
    const result = resolveProjectDir('/opt/projects/foo');
    expect(result).toBe('/opt/projects/foo');
  });

  it('expands tilde to home directory', () => {
    const result = resolveProjectDir('~/clients/foo');
    expect(result).toBe(path.join(os.homedir(), 'clients/foo'));
  });

  it('resolves "." to current working directory', () => {
    const result = resolveProjectDir('.');
    expect(result).toBe(process.cwd());
  });

  it('resolves "./" relative paths relative to cwd', () => {
    const result = resolveProjectDir('./my-project');
    expect(result).toBe(path.resolve('./my-project'));
  });

  it('resolves "../" relative paths relative to cwd', () => {
    const result = resolveProjectDir('../other');
    expect(result).toBe(path.resolve('../other'));
  });

  it('joins shorthand name to configured projectDir', () => {
    const result = resolveProjectDir('my-project');
    expect(result).toBe(path.join(MOCK_PROJECT_DIR, 'my-project'));
  });

  it('absolute path is not modified even when projectDir differs', () => {
    // Make sure the absolute detection takes priority over any prefix logic
    const absPath = '/tmp/some-other-path';
    expect(resolveProjectDir(absPath)).toBe(absPath);
  });
});

// ── Resource management config fields ─────────────────────────────────────

describe('resource management config fields', () => {
  const ENV_VARS = [
    'PILOT_SESSION_MEMORY_MAX_MB',
    'PILOT_RESERVED_MEMORY_MB',
    'PILOT_MEMORY_KILL_THRESHOLD_MB',
  ] as const;

  afterEach(() => {
    for (const v of ENV_VARS) delete process.env[v];
  });

  it('returns correct defaults when env vars are not set', () => {
    for (const v of ENV_VARS) delete process.env[v];
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(8192);
    expect(config.reservedMemoryMb).toBe(4096);
    expect(config.memoryKillThresholdMb).toBe(2048);
  });

  it('PILOT_SESSION_MEMORY_MAX_MB overrides sessionMemoryMaxMb', () => {
    process.env.PILOT_SESSION_MEMORY_MAX_MB = '4096';
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(4096);
  });

  it('PILOT_RESERVED_MEMORY_MB overrides reservedMemoryMb', () => {
    process.env.PILOT_RESERVED_MEMORY_MB = '8192';
    const config = getConfig();
    expect(config.reservedMemoryMb).toBe(8192);
  });

  it('PILOT_MEMORY_KILL_THRESHOLD_MB overrides memoryKillThresholdMb', () => {
    process.env.PILOT_MEMORY_KILL_THRESHOLD_MB = '1024';
    const config = getConfig();
    expect(config.memoryKillThresholdMb).toBe(1024);
  });

  it('NaN env values fall back to defaults (non-numeric input)', () => {
    process.env.PILOT_SESSION_MEMORY_MAX_MB = 'not-a-number';
    process.env.PILOT_RESERVED_MEMORY_MB = 'invalid';
    process.env.PILOT_MEMORY_KILL_THRESHOLD_MB = 'xyz';
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(8192);
    expect(config.reservedMemoryMb).toBe(4096);
    expect(config.memoryKillThresholdMb).toBe(2048);
  });
});

// ── gsdDir resolution ─────────────────────────────────────────────────────

describe('gsdDir resolution', () => {
  afterEach(() => {
    delete process.env.PILOT_GSD_DIR;
  });

  it('PILOT_GSD_DIR env var overrides all other resolution', () => {
    process.env.PILOT_GSD_DIR = '/custom/gsd-path';
    const config = getConfig();
    expect(config.gsdDir).toBe('/custom/gsd-path');
  });

  it('PILOT_GSD_DIR with tilde expands to home directory', () => {
    process.env.PILOT_GSD_DIR = '~/my-gsd';
    const config = getConfig();
    expect(config.gsdDir).toBe(path.join(os.homedir(), 'my-gsd'));
  });

  it('without env var, resolves to a path containing pilot-gsd', () => {
    delete process.env.PILOT_GSD_DIR;
    const config = getConfig();
    expect(config.gsdDir).toMatch(/pilot-gsd$/);
  });

  it('without env var, resolves to submodule when it exists', () => {
    // In the test environment (running from repo), the submodule exists
    delete process.env.PILOT_GSD_DIR;
    const config = getConfig();
    // Should resolve to <repo_root>/pilot-gsd which exists as submodule
    expect(config.gsdDir).toContain('pilot-gsd');
    // The resolved path should actually exist (submodule was initialized)
    expect(existsSync(config.gsdDir)).toBe(true);
  });
});

// ── Config file loading ───────────────────────────────────────────────────

/**
 * Helper: create a temp config file and point PILOT_CONFIG_FILE at it.
 * Returns the file path for cleanup.
 */
function writeTempConfig(data: Record<string, unknown>): string {
  const tmpDir = path.join(os.tmpdir(), `pilot-config-test-${process.pid}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, 'config.json');
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function writeTempConfigRaw(content: string): string {
  const tmpDir = path.join(os.tmpdir(), `pilot-config-test-${process.pid}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, 'config.json');
  writeFileSync(filePath, content);
  return filePath;
}

function cleanupTempConfig(filePath: string): void {
  const dir = path.dirname(filePath);
  rmSync(dir, { recursive: true, force: true });
}

describe('config file loading', () => {
  let tempConfigPath: string | null = null;

  afterEach(() => {
    _resetConfigCache();
    delete process.env.PILOT_CONFIG_FILE;
    if (tempConfigPath) {
      cleanupTempConfig(tempConfigPath);
      tempConfigPath = null;
    }
  });

  // ── Missing config file = silent ─────────────────────────────────────

  it('returns null when config file does not exist', () => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/path/config.json';
    const result = loadConfigFile();
    expect(result).toBeNull();
  });

  it('getConfig returns defaults when config file is missing', () => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/path/config.json';
    const config = getConfig();
    expect(config.pollInterval).toBe(5);
    expect(config.defaultTimeout).toBe(60);
    expect(config.logLevel).toBe('INFO');
  });

  // ── Valid config file parsing ────────────────────────────────────────

  it('loadConfigFile reads and parses valid JSON', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 10 },
      logging: { level: 'DEBUG' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const result = loadConfigFile();
    expect(result).not.toBeNull();
    expect(result!.runner?.pollInterval).toBe(10);
    expect(result!.logging?.level).toBe('DEBUG');
  });

  // ── Malformed JSON = clear error ─────────────────────────────────────

  it('throws on malformed JSON with file path in error message', () => {
    tempConfigPath = writeTempConfigRaw('{ invalid json }');
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/config\.json/);
  });

  // ── Invalid values = clear error ─────────────────────────────────────

  it('throws on invalid log level', () => {
    tempConfigPath = writeTempConfig({
      logging: { level: 'TRACE' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/level/i);
  });

  it('throws on invalid modelProfile', () => {
    tempConfigPath = writeTempConfig({
      defaults: { modelProfile: 'turbo' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/modelProfile/i);
  });

  it('throws on invalid providerMode', () => {
    tempConfigPath = writeTempConfig({
      defaults: { providerMode: 'gpt-only' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/providerMode/i);
  });

  it('throws on pollInterval < 1', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 0 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/pollInterval/i);
  });

  it('throws on maxParallel < 1 (non-null)', () => {
    tempConfigPath = writeTempConfig({
      runner: { maxParallel: 0 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/maxParallel/i);
  });

  it('allows maxParallel = null (auto-detect)', () => {
    tempConfigPath = writeTempConfig({
      runner: { maxParallel: null },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const result = loadConfigFile();
    expect(result).not.toBeNull();
    expect(result!.runner?.maxParallel).toBeNull();
  });

  // ── Unknown keys are ignored (forward compat) ────────────────────────

  it('ignores unknown top-level keys', () => {
    tempConfigPath = writeTempConfig({
      futureFeature: true,
      runner: { pollInterval: 7 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const result = loadConfigFile();
    expect(result).not.toBeNull();
    expect(result!.runner?.pollInterval).toBe(7);
  });

  // ── Caching ──────────────────────────────────────────────────────────

  it('caches config file after first read', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 15 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const first = loadConfigFile();
    // Overwrite the file with different content
    writeFileSync(tempConfigPath, JSON.stringify({ runner: { pollInterval: 99 } }));
    const second = loadConfigFile();
    // Should still get the cached value
    expect(first).toEqual(second);
    expect(second!.runner?.pollInterval).toBe(15);
  });

  it('_resetConfigCache allows re-reading', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 15 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const first = loadConfigFile();
    expect(first!.runner?.pollInterval).toBe(15);
    // Write new content
    writeFileSync(tempConfigPath, JSON.stringify({ runner: { pollInterval: 99 } }));
    _resetConfigCache();
    const second = loadConfigFile();
    expect(second!.runner?.pollInterval).toBe(99);
  });
});

// ── Resolution order: env var > config file > default ─────────────────────

describe('config resolution order', () => {
  let tempConfigPath: string | null = null;

  afterEach(() => {
    _resetConfigCache();
    delete process.env.PILOT_CONFIG_FILE;
    delete process.env.PILOT_POLL_INTERVAL;
    delete process.env.PILOT_DEFAULT_TIMEOUT;
    delete process.env.PILOT_STUCK_THRESHOLD;
    delete process.env.PILOT_LOG_LEVEL;
    delete process.env.PILOT_SESSION_MEMORY_MAX_MB;
    delete process.env.PILOT_RESERVED_MEMORY_MB;
    delete process.env.PILOT_MEMORY_KILL_THRESHOLD_MB;
    delete process.env.PILOT_TELEGRAM_BOT_TOKEN;
    delete process.env.PILOT_TELEGRAM_CHAT_ID;
    delete process.env.PILOT_OPENCLAW_HOOKS_URL;
    delete process.env.PILOT_OPENCLAW_HOOKS_TOKEN;
    delete process.env.PILOT_DEFAULT_NOTIFY;
    if (tempConfigPath) {
      cleanupTempConfig(tempConfigPath);
      tempConfigPath = null;
    }
  });

  it('config file value used when env var is unset', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 10 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_POLL_INTERVAL;
    const config = getConfig();
    expect(config.pollInterval).toBe(10);
  });

  it('env var overrides config file value', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 10 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    process.env.PILOT_POLL_INTERVAL = '3';
    const config = getConfig();
    expect(config.pollInterval).toBe(3);
  });

  it('default used when both env var and config file are unset', () => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/path/config.json';
    delete process.env.PILOT_POLL_INTERVAL;
    const config = getConfig();
    expect(config.pollInterval).toBe(5);
  });

  it('config file sets defaultTimeout', () => {
    tempConfigPath = writeTempConfig({
      runner: { defaultTimeout: 120 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_DEFAULT_TIMEOUT;
    const config = getConfig();
    expect(config.defaultTimeout).toBe(120);
  });

  it('config file sets stuckThreshold', () => {
    tempConfigPath = writeTempConfig({
      runner: { stuckThreshold: 45 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_STUCK_THRESHOLD;
    const config = getConfig();
    expect(config.stuckThreshold).toBe(45);
  });

  it('config file sets logLevel', () => {
    tempConfigPath = writeTempConfig({
      logging: { level: 'DEBUG' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_LOG_LEVEL;
    const config = getConfig();
    expect(config.logLevel).toBe('DEBUG');
  });

  it('config file sets projectDir with tilde expansion', () => {
    tempConfigPath = writeTempConfig({
      projectDir: '~/custom-projects',
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_PROJECT_DIR;
    const config = getConfig();
    expect(config.projectDir).toBe(path.join(os.homedir(), 'custom-projects'));
  });

  it('config file sets memory fields', () => {
    tempConfigPath = writeTempConfig({
      memory: {
        sessionMaxMb: 4096,
        reservedMb: 2048,
        killThresholdMb: 1024,
      },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_SESSION_MEMORY_MAX_MB;
    delete process.env.PILOT_RESERVED_MEMORY_MB;
    delete process.env.PILOT_MEMORY_KILL_THRESHOLD_MB;
    const config = getConfig();
    expect(config.sessionMemoryMaxMb).toBe(4096);
    expect(config.reservedMemoryMb).toBe(2048);
    expect(config.memoryKillThresholdMb).toBe(1024);
  });

  it('config file sets notification fields', () => {
    tempConfigPath = writeTempConfig({
      notifications: {
        telegramBotToken: 'bot123',
        telegramChatId: 'chat456',
        openclawHooksUrl: 'http://localhost:18789/hooks/agent',
        openclawHooksToken: 'token789',
      },
      defaults: {
        notifyTarget: 'main',
      },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_TELEGRAM_BOT_TOKEN;
    delete process.env.PILOT_TELEGRAM_CHAT_ID;
    delete process.env.PILOT_OPENCLAW_HOOKS_URL;
    delete process.env.PILOT_OPENCLAW_HOOKS_TOKEN;
    delete process.env.PILOT_DEFAULT_NOTIFY;
    const config = getConfig();
    expect(config.telegramBotToken).toBe('bot123');
    expect(config.telegramChatId).toBe('chat456');
    expect(config.openclawHooksUrl).toBe('http://localhost:18789/hooks/agent');
    expect(config.openclawHooksToken).toBe('token789');
    expect(config.defaultNotifySessionKey).toBe('main');
  });

  it('config file sets noColor', () => {
    tempConfigPath = writeTempConfig({
      logging: { noColor: true },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    // NO_COLOR is special — it's a boolean presence check, not a value
    // Config file's noColor should apply when NO_COLOR env var is not set
    delete process.env.NO_COLOR;
    const config = getConfig();
    expect(config.noColor).toBe(true);
  });

  it('config file sets gsdDir', () => {
    tempConfigPath = writeTempConfig({
      gsdDir: '/custom/gsd',
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_GSD_DIR;
    const config = getConfig();
    expect(config.gsdDir).toBe('/custom/gsd');
  });

  it('config file sets maxParallel', () => {
    tempConfigPath = writeTempConfig({
      runner: { maxParallel: 3 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_MAX_PARALLEL;
    const config = getConfig();
    expect(config.maxParallel).toBe(3);
  });
});

// ── getConfigFileDefaults ─────────────────────────────────────────────────

describe('getConfigFileDefaults', () => {
  let tempConfigPath: string | null = null;

  afterEach(() => {
    _resetConfigCache();
    delete process.env.PILOT_CONFIG_FILE;
    if (tempConfigPath) {
      cleanupTempConfig(tempConfigPath);
      tempConfigPath = null;
    }
  });

  it('returns default values when no config file exists', () => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/path/config.json';
    const defaults = getConfigFileDefaults();
    expect(defaults.modelProfile).toBe('balanced');
    expect(defaults.providerMode).toBe('claude-only');
    expect(defaults.scope).toBeNull();
  });

  it('returns config file values for modelProfile and providerMode', () => {
    tempConfigPath = writeTempConfig({
      defaults: {
        modelProfile: 'quality',
        providerMode: 'hybrid',
        scope: 'phase',
      },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const defaults = getConfigFileDefaults();
    expect(defaults.modelProfile).toBe('quality');
    expect(defaults.providerMode).toBe('hybrid');
    expect(defaults.scope).toBe('phase');
  });

  it('returns partial defaults when only some are set in config', () => {
    tempConfigPath = writeTempConfig({
      defaults: {
        modelProfile: 'budget',
      },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const defaults = getConfigFileDefaults();
    expect(defaults.modelProfile).toBe('budget');
    expect(defaults.providerMode).toBe('claude-only'); // default
    expect(defaults.scope).toBeNull(); // default
  });
});

// ── getConfigSource ───────────────────────────────────────────────────────

describe('getConfigSource', () => {
  let tempConfigPath: string | null = null;

  afterEach(() => {
    _resetConfigCache();
    delete process.env.PILOT_CONFIG_FILE;
    delete process.env.PILOT_POLL_INTERVAL;
    delete process.env.PILOT_LOG_LEVEL;
    if (tempConfigPath) {
      cleanupTempConfig(tempConfigPath);
      tempConfigPath = null;
    }
  });

  it('returns "default" when no env var or config file set', () => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/path/config.json';
    delete process.env.PILOT_POLL_INTERVAL;
    expect(getConfigSource('pollInterval')).toBe('default');
  });

  it('returns "config" when value comes from config file', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 10 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_POLL_INTERVAL;
    expect(getConfigSource('pollInterval')).toBe('config');
  });

  it('returns "env" when value comes from env var', () => {
    process.env.PILOT_POLL_INTERVAL = '3';
    expect(getConfigSource('pollInterval')).toBe('env');
  });

  it('returns "env" when env var overrides config file', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 10 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    process.env.PILOT_POLL_INTERVAL = '3';
    expect(getConfigSource('pollInterval')).toBe('env');
  });

  it('returns "auto-detect" for maxParallel when neither env nor config set', () => {
    process.env.PILOT_CONFIG_FILE = '/nonexistent/path/config.json';
    delete process.env.PILOT_MAX_PARALLEL;
    expect(getConfigSource('maxParallel')).toBe('auto-detect');
  });

  it('returns "config" for logLevel from config file', () => {
    tempConfigPath = writeTempConfig({
      logging: { level: 'WARN' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    delete process.env.PILOT_LOG_LEVEL;
    expect(getConfigSource('logLevel')).toBe('config');
  });
});

// ── Additional config file validation edge cases ──────────────────────────

describe('config file validation edge cases', () => {
  let tempConfigPath: string | null = null;

  afterEach(() => {
    _resetConfigCache();
    delete process.env.PILOT_CONFIG_FILE;
    if (tempConfigPath) {
      cleanupTempConfig(tempConfigPath);
      tempConfigPath = null;
    }
  });

  it('throws on negative pollInterval', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: -5 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/pollInterval/i);
  });

  it('throws on defaultTimeout < 1', () => {
    tempConfigPath = writeTempConfig({
      runner: { defaultTimeout: 0 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/defaultTimeout/i);
  });

  it('throws on stuckThreshold < 1', () => {
    tempConfigPath = writeTempConfig({
      runner: { stuckThreshold: -1 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/stuckThreshold/i);
  });

  it('throws on non-numeric pollInterval (string)', () => {
    tempConfigPath = writeTempConfig({
      runner: { pollInterval: 'fast' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/pollInterval/i);
  });

  it('throws on invalid scope value', () => {
    tempConfigPath = writeTempConfig({
      defaults: { scope: 'global' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/scope/i);
  });

  it('allows scope = null (no default)', () => {
    tempConfigPath = writeTempConfig({
      defaults: { scope: null },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const result = loadConfigFile();
    expect(result).not.toBeNull();
    expect(result!.defaults?.scope).toBeNull();
  });

  it('throws on memory.sessionMaxMb < 1', () => {
    tempConfigPath = writeTempConfig({
      memory: { sessionMaxMb: 0 },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    expect(() => loadConfigFile()).toThrowError(/sessionMaxMb/i);
  });

  it('allows empty config file (empty object)', () => {
    tempConfigPath = writeTempConfig({});
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const result = loadConfigFile();
    expect(result).not.toBeNull();
  });

  it('allows config with only unknown keys', () => {
    tempConfigPath = writeTempConfig({
      experimentalFeature: true,
      v3: { enabled: true },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const result = loadConfigFile();
    expect(result).not.toBeNull();
  });
});

// ── getConfigFileDefaults scope variations ─────────────────────────────────

describe('getConfigFileDefaults scope variations', () => {
  let tempConfigPath: string | null = null;

  afterEach(() => {
    _resetConfigCache();
    delete process.env.PILOT_CONFIG_FILE;
    if (tempConfigPath) {
      cleanupTempConfig(tempConfigPath);
      tempConfigPath = null;
    }
  });

  it('returns scope: "quick" when set in config', () => {
    tempConfigPath = writeTempConfig({
      defaults: { scope: 'quick' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const defaults = getConfigFileDefaults();
    expect(defaults.scope).toBe('quick');
  });

  it('returns scope: "phase" when set in config', () => {
    tempConfigPath = writeTempConfig({
      defaults: { scope: 'phase' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const defaults = getConfigFileDefaults();
    expect(defaults.scope).toBe('phase');
  });

  it('returns scope: "milestone" when set in config', () => {
    tempConfigPath = writeTempConfig({
      defaults: { scope: 'milestone' },
    });
    process.env.PILOT_CONFIG_FILE = tempConfigPath;
    const defaults = getConfigFileDefaults();
    expect(defaults.scope).toBe('milestone');
  });

  it('returns all valid modelProfile values from config', () => {
    for (const profile of ['quality', 'balanced', 'budget'] as const) {
      _resetConfigCache();
      if (tempConfigPath) cleanupTempConfig(tempConfigPath);
      tempConfigPath = writeTempConfig({
        defaults: { modelProfile: profile },
      });
      process.env.PILOT_CONFIG_FILE = tempConfigPath;
      const defaults = getConfigFileDefaults();
      expect(defaults.modelProfile).toBe(profile);
    }
  });

  it('returns all valid providerMode values from config', () => {
    for (const mode of ['hybrid', 'claude-only', 'openai-only'] as const) {
      _resetConfigCache();
      if (tempConfigPath) cleanupTempConfig(tempConfigPath);
      tempConfigPath = writeTempConfig({
        defaults: { providerMode: mode },
      });
      process.env.PILOT_CONFIG_FILE = tempConfigPath;
      const defaults = getConfigFileDefaults();
      expect(defaults.providerMode).toBe(mode);
    }
  });
});
