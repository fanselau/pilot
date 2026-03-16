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
import { errMsg } from '../util/errors.js';
import type {
  PilotConfig,
  ConfigFileSchema,
  ConfigFileDefaults,
  ConfigSource,
} from './types.js';

/** Internal poll interval — hardcoded, not user-configurable. */
export const POLL_INTERVAL_SECONDS = 5;

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
  /** Validate that a value is one of the allowed enum values. */
  function assertEnum(keyPath: string, value: unknown, allowed: string[]): void {
    if (!allowed.includes(value as string)) {
      throw new Error(
        `Invalid config value in ${filePath}: ${keyPath} must be one of ${allowed.join(', ')}, got "${value}"`,
      );
    }
  }

  /** Validate that a value is a number >= min. */
  function assertMinNumber(keyPath: string, value: unknown, min: number): void {
    if (typeof value !== 'number' || value < min) {
      throw new Error(
        `Invalid config value in ${filePath}: ${keyPath} must be a number >= ${min}, got ${JSON.stringify(value)}`,
      );
    }
  }

  /** Validate that a value is a non-negative integer. */
  function assertNonNegativeInteger(keyPath: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(
        `Invalid config value in ${filePath}: ${keyPath} must be an integer >= 0, got ${JSON.stringify(value)}`,
      );
    }
  }

  // ── logging ──
  if (config.logging && typeof config.logging === 'object') {
    const logging = config.logging as Record<string, unknown>;
    if (logging.level !== undefined) {
      assertEnum('logging.level', logging.level, ['DEBUG', 'INFO', 'WARN', 'ERROR']);
    }
  }

  // ── defaults ──
  if (config.defaults && typeof config.defaults === 'object') {
    const defaults = config.defaults as Record<string, unknown>;
    if (defaults.modelProfile !== undefined) {
      assertEnum('defaults.modelProfile', defaults.modelProfile, ['quality', 'balanced', 'budget']);
    }
    if (defaults.providerMode !== undefined) {
      // Accept any non-empty string — custom provider modes from provider_modes table are valid.
      // Actual validation happens at resolution time (resolveAgentModel / resolveTopLevelModel).
      if (typeof defaults.providerMode !== 'string' || defaults.providerMode.length === 0) {
        throw new Error(
          `Invalid config value in ${filePath}: defaults.providerMode must be a non-empty string, got ${JSON.stringify(defaults.providerMode)}`,
        );
      }
    }
    if (defaults.scope !== undefined && defaults.scope !== null) {
      assertEnum('defaults.scope', defaults.scope, ['quick', 'phase', 'milestone']);
    }

    const retryBudgetRaw = defaults.retry_budget ?? defaults.retryBudget;
    if (retryBudgetRaw !== undefined && retryBudgetRaw !== null) {
      assertNonNegativeInteger('defaults.retry_budget', retryBudgetRaw);
    }
  }

  // ── runner numeric fields ──
  if (config.runner && typeof config.runner === 'object') {
    const runner = config.runner as Record<string, unknown>;
    if (runner.maxParallel !== undefined && runner.maxParallel !== null) {
      assertMinNumber('runner.maxParallel', runner.maxParallel, 1);
    }
    if (runner.queueGraceSeconds !== undefined) {
      assertMinNumber('runner.queueGraceSeconds', runner.queueGraceSeconds, 0);
    }
  }

  // ── memory fields (positive numbers) ──
  if (config.memory && typeof config.memory === 'object') {
    const memory = config.memory as Record<string, unknown>;
    for (const key of ['sessionMaxMb', 'reservedMb', 'killThresholdMb'] as const) {
      if (memory[key] !== undefined) assertMinNumber(`memory.${key}`, memory[key], 1);
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
      `Failed to parse config file ${filePath}: ${errMsg(err)}. Fix the JSON syntax or run 'pilot config init' to create a fresh config.`,
    );
  }

  validateConfigFile(parsed, filePath);

  // Cast to ConfigFileSchema (unknown keys are simply ignored by TypeScript)
  cachedFileConfig = parsed as ConfigFileSchema;
  return cachedFileConfig;
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

  // ── maxParallel: env > config > auto-detect from RAM
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const defaultMaxParallel = totalMemMb < 12288 ? 1 : totalMemMb < 32768 ? 2 : totalMemMb < 49152 ? 3 : 4;
  const maxParallelRaw = parseInt(process.env.PILOT_MAX_PARALLEL ?? '', 10);
  const maxParallel = !Number.isNaN(maxParallelRaw)
    ? maxParallelRaw
    : fileConfig?.runner?.maxParallel ?? defaultMaxParallel;

  // ── queueGraceSeconds: env > config > default (120)
  const queueGraceSecondsRaw = parseInt(process.env.PILOT_QUEUE_GRACE_SECONDS ?? '', 10);
  const queueGraceSeconds = !Number.isNaN(queueGraceSecondsRaw)
    ? queueGraceSecondsRaw
    : fileConfig?.runner?.queueGraceSeconds ?? 120;

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
    maxParallel,
    queueGraceSeconds,
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
    retryBudget: fileConfig?.defaults?.retry_budget ?? fileConfig?.defaults?.retryBudget ?? 2,
  };
}

// ── Config source tracking ────────────────────────────────────────────────

/** Mapping from PilotConfig key to the env var that sets it. */
const ENV_VAR_MAP: Record<string, string> = {
  projectDir: 'PILOT_PROJECT_DIR',
  maxParallel: 'PILOT_MAX_PARALLEL',
  queueGraceSeconds: 'PILOT_QUEUE_GRACE_SECONDS',
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
  maxParallel: (fc) => fc.runner?.maxParallel,
  queueGraceSeconds: (fc) => fc.runner?.queueGraceSeconds,
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
const AUTO_DETECT_FIELDS = new Set(['maxParallel']);

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
      if (['maxParallel',
        'queueGraceSeconds', 'sessionMemoryMaxMb', 'reservedMemoryMb', 'memoryKillThresholdMb'].includes(key)) {
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
  // 1. Absolute path — normalize to strip trailing slashes
  if (path.isAbsolute(project)) {
    return path.resolve(project);
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
