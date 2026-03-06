/**
 * `pilot config` command group — init, set, get, edit, path, show.
 *
 * Manages ~/.pilot/config.json and displays resolved configuration
 * with source annotations (default/config/env/auto-detect).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { getConfig, getConfigSource, getConfigFileDefaults, loadConfigFile } from '../core/config.js';
import type { ConfigSource } from '../core/types.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, green, yellow, red } from '../util/colors.js';
import { errMsg } from '../util/errors.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Resolve the config file path. */
function getConfigFilePath(): string {
  if (process.env.PILOT_CONFIG_FILE) {
    return process.env.PILOT_CONFIG_FILE;
  }
  return path.join(os.homedir(), '.pilot', 'config.json');
}

/** Mask sensitive values: show first 4 chars + **** or (not set). */
function maskSecret(value: string | null): string {
  if (value === null || value === undefined || value === '') return dim('(not set)');
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}

/** Format source annotation for display. */
function formatSource(source: ConfigSource, key: string): string {
  switch (source) {
    case 'env': {
      const envVarMap: Record<string, string> = {
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
      return dim(`(env: ${envVarMap[key] ?? 'PILOT_*'})`);
    }
    case 'config': return dim('(config)');
    case 'auto-detect': return dim('(auto-detect)');
    case 'default': return dim('(default)');
    default: return dim(`(${source})`);
  }
}

/** Secret fields that should be masked in output. */
const SECRET_FIELDS = new Set([
  'telegramBotToken',
  'telegramChatId',
  'openclawHooksUrl',
  'openclawHooksToken',
]);

/** All PilotConfig display fields with optional units. */
const CONFIG_DISPLAY: Array<{ key: string; unit?: string; secret?: boolean }> = [
  { key: 'pilotDir' },
  { key: 'pilotDbPath' },
  { key: 'projectDir' },
  { key: 'gsdDir' },
  { key: 'stuckThreshold', unit: 'minutes' },
  { key: 'maxParallel' },
  { key: 'pollInterval', unit: 'seconds' },
  { key: 'defaultTimeout', unit: 'minutes' },
  { key: 'sessionMemoryMaxMb', unit: 'MB' },
  { key: 'reservedMemoryMb', unit: 'MB' },
  { key: 'memoryKillThresholdMb', unit: 'MB' },
  { key: 'logLevel' },
  { key: 'noColor' },
  { key: 'telegramBotToken', secret: true },
  { key: 'telegramChatId', secret: true },
  { key: 'openclawHooksUrl', secret: true },
  { key: 'openclawHooksToken', secret: true },
  { key: 'defaultNotifySessionKey' },
];

// ── Default config file content ──────────────────────────────────────────

function getDefaultConfigFileContent(): Record<string, unknown> {
  return {
    projectDir: '~/dev',
    gsdDir: null,
    runner: {
      maxParallel: null,
      pollInterval: 5,
      defaultTimeout: 60,
      stuckThreshold: 90,
    },
    memory: {
      sessionMaxMb: 8192,
      reservedMb: 4096,
      killThresholdMb: 2048,
    },
    defaults: {
      modelProfile: 'balanced',
      providerMode: 'claude-only',
      notifyTarget: null,
      scope: null,
    },
    notifications: {
      openclawHooksUrl: null,
      openclawHooksToken: null,
      telegramBotToken: null,
      telegramChatId: null,
    },
    logging: {
      level: 'INFO',
      noColor: false,
    },
  };
}

// ── Dot-notation key mapping for config set/get ──────────────────────────

/** Map of dot-notation keys to their validation rules. */
interface FieldSpec {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'nullable-string' | 'nullable-number';
  path: string[];         // path in config file object
  enum?: string[];        // allowed values for enum type
  min?: number;           // min value for number type
}

const CONFIG_FIELD_SPECS: Record<string, FieldSpec> = {
  'projectDir': { type: 'string', path: ['projectDir'] },
  'gsdDir': { type: 'nullable-string', path: ['gsdDir'] },
  'runner.maxParallel': { type: 'nullable-number', path: ['runner', 'maxParallel'], min: 1 },
  'runner.pollInterval': { type: 'number', path: ['runner', 'pollInterval'], min: 1 },
  'runner.defaultTimeout': { type: 'number', path: ['runner', 'defaultTimeout'], min: 1 },
  'runner.stuckThreshold': { type: 'number', path: ['runner', 'stuckThreshold'], min: 1 },
  'memory.sessionMaxMb': { type: 'number', path: ['memory', 'sessionMaxMb'], min: 1 },
  'memory.reservedMb': { type: 'number', path: ['memory', 'reservedMb'], min: 1 },
  'memory.killThresholdMb': { type: 'number', path: ['memory', 'killThresholdMb'], min: 1 },
  'defaults.modelProfile': { type: 'enum', path: ['defaults', 'modelProfile'], enum: ['quality', 'balanced', 'budget'] },
  'defaults.providerMode': { type: 'enum', path: ['defaults', 'providerMode'], enum: ['hybrid', 'claude-only', 'openai-only'] },
  'defaults.notifyTarget': { type: 'nullable-string', path: ['defaults', 'notifyTarget'] },
  'defaults.scope': { type: 'enum', path: ['defaults', 'scope'], enum: ['quick', 'phase', 'milestone'] },
  'notifications.openclawHooksUrl': { type: 'nullable-string', path: ['notifications', 'openclawHooksUrl'] },
  'notifications.openclawHooksToken': { type: 'nullable-string', path: ['notifications', 'openclawHooksToken'] },
  'notifications.telegramBotToken': { type: 'nullable-string', path: ['notifications', 'telegramBotToken'] },
  'notifications.telegramChatId': { type: 'nullable-string', path: ['notifications', 'telegramChatId'] },
  'logging.level': { type: 'enum', path: ['logging', 'level'], enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'] },
  'logging.noColor': { type: 'boolean', path: ['logging', 'noColor'] },
};

/** Parse and validate a value string for a given field spec. */
function parseFieldValue(key: string, valueStr: string, spec: FieldSpec): unknown {
  // Handle "null" for nullable types
  if (valueStr === 'null') {
    if (spec.type === 'nullable-string' || spec.type === 'nullable-number') {
      return null;
    }
    // Also allow null for enum fields that support null (like defaults.scope)
    if (spec.type === 'enum' && key === 'defaults.scope') {
      return null;
    }
    throw new Error(`${key} does not accept null`);
  }

  switch (spec.type) {
    case 'string':
    case 'nullable-string':
      return valueStr;

    case 'number':
    case 'nullable-number': {
      const num = Number(valueStr);
      if (Number.isNaN(num)) {
        throw new Error(`${key} must be a number, got "${valueStr}"`);
      }
      if (spec.min !== undefined && num < spec.min) {
        throw new Error(`${key} must be >= ${spec.min}, got ${num}`);
      }
      return num;
    }

    case 'boolean': {
      if (valueStr === 'true') return true;
      if (valueStr === 'false') return false;
      throw new Error(`${key} must be "true" or "false", got "${valueStr}"`);
    }

    case 'enum': {
      if (!spec.enum?.includes(valueStr)) {
        throw new Error(`${key} must be one of: ${spec.enum?.join(', ')}, got "${valueStr}"`);
      }
      return valueStr;
    }

    default:
      return valueStr;
  }
}

/** Set a nested value in an object using a path array. */
function setNestedValue(obj: Record<string, unknown>, pathArr: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const segment = pathArr[i];
    if (current[segment] === undefined || current[segment] === null || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[pathArr[pathArr.length - 1]] = value;
}

/** Get a nested value from an object using a path array. */
function getNestedValue(obj: Record<string, unknown>, pathArr: string[]): unknown {
  let current: unknown = obj;
  for (const segment of pathArr) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// ── Config-only defaults mapping for get command ─────────────────────────

/** Map dot-notation keys for config-file-only defaults to getConfigFileDefaults(). */
const CONFIG_ONLY_KEYS: Record<string, (defaults: ReturnType<typeof getConfigFileDefaults>) => unknown> = {
  'defaults.modelProfile': (d) => d.modelProfile,
  'defaults.providerMode': (d) => d.providerMode,
  'defaults.scope': (d) => d.scope,
};

// ── PilotConfig flat key mapping for get command ─────────────────────────

/** Map dot-notation keys to PilotConfig keys (for resolved values). */
const DOT_TO_PILOT_KEY: Record<string, string> = {
  'projectDir': 'projectDir',
  'gsdDir': 'gsdDir',
  'runner.maxParallel': 'maxParallel',
  'runner.pollInterval': 'pollInterval',
  'runner.defaultTimeout': 'defaultTimeout',
  'runner.stuckThreshold': 'stuckThreshold',
  'memory.sessionMaxMb': 'sessionMemoryMaxMb',
  'memory.reservedMb': 'reservedMemoryMb',
  'memory.killThresholdMb': 'memoryKillThresholdMb',
  'defaults.notifyTarget': 'defaultNotifySessionKey',
  'notifications.openclawHooksUrl': 'openclawHooksUrl',
  'notifications.openclawHooksToken': 'openclawHooksToken',
  'notifications.telegramBotToken': 'telegramBotToken',
  'notifications.telegramChatId': 'telegramChatId',
  'logging.level': 'logLevel',
  'logging.noColor': 'noColor',
};

// ── Subcommand implementations ───────────────────────────────────────────

/**
 * `pilot config` (default action) — Show all resolved config with sources.
 */
async function configShowCommand(): Promise<void> {
  const config = getConfig();
  const fileDefaults = getConfigFileDefaults();

  if (isJsonMode()) {
    // Build source map
    const sourceMap: Record<string, ConfigSource> = {};
    for (const { key } of CONFIG_DISPLAY) {
      sourceMap[key] = getConfigSource(key);
    }
    outputJson({
      config,
      configFileDefaults: fileDefaults,
      sources: sourceMap,
    });
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Pilot v2 Configuration')}`);
  outputHuman('');

  const configObj = config as unknown as Record<string, unknown>;

  for (const { key, unit, secret } of CONFIG_DISPLAY) {
    const rawValue = configObj[key];
    const source = getConfigSource(key);
    const displayValue = secret ? maskSecret(rawValue as string | null) : String(rawValue);
    const unitStr = unit ? ` ${dim(unit)}` : '';
    const sourceStr = formatSource(source, key);

    outputHuman(`  ${key.padEnd(26)} ${displayValue}${unitStr}  ${sourceStr}`);
  }

  // Config-file-only defaults
  outputHuman('');
  outputHuman(`  ${bold('Config File Defaults')}`);
  outputHuman('');
  outputHuman(`  ${'defaults.modelProfile'.padEnd(26)} ${fileDefaults.modelProfile}  ${dim('(config-default)')}`);
  outputHuman(`  ${'defaults.providerMode'.padEnd(26)} ${fileDefaults.providerMode}  ${dim('(config-default)')}`);
  outputHuman(`  ${'defaults.scope'.padEnd(26)} ${fileDefaults.scope ?? dim('(not set)')}  ${dim('(config-default)')}`);
  outputHuman('');
}

/**
 * `pilot config init` — Create config file with defaults.
 */
async function configInitCommand(opts: { defaults?: boolean }): Promise<void> {
  const configPath = getConfigFilePath();
  const configDir = path.dirname(configPath);

  // Check if file already exists
  if (existsSync(configPath)) {
    outputHuman(yellow(`  Config file already exists: ${configPath}`));
    outputHuman(dim(`  Use 'pilot config edit' to modify or 'pilot config set' for individual values.`));
    return;
  }

  // Create directory if needed
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Write defaults
  const defaults = getDefaultConfigFileContent();
  const json = JSON.stringify(defaults, null, 2) + '\n';
  writeFileSync(configPath, json, 'utf-8');
  chmodSync(configPath, 0o600);

  outputHuman(green(`  ✓ Config written to ${configPath}`));
  if (opts.defaults) {
    outputHuman(dim(`  All default values written.`));
  } else {
    outputHuman(dim(`  Default values written. Edit with 'pilot config edit' to customize.`));
  }
}

/**
 * `pilot config set <key> <value>` — Update a single config value.
 */
async function configSetCommand(key: string, value: string): Promise<void> {
  // Validate key
  const spec = CONFIG_FIELD_SPECS[key];
  if (!spec) {
    const validKeys = Object.keys(CONFIG_FIELD_SPECS).sort();
    outputHuman(red(`  Unknown config key: ${key}`));
    outputHuman('');
    outputHuman(dim(`  Valid keys:`));
    for (const k of validKeys) {
      outputHuman(dim(`    ${k}`));
    }
    process.exitCode = 1;
    return;
  }

  // Parse and validate value
  let parsedValue: unknown;
  try {
    parsedValue = parseFieldValue(key, value, spec);
  } catch (err) {
    outputHuman(red(`  Invalid value: ${errMsg(err)}`));
    process.exitCode = 1;
    return;
  }

  // Read existing config file or start fresh
  const configPath = getConfigFilePath();
  const configDir = path.dirname(configPath);
  let fileContent: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      fileContent = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      outputHuman(red(`  Failed to read config file: ${configPath}`));
      process.exitCode = 1;
      return;
    }
  } else {
    // Create directory if needed
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  // Set the value
  setNestedValue(fileContent, spec.path, parsedValue);

  // Write back
  const json = JSON.stringify(fileContent, null, 2) + '\n';
  writeFileSync(configPath, json, 'utf-8');
  chmodSync(configPath, 0o600);

  // Display confirmation
  const displayValue = parsedValue === null ? 'null' : JSON.stringify(parsedValue);
  outputHuman(green(`  Set ${key} = ${displayValue}`));
}

/**
 * `pilot config get <key>` — Print a single resolved config value.
 */
async function configGetCommand(key: string): Promise<void> {
  // Check config-only defaults first
  if (CONFIG_ONLY_KEYS[key]) {
    const fileDefaults = getConfigFileDefaults();
    const value = CONFIG_ONLY_KEYS[key](fileDefaults);

    if (isJsonMode()) {
      // For config-only keys, source is always config or default
      const fileConfig = loadConfigFile();
      let source: ConfigSource = 'default';
      if (fileConfig) {
        const rawValue = getNestedValue(fileConfig as unknown as Record<string, unknown>, CONFIG_FIELD_SPECS[key]?.path ?? []);
        if (rawValue !== undefined && rawValue !== null) {
          source = 'config';
        }
      }
      outputJson({ key, value, source });
    } else {
      outputHuman(String(value ?? 'null'));
    }
    return;
  }

  // Map dot-notation to PilotConfig key
  const pilotKey = DOT_TO_PILOT_KEY[key];
  if (!pilotKey) {
    // Also try as direct PilotConfig key
    const config = getConfig();
    const configObj = config as unknown as Record<string, unknown>;
    if (key in configObj) {
      const value = configObj[key];
      if (isJsonMode()) {
        outputJson({ key, value: value, source: getConfigSource(key) });
      } else {
        outputHuman(String(value ?? 'null'));
      }
      return;
    }

    outputHuman(red(`  Unknown config key: ${key}`));
    process.exitCode = 1;
    return;
  }

  const config = getConfig();
  const configObj = config as unknown as Record<string, unknown>;
  const value = configObj[pilotKey];

  if (isJsonMode()) {
    outputJson({ key, value: value, source: getConfigSource(pilotKey) });
  } else {
    outputHuman(String(value ?? 'null'));
  }
}

/**
 * `pilot config path` — Print the config file path.
 */
async function configPathCommand(): Promise<void> {
  const configPath = getConfigFilePath();
  const exists = existsSync(configPath);

  if (isJsonMode()) {
    outputJson({ path: configPath, exists });
    return;
  }

  outputHuman(configPath);
  if (!exists) {
    outputHuman(dim(`  (file does not exist — run 'pilot config init' to create)`));
  }
}

/**
 * `pilot config edit` — Open config file in $EDITOR.
 */
async function configEditCommand(): Promise<void> {
  const configPath = getConfigFilePath();
  const configDir = path.dirname(configPath);

  // Create config with defaults if it doesn't exist
  if (!existsSync(configPath)) {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const defaults = getDefaultConfigFileContent();
    const json = JSON.stringify(defaults, null, 2) + '\n';
    writeFileSync(configPath, json, 'utf-8');
    chmodSync(configPath, 0o600);
    outputHuman(dim(`  Created ${configPath} with defaults.`));
  }

  const editor = process.env.EDITOR ?? 'vi';
  outputHuman(dim(`  Opening ${configPath} in ${editor}...`));

  try {
    execSync(`${editor} ${configPath}`, { stdio: 'inherit' });
  } catch {
    outputHuman(red(`  Failed to open editor: ${editor}`));
    outputHuman(dim(`  Set $EDITOR environment variable to your preferred editor.`));
    process.exitCode = 1;
  }
}

// Backward compatibility alias
const configCommand = configShowCommand;

export {
  configCommand,
  configShowCommand,
  configInitCommand,
  configSetCommand,
  configGetCommand,
  configPathCommand,
  configEditCommand,
};
