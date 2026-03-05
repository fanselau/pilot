/**
 * Layered config resolution: env var > config file > hardcoded default.
 *
 * Resolves PILOT_* env vars, reads ~/.pilot/config.json (if present),
 * and falls back to hardcoded defaults. Expands ~ to homedir.
 * Pure core module — no UI dependencies.
 */

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  PilotConfig,
  ConfigFileSchema,
  ConfigFileDefaults,
  ConfigSource,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return filepath.replace('~', os.homedir());
  }
  return filepath;
}

// ── Config file loading + validation + caching ────────────────────────────

// undefined = not loaded yet, null = loaded but file missing
let cachedFileConfig: ConfigFileSchema | null | undefined = undefined;

/**
 * Reset the cached config file — exported for test isolation.
 */
function _resetConfigCache(): void {
  cachedFileConfig = undefined;
}

/**
 * Resolve the config file path.
 * PILOT_CONFIG_FILE env var overrides for testing, otherwise ~/.pilot/config.json.
 */
function resolveConfigFilePath(): string {
  if (process.env.PILOT_CONFIG_FILE) {
    return process.env.PILOT_CONFIG_FILE;
  }
  return path.join(os.homedir(), '.pilot', 'config.json');
}

/**
 * Validate known fields in the parsed config file.
 * Throws on invalid values with clear messages including the file path.
 */
function validateConfigFile(config: Record<string, unknown>, filePath: string): void {
  // Validate logging.level
  if (config.logging && typeof config.logging === 'object') {
    const logging = config.logging as Record<string, unknown>;
    if (logging.level !== undefined) {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      if (!validLevels.includes(logging.level as string)) {
        throw new Error(
          `Invalid config value in ${filePath}: logging.level must be one of ${validLevels.join(', ')}, got "${logging.level}"`,
        );
      }
    }
  }

  // Validate defaults.modelProfile
  if (config.defaults && typeof config.defaults === 'object') {
    const defaults = config.defaults as Record<string, unknown>;
    if (defaults.modelProfile !== undefined) {
      const validProfiles = ['quality', 'balanced', 'budget'];
      if (!validProfiles.includes(defaults.modelProfile as string)) {
        throw new Error(
          `Invalid config value in ${filePath}: defaults.modelProfile must be one of ${validProfiles.join(', ')}, got "${defaults.modelProfile}"`,
        );
      }
    }
    if (defaults.providerMode !== undefined) {
      const validModes = ['hybrid', 'claude-only', 'openai-only'];
      if (!validModes.includes(defaults.providerMode as string)) {
        throw new Error(
          `Invalid config value in ${filePath}: defaults.providerMode must be one of ${validModes.join(', ')}, got "${defaults.providerMode}"`,
        );
      }
    }
    if (defaults.scope !== undefined && defaults.scope !== null) {
      const validScopes = ['quick', 'phase', 'milestone'];
      if (!validScopes.includes(defaults.scope as string)) {
        throw new Error(
          `Invalid config value in ${filePath}: defaults.scope must be one of ${validScopes.join(', ')} or null, got "${defaults.scope}"`,
        );
      }
    }
  }

  // Validate runner numeric fields
  if (config.runner && typeof config.runner === 'object') {
    const runner = config.runner as Record<string, unknown>;
    if (runner.pollInterval !== undefined && (typeof runner.pollInterval !== 'number' || runner.pollInterval < 1)) {
      throw new Error(
        `Invalid config value in ${filePath}: runner.pollInterval must be a number >= 1, got ${JSON.stringify(runner.pollInterval)}`,
      );
    }
    if (runner.maxParallel !== undefined && runner.maxParallel !== null) {
      if (typeof runner.maxParallel !== 'number' || runner.maxParallel < 1) {
        throw new Error(
          `Invalid config value in ${filePath}: runner.maxParallel must be a number >= 1 or null, got ${JSON.stringify(runner.maxParallel)}`,
        );
      }
    }
    if (runner.defaultTimeout !== undefined && (typeof runner.defaultTimeout !== 'number' || runner.defaultTimeout < 1)) {
      throw new Error(
        `Invalid config value in ${filePath}: runner.defaultTimeout must be a number >= 1, got ${JSON.stringify(runner.defaultTimeout)}`,
      );
    }
    if (runner.stuckThreshold !== undefined && (typeof runner.stuckThreshold !== 'number' || runner.stuckThreshold < 1)) {
      throw new Error(
        `Invalid config value in ${filePath}: runner.stuckThreshold must be a number >= 1, got ${JSON.stringify(runner.stuckThreshold)}`,
      );
    }
  }

  // Validate memory fields (positive integers)
  if (config.memory && typeof config.memory === 'object') {
    const memory = config.memory as Record<string, unknown>;
    for (const key of ['sessionMaxMb', 'reservedMb', 'killThresholdMb'] as const) {
      if (memory[key] !== undefined && (typeof memory[key] !== 'number' || (memory[key] as number) < 1)) {
        throw new Error(
          `Invalid config value in ${filePath}: memory.${key} must be a positive number, got ${JSON.stringify(memory[key])}`,
        );
      }
    }
  }
}

/**
 * Load and validate ~/.pilot/config.json (or PILOT_CONFIG_FILE override).
 * Returns parsed ConfigFileSchema, or null if file doesn't exist.
 * Throws on malformed JSON or invalid values.
 * Caches after first read — use _resetConfigCache() in tests.
 */
function loadConfigFile(): ConfigFileSchema | null {
  if (cachedFileConfig !== undefined) {
    return cachedFileConfig;
  }

  const filePath = resolveConfigFilePath();

  if (!existsSync(filePath)) {
    cachedFileConfig = null;
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    cachedFileConfig = null;
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse config file ${filePath}: ${(err as Error).message}`,
    );
  }

  validateConfigFile(parsed, filePath);

  // Cast to ConfigFileSchema (unknown keys are simply ignored by TypeScript)
  cachedFileConfig = parsed as ConfigFileSchema;
  return cachedFileConfig;
}

// ── gsdDir resolution ─────────────────────────────────────────────────────

function resolveGsdDir(home: string, fileConfig: ConfigFileSchema | null): string {
  // 1. Explicit env var override (highest priority)
  if (process.env.PILOT_GSD_DIR) {
    return expandTilde(process.env.PILOT_GSD_DIR);
  }

  // 2. Config file
  if (fileConfig?.gsdDir) {
    return expandTilde(fileConfig.gsdDir);
  }

  // 3. Submodule location: <pilot_repo_root>/pilot-gsd/
  //    Works both from source (src/core/ → ../../) and dist (dist/core/ → ../../)
  const pilotRoot = path.resolve(import.meta.dirname, '..', '..');
  const submodulePath = path.join(pilotRoot, 'pilot-gsd');
  if (existsSync(submodulePath)) {
    return submodulePath;
  }

  // 4. Home directory fallback for standalone installs
  const homeFallback = path.join(home, 'pilot-gsd');
  if (existsSync(homeFallback)) {
    return homeFallback;
  }

  // 5. Return submodule path as default — doctor/setup will surface the error
  return submodulePath;
}

// ── Main getConfig ────────────────────────────────────────────────────────

function getConfig(): PilotConfig {
  const home = os.homedir();
  const fileConfig = loadConfigFile();

  // ── projectDir: env > config > default
  const projectDir = expandTilde(
    process.env.PILOT_PROJECT_DIR
    ?? fileConfig?.projectDir
    ?? `${home}/dev`,
  );

  // ── gsdDir: env > config > submodule > home fallback
  const gsdDir = resolveGsdDir(home, fileConfig);

  // ── stuckThreshold: env > config > default (90)
  const stuckThresholdRaw = parseInt(process.env.PILOT_STUCK_THRESHOLD ?? '', 10);
  const stuckThreshold = !Number.isNaN(stuckThresholdRaw)
    ? stuckThresholdRaw
    : fileConfig?.runner?.stuckThreshold ?? 90;

  // ── maxParallel: env > config > auto-detect from RAM
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const defaultMaxParallel = totalMemMb < 12288 ? 1 : totalMemMb < 32768 ? 2 : totalMemMb < 49152 ? 3 : 4;
  const maxParallelRaw = parseInt(process.env.PILOT_MAX_PARALLEL ?? '', 10);
  const maxParallel = !Number.isNaN(maxParallelRaw)
    ? maxParallelRaw
    : fileConfig?.runner?.maxParallel ?? defaultMaxParallel;

  // ── pollInterval: env > config > default (5), min 1
  const pollIntervalRaw = parseInt(process.env.PILOT_POLL_INTERVAL ?? '', 10);
  const pollInterval = !Number.isNaN(pollIntervalRaw)
    ? Math.max(1, pollIntervalRaw)
    : fileConfig?.runner?.pollInterval ?? 5;

  // ── defaultTimeout: env > config > default (60)
  const defaultTimeoutRaw = parseInt(process.env.PILOT_DEFAULT_TIMEOUT ?? '', 10);
  const defaultTimeout = !Number.isNaN(defaultTimeoutRaw)
    ? defaultTimeoutRaw
    : fileConfig?.runner?.defaultTimeout ?? 60;

  // ── sessionMemoryMaxMb: env > config > default (8192)
  const sessionMemoryMaxMbRaw = parseInt(process.env.PILOT_SESSION_MEMORY_MAX_MB ?? '', 10);
  const sessionMemoryMaxMb = !Number.isNaN(sessionMemoryMaxMbRaw)
    ? sessionMemoryMaxMbRaw
    : fileConfig?.memory?.sessionMaxMb ?? 8192;

  // ── reservedMemoryMb: env > config > default (4096)
  const reservedMemoryMbRaw = parseInt(process.env.PILOT_RESERVED_MEMORY_MB ?? '', 10);
  const reservedMemoryMb = !Number.isNaN(reservedMemoryMbRaw)
    ? reservedMemoryMbRaw
    : fileConfig?.memory?.reservedMb ?? 4096;

  // ── memoryKillThresholdMb: env > config > default (2048)
  const memoryKillThresholdMbRaw = parseInt(process.env.PILOT_MEMORY_KILL_THRESHOLD_MB ?? '', 10);
  const memoryKillThresholdMb = !Number.isNaN(memoryKillThresholdMbRaw)
    ? memoryKillThresholdMbRaw
    : fileConfig?.memory?.killThresholdMb ?? 2048;

  // ── logLevel: env > config > default (INFO)
  const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
  type LogLevel = typeof validLogLevels[number];
  const logLevelEnv = process.env.PILOT_LOG_LEVEL?.toUpperCase();
  let logLevel: LogLevel;
  if (logLevelEnv && (validLogLevels as readonly string[]).includes(logLevelEnv)) {
    logLevel = logLevelEnv as LogLevel;
  } else if (!logLevelEnv && fileConfig?.logging?.level) {
    logLevel = fileConfig.logging.level;
  } else {
    logLevel = 'INFO';
  }

  // ── noColor: NO_COLOR env > config > default (false)
  const noColor = process.env.NO_COLOR !== undefined
    ? true
    : fileConfig?.logging?.noColor ?? false;

  // ── Telegram notification fields: env > config > null
  const telegramBotToken = process.env.PILOT_TELEGRAM_BOT_TOKEN
    ?? fileConfig?.notifications?.telegramBotToken ?? null;
  const telegramChatId = process.env.PILOT_TELEGRAM_CHAT_ID
    ?? fileConfig?.notifications?.telegramChatId ?? null;

  // ── OpenClaw hooks fields: env > config > null
  const openclawHooksUrl = process.env.PILOT_OPENCLAW_HOOKS_URL
    ?? fileConfig?.notifications?.openclawHooksUrl ?? null;
  const openclawHooksToken = process.env.PILOT_OPENCLAW_HOOKS_TOKEN
    ?? fileConfig?.notifications?.openclawHooksToken ?? null;

  // ── Default notify session key: env > config > null
  const defaultNotifySessionKey = process.env.PILOT_DEFAULT_NOTIFY
    ?? fileConfig?.defaults?.notifyTarget ?? null;

  // ── Derived paths (not from env vars)
  const pilotDir = path.join(home, '.pilot');
  const pilotDbPath = path.join(pilotDir, 'pilot.db');

  return {
    pilotDir,
    pilotDbPath,
    projectDir,
    gsdDir,
    stuckThreshold,
    maxParallel,
    pollInterval,
    defaultTimeout,
    sessionMemoryMaxMb,
    reservedMemoryMb,
    memoryKillThresholdMb,
    logLevel,
    noColor,
    telegramBotToken,
    telegramChatId,
    openclawHooksUrl,
    openclawHooksToken,
    defaultNotifySessionKey,
  };
}

// ── Config-only defaults (not in PilotConfig) ─────────────────────────────

/**
 * Returns defaults.modelProfile, defaults.providerMode, defaults.scope
 * from config file, with hardcoded fallbacks.
 * These are NOT part of PilotConfig — used by add.ts and db.ts.
 */
function getConfigFileDefaults(): ConfigFileDefaults {
  const fileConfig = loadConfigFile();
  return {
    modelProfile: fileConfig?.defaults?.modelProfile ?? 'balanced',
    providerMode: fileConfig?.defaults?.providerMode ?? 'claude-only',
    scope: fileConfig?.defaults?.scope ?? null,
  };
}

// ── Config source tracking ────────────────────────────────────────────────

/** Mapping from PilotConfig key to the env var that sets it. */
const ENV_VAR_MAP: Record<string, string> = {
  projectDir: 'PILOT_PROJECT_DIR',
  gsdDir: 'PILOT_GSD_DIR',
  stuckThreshold: 'PILOT_STUCK_THRESHOLD',
  maxParallel: 'PILOT_MAX_PARALLEL',
  pollInterval: 'PILOT_POLL_INTERVAL',
  defaultTimeout: 'PILOT_DEFAULT_TIMEOUT',
  sessionMemoryMaxMb: 'PILOT_SESSION_MEMORY_MAX_MB',
  reservedMemoryMb: 'PILOT_RESERVED_MEMORY_MB',
  memoryKillThresholdMb: 'PILOT_MEMORY_KILL_THRESHOLD_MB',
  logLevel: 'PILOT_LOG_LEVEL',
  noColor: 'NO_COLOR',
  telegramBotToken: 'PILOT_TELEGRAM_BOT_TOKEN',
  telegramChatId: 'PILOT_TELEGRAM_CHAT_ID',
  openclawHooksUrl: 'PILOT_OPENCLAW_HOOKS_URL',
  openclawHooksToken: 'PILOT_OPENCLAW_HOOKS_TOKEN',
  defaultNotifySessionKey: 'PILOT_DEFAULT_NOTIFY',
};

/** Config file key paths for each PilotConfig key. */
const CONFIG_FILE_MAP: Record<string, (fc: ConfigFileSchema) => unknown> = {
  projectDir: (fc) => fc.projectDir,
  gsdDir: (fc) => fc.gsdDir,
  stuckThreshold: (fc) => fc.runner?.stuckThreshold,
  maxParallel: (fc) => fc.runner?.maxParallel,
  pollInterval: (fc) => fc.runner?.pollInterval,
  defaultTimeout: (fc) => fc.runner?.defaultTimeout,
  sessionMemoryMaxMb: (fc) => fc.memory?.sessionMaxMb,
  reservedMemoryMb: (fc) => fc.memory?.reservedMb,
  memoryKillThresholdMb: (fc) => fc.memory?.killThresholdMb,
  logLevel: (fc) => fc.logging?.level,
  noColor: (fc) => fc.logging?.noColor,
  telegramBotToken: (fc) => fc.notifications?.telegramBotToken,
  telegramChatId: (fc) => fc.notifications?.telegramChatId,
  openclawHooksUrl: (fc) => fc.notifications?.openclawHooksUrl,
  openclawHooksToken: (fc) => fc.notifications?.openclawHooksToken,
  defaultNotifySessionKey: (fc) => fc.defaults?.notifyTarget,
};

/** Fields that are auto-detected when neither env var nor config file set them. */
const AUTO_DETECT_FIELDS = new Set(['maxParallel', 'gsdDir']);

/**
 * Returns the source of a config value: 'env', 'config', 'default', or 'auto-detect'.
 */
function getConfigSource(key: string): ConfigSource {
  const envVar = ENV_VAR_MAP[key];

  // Check if env var is set (for numeric fields, must parse to valid number)
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      // For numeric env vars, only count as "env" if the value is a valid number
      if (['stuckThreshold', 'maxParallel', 'pollInterval', 'defaultTimeout',
        'sessionMemoryMaxMb', 'reservedMemoryMb', 'memoryKillThresholdMb'].includes(key)) {
        if (!Number.isNaN(parseInt(envValue, 10))) {
          return 'env';
        }
        // NaN env value falls through to config/default
      } else {
        return 'env';
      }
    }
  }

  // Check if config file has this value
  const fileConfig = loadConfigFile();
  if (fileConfig) {
    const accessor = CONFIG_FILE_MAP[key];
    if (accessor) {
      const fileValue = accessor(fileConfig);
      if (fileValue !== undefined && fileValue !== null) {
        return 'config';
      }
    }
  }

  // Auto-detect or default
  if (AUTO_DETECT_FIELDS.has(key)) {
    return 'auto-detect';
  }

  return 'default';
}

// ── resolveProjectDir ─────────────────────────────────────────────────────

/**
 * Resolve a project argument to an absolute directory path.
 *
 * Resolution order (per requirements/robust-project-path-resolution.md):
 *   1. Absolute path  → use as-is
 *   2. Starts with ~  → expand tilde to home dir
 *   3. `.`, `./`, `../` → resolve relative to process.cwd()
 *   4. Otherwise     → shorthand name: path.join(config.projectDir, project)
 */
function resolveProjectDir(project: string): string {
  // 1. Absolute path
  if (path.isAbsolute(project)) {
    return project;
  }

  // 2. Tilde expansion
  if (project.startsWith('~')) {
    return expandTilde(project);
  }

  // 3. Relative path: `.`, `./something`, `../something`
  if (project === '.' || project.startsWith('./') || project.startsWith('../')) {
    return path.resolve(project);
  }

  // 4. Shorthand name — join with configured project dir
  return path.join(getConfig().projectDir, project);
}

export {
  getConfig,
  resolveProjectDir,
  loadConfigFile,
  getConfigFileDefaults,
  getConfigSource,
  _resetConfigCache,
};
