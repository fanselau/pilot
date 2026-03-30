/**
 * `pilot notify` — Manage notification backends.
 *
 * Subcommands: list, enable, disable, test, config.
 * All operations delegate to core/notify-backends/registry.ts.
 */

import {
  getAllBackends,
  getEnabledBackends,
  enableBackend,
  disableBackend,
  getBackend,
  getBackendConfig,
  setBackendConfig,
} from '../core/notify-backends/registry.js';
import type { NotifyBackendKind, NotifyRoute } from '../core/notify-backends/types.js';
import { outputHuman, outputJson, isJsonMode } from '../util/output.js';
import { bold, dim, green, yellow, red } from '../util/colors.js';

const VALID_KINDS: NotifyBackendKind[] = ['kimaki', 'openclaw-agent-deliver', 'webhook', 'telegram'];

function isValidKind(kind: string): kind is NotifyBackendKind {
  return (VALID_KINDS as string[]).includes(kind);
}

function exitInvalidKind(kind: string): never {
  process.stderr.write(
    `Error: Unknown backend kind '${kind}'. Valid kinds: ${VALID_KINDS.join(', ')}\n`,
  );
  process.exit(1);
}

// ── List ──────────────────────────────────────────────────────────────────

async function notifyListCommand(): Promise<void> {
  const backends = getAllBackends();
  const enabledSet = new Set(getEnabledBackends());

  const rows: Array<{
    kind: string;
    displayName: string;
    enabled: boolean;
    detectResult: string;
  }> = [];

  for (const backend of backends) {
    const detectResult = await backend.detect();
    rows.push({
      kind: backend.kind,
      displayName: backend.displayName,
      enabled: enabledSet.has(backend.kind),
      detectResult,
    });
  }

  if (isJsonMode()) {
    outputJson({ backends: rows });
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Notification Backends')}`);
  outputHuman('');

  for (const row of rows) {
    const kindCol = row.kind.length > 20
      ? row.kind.slice(0, 18) + '…'
      : row.kind;
    const enabledCol = row.enabled ? green('enabled') : dim('disabled');

    let detectCol: string;
    switch (row.detectResult) {
      case 'detected':
        detectCol = green('detected');
        break;
      case 'not-found':
        detectCol = red('not found');
        break;
      case 'available':
        detectCol = dim('available');
        break;
      case 'not-configured':
        detectCol = yellow('not configured');
        break;
      default:
        detectCol = dim(row.detectResult);
    }

    outputHuman(
      `  ${kindCol.padEnd(22)}${row.displayName.padEnd(26)}${enabledCol.padEnd(20)}${detectCol}`,
    );
  }

  outputHuman('');
}

// ── Enable ────────────────────────────────────────────────────────────────

async function notifyEnableCommand(kind: string): Promise<void> {
  if (!isValidKind(kind)) exitInvalidKind(kind);

  const backend = getBackend(kind);
  if (!backend) {
    process.stderr.write(`Error: Backend '${kind}' not found.\n`);
    process.exit(1);
  }

  const validationError = backend.validateConfig();
  if (validationError !== null) {
    process.stderr.write(
      `Cannot enable ${kind}: ${validationError}. Run: pilot notify config ${kind} <key> <value>\n`,
    );
    process.exit(1);
  }

  enableBackend(kind);
  outputHuman(`${green('✓')} Enabled ${kind} backend`);
}

// ── Disable ───────────────────────────────────────────────────────────────

async function notifyDisableCommand(kind: string): Promise<void> {
  if (!isValidKind(kind)) exitInvalidKind(kind);

  disableBackend(kind);
  outputHuman(`${green('✓')} Disabled ${kind} backend`);
}

// ── Test ──────────────────────────────────────────────────────────────────

async function notifyTestCommand(kind: string, target: string): Promise<void> {
  if (!isValidKind(kind)) exitInvalidKind(kind);

  if (kind === 'openclaw-agent-deliver') {
    process.stderr.write('Error: openclaw-agent-deliver test requires project context (too complex for test command).\n');
    process.exit(1);
  }

  const backend = getBackend(kind);
  if (!backend) {
    process.stderr.write(`Error: Backend '${kind}' not found.\n`);
    process.exit(1);
  }

  let route: NotifyRoute;
  switch (kind) {
    case 'kimaki':
      route = { kind: 'kimaki', sessionId: target };
      break;
    case 'webhook':
      route = { kind: 'webhook', url: target };
      break;
    case 'telegram':
      route = { kind: 'telegram', chatId: target };
      break;
    default:
      process.stderr.write(`Error: No test route builder for ${kind}.\n`);
      process.exit(1);
  }

  const prompt = `Test notification from Pilot. Backend: ${kind}. Time: ${new Date().toISOString()}.`;
  const syntheticJob = {
    id: 'test',
    project: 'test',
    status: 'completed',
    description: 'Test notification',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: null,
  };

  const start = performance.now();
  try {
    const result = await backend.deliver(route, prompt, syntheticJob);
    const ms = Math.round(performance.now() - start);

    if (result.ok) {
      outputHuman(`${green('✓')} Test delivered via ${kind} in ${ms}ms`);
    } else {
      process.stderr.write(`${red('✗')} Test failed via ${kind}: ${result.error ?? 'unknown error'}\n`);
      process.exit(1);
    }
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${red('✗')} Test failed via ${kind} in ${ms}ms: ${message}\n`);
    process.exit(1);
  }
}

// ── Config ────────────────────────────────────────────────────────────────

async function notifyConfigCommand(
  kind: string,
  key?: string,
  value?: string,
): Promise<void> {
  if (!isValidKind(kind)) exitInvalidKind(kind);

  if (key !== undefined && value !== undefined) {
    // Set a specific key
    setBackendConfig(kind, key, value);
    outputHuman(`${green('✓')} Set ${kind}.${key}`);
    return;
  }

  // Show config
  const config = getBackendConfig(kind);

  if (key !== undefined) {
    // Show a specific key
    const val = config[key];
    if (val === undefined) {
      outputHuman(`${kind}.${key}: ${dim('(not set)')}`);
    } else {
      const display = shouldMask(key) ? maskSecret(String(val)) : String(val);
      outputHuman(`${kind}.${key}: ${display}`);
    }
    return;
  }

  // Show all config for this backend
  const entries = Object.entries(config);
  if (entries.length === 0) {
    outputHuman(`  No config set for ${kind}. Use: pilot notify config ${kind} <key> <value>`);
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold(kind)} config:`);
  outputHuman('');
  for (const [k, v] of entries) {
    const display = shouldMask(k) ? maskSecret(String(v)) : String(v);
    outputHuman(`  ${k.padEnd(24)}${display}`);
  }
  outputHuman('');
}

function shouldMask(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('token') || lower.includes('secret') || lower.includes('password');
}

function maskSecret(value: string): string {
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  notifyListCommand,
  notifyEnableCommand,
  notifyDisableCommand,
  notifyTestCommand,
  notifyConfigCommand,
};
