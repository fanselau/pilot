/**
 * Notification backend registry.
 *
 * Central module for looking up, enabling/disabling, and configuring
 * notification backends. Reads/writes config via loadConfigFile() directly
 * (not through PilotConfig/getConfig()) since backend config is not part
 * of the resolved runtime config.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfigFile, _resetConfigCache } from '../config.js';
import type { NotifyBackendKind, NotifyBackend } from './types.js';
import { kimakiBackend } from './kimaki.js';
import { openclawBackend } from './openclaw.js';
import { webhookBackend } from './webhook.js';
import { telegramBackend } from './telegram.js';

// ── Static backend map ────────────────────────────────────────────────────

const BACKENDS: Record<NotifyBackendKind, NotifyBackend> = {
  kimaki: kimakiBackend,
  'openclaw-agent-deliver': openclawBackend,
  webhook: webhookBackend,
  telegram: telegramBackend,
};

const VALID_KINDS = new Set<string>(Object.keys(BACKENDS));

// ── Config file helpers ───────────────────────────────────────────────────

/** Resolve the config file path — same logic as config.ts resolveConfigFilePath. */
function resolveConfigFilePath(): string {
  if (process.env.PILOT_CONFIG_FILE) {
    return process.env.PILOT_CONFIG_FILE;
  }
  return path.join(os.homedir(), '.pilot', 'config.json');
}

/** Map backend kind to config section key. */
function configKeyForKind(kind: NotifyBackendKind): string {
  if (kind === 'openclaw-agent-deliver') return 'openclaw';
  return kind;
}

/**
 * Read the raw config file, modify notifications section, write back.
 * Creates the file/directory if it doesn't exist.
 */
function writeNotifications(
  mutate: (notifications: Record<string, unknown>) => void,
): void {
  const configPath = resolveConfigFilePath();
  const configDir = path.dirname(configPath);

  let fileContent: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      fileContent = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // If file exists but is malformed, start fresh
      fileContent = {};
    }
  } else if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (!fileContent.notifications || typeof fileContent.notifications !== 'object') {
    fileContent.notifications = {};
  }

  mutate(fileContent.notifications as Record<string, unknown>);

  const json = JSON.stringify(fileContent, null, 2) + '\n';
  writeFileSync(configPath, json, 'utf-8');
  try { chmodSync(configPath, 0o600); } catch { /* best effort on non-POSIX */ }

  _resetConfigCache();
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Look up a backend by kind. Returns null for unknown kinds.
 */
function getBackend(kind: NotifyBackendKind): NotifyBackend | null {
  return BACKENDS[kind] ?? null;
}

/**
 * Return all registered backends.
 */
function getAllBackends(): NotifyBackend[] {
  return Object.values(BACKENDS);
}

/**
 * Read the enabled backends from config `notifications.backends` array.
 * Filters to valid NotifyBackendKind values. Returns empty array if not set.
 */
function getEnabledBackends(): NotifyBackendKind[] {
  const config = loadConfigFile();
  const notifications = config?.notifications as Record<string, unknown> | undefined;
  const backends = notifications?.backends;

  if (!Array.isArray(backends)) return [];

  return backends.filter(
    (b): b is NotifyBackendKind => typeof b === 'string' && VALID_KINDS.has(b),
  );
}

/**
 * Enable a backend by adding it to `notifications.backends` array.
 */
function enableBackend(kind: NotifyBackendKind): void {
  writeNotifications((notifications) => {
    const backends = Array.isArray(notifications.backends)
      ? (notifications.backends as string[])
      : [];

    if (!backends.includes(kind)) {
      backends.push(kind);
    }
    notifications.backends = backends;
  });
}

/**
 * Disable a backend by removing it from `notifications.backends` array.
 */
function disableBackend(kind: NotifyBackendKind): void {
  writeNotifications((notifications) => {
    const backends = Array.isArray(notifications.backends)
      ? (notifications.backends as string[])
      : [];

    notifications.backends = backends.filter((b) => b !== kind);
  });
}

/**
 * Read backend-specific config section.
 * Maps 'openclaw-agent-deliver' to the 'openclaw' config key.
 */
function getBackendConfig(kind: NotifyBackendKind): Record<string, unknown> {
  const config = loadConfigFile();
  const notifications = config?.notifications as Record<string, unknown> | undefined;
  if (!notifications) return {};

  const key = configKeyForKind(kind);
  const section = notifications[key];
  if (section && typeof section === 'object') {
    return section as Record<string, unknown>;
  }
  return {};
}

/**
 * Set a backend-specific config value.
 * Maps 'openclaw-agent-deliver' to the 'openclaw' config key.
 */
function setBackendConfig(kind: NotifyBackendKind, key: string, value: unknown): void {
  const configKey = configKeyForKind(kind);

  writeNotifications((notifications) => {
    if (!notifications[configKey] || typeof notifications[configKey] !== 'object') {
      notifications[configKey] = {};
    }
    (notifications[configKey] as Record<string, unknown>)[key] = value;
  });
}

export {
  getBackend,
  getAllBackends,
  getEnabledBackends,
  enableBackend,
  disableBackend,
  getBackendConfig,
  setBackendConfig,
};
