/**
 * `pilot models` — View and edit model assignments.
 *
 * Command handlers:
 * - modelsShowCommand: Display current model mapping as a table
 * - modelsEditCommand: Interactive model reassignment
 * - modelsResetCommand: Reset to built-in defaults
 * - modelsAddProviderCommand: Create custom provider mode
 * - modelsRemoveProviderCommand: Delete custom provider mode
 * - modelsDiffCommand: Show customized vs defaults
 * - modelsExportCommand: Export config as JSON
 * - modelsImportCommand: Import config from JSON file
 *
 * Uses Node.js built-in readline for interactive edit (same pattern as init.ts).
 */

import { readFileSync } from 'node:fs';
import readline from 'node:readline';
import {
  getAllEntriesForMode,
  getProviderModes,
  getProviderMode,
  isCustomized,
  setModelEntry,
  addProviderMode,
  removeProviderMode,
  cloneProviderMode,
  resetProviderMode,
  resetAllToDefaults,
} from '../core/model-store.js';
import { getConfigFileDefaults } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, yellow, green, cyan, red } from '../util/colors.js';
import type { ModelProfileRow, ProviderModeRow } from '../core/types.js';
import type { ModelProfile } from '../core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

const PROFILES: ModelProfile[] = ['quality', 'balanced', 'budget'];

/** Pad string to fixed width. */
function pad(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/** Prompt user for input with optional validation and default. */
function ask(
  rl: readline.Interface,
  question: string,
  options?: { choices?: string[]; defaultValue?: string },
): Promise<string> {
  return new Promise((resolve) => {
    const defaultHint = options?.defaultValue ? ` (default: ${options.defaultValue})` : '';
    rl.question(`  ${question}${defaultHint}: `, (answer) => {
      const trimmed = answer.trim();

      // Use default if empty
      if (!trimmed && options?.defaultValue) {
        resolve(options.defaultValue);
        return;
      }

      // Validate against choices if provided
      if (options?.choices && trimmed) {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= options.choices.length) {
          resolve(options.choices[num - 1]);
          return;
        }
        if (options.choices.includes(trimmed)) {
          resolve(trimmed);
          return;
        }
        process.stdout.write(`  ${yellow('Invalid choice. Please try again.')}\n`);
        resolve(ask(rl, question, options));
        return;
      }

      resolve(trimmed || options?.defaultValue || '');
    });
  });
}

// ── Show command ──────────────────────────────────────────────────────────

interface ShowOptions {
  json?: boolean;
  providerMode?: string;
}

/**
 * `pilot models` / `pilot models show [mode]`
 *
 * Display current model mapping as a table, grouped by agent/scope.
 * Customized entries (differing from AGENT_MODELS defaults) are highlighted.
 */
async function modelsShowCommand(opts: ShowOptions): Promise<void> {
  const defaults = getConfigFileDefaults();
  const mode = opts.providerMode ?? defaults.providerMode;
  const allModes = getProviderModes();

  const entries = getAllEntriesForMode(mode);
  if (entries.length === 0) {
    if (isJsonMode()) {
      outputJson({ error: `Provider mode '${mode}' not found.` });
    } else {
      outputHuman(`\n  ${yellow(`Provider mode '${mode}' not found.`)} Run ${cyan('pilot models')} to see available modes.\n`);
    }
    return;
  }

  // Check which entries are customized
  const entryWithCustom = entries.map((e) => ({
    ...e,
    customized: isCustomized(e.provider_mode, e.agent_or_scope, e.profile as ModelProfile),
  }));

  if (isJsonMode()) {
    outputJson({
      providerMode: mode,
      entries: entryWithCustom.map((e) => ({
        providerMode: e.provider_mode,
        agentOrScope: e.agent_or_scope,
        profile: e.profile,
        model: e.model,
        variant: e.variant,
        customized: e.customized,
      })),
    });
    return;
  }

  // Group entries by agent_or_scope
  const agentEntries = new Map<string, Map<string, { model: string; variant: string | null; customized: boolean }>>();
  const scopeEntries = new Map<string, Map<string, { model: string; variant: string | null; customized: boolean }>>();

  for (const e of entryWithCustom) {
    const targetMap = e.agent_or_scope.startsWith('_top:') ? scopeEntries : agentEntries;
    if (!targetMap.has(e.agent_or_scope)) {
      targetMap.set(e.agent_or_scope, new Map());
    }
    targetMap.get(e.agent_or_scope)!.set(e.profile, {
      model: e.model,
      variant: e.variant,
      customized: e.customized,
    });
  }

  // Find the mode row for built-in indicator
  const modeRow = allModes.find((m) => m.name === mode);
  const modeLabel = modeRow?.is_builtin ? 'built-in' : 'custom';

  outputHuman('');
  outputHuman(`  ${bold(`Provider Mode: ${mode}`)} ${dim(`(${modeLabel})`)}`);
  outputHuman('');

  // Render table helper
  const renderTable = (
    label: string,
    groups: Map<string, Map<string, { model: string; variant: string | null; customized: boolean }>>,
  ): void => {
    if (groups.size === 0) return;

    // Calculate column widths
    const nameWidth = Math.max(20, ...Array.from(groups.keys()).map((k) => k.length + 2));
    const profileWidths: Record<string, number> = {};
    for (const profile of PROFILES) {
      let maxLen = profile.length;
      for (const profileMap of groups.values()) {
        const entry = profileMap.get(profile);
        if (entry) {
          const display = entry.variant ? `${entry.model} (${entry.variant})` : entry.model;
          maxLen = Math.max(maxLen, display.length + (entry.customized ? 2 : 0));
        }
      }
      profileWidths[profile] = maxLen + 2; // padding
    }

    outputHuman(`  ${bold(label)}`);
    outputHuman('');

    // Header
    const header = `  ${pad('Agent/Scope', nameWidth)}${PROFILES.map((p) => pad(p, profileWidths[p])).join('')}`;
    outputHuman(header);
    const totalWidth = nameWidth + Object.values(profileWidths).reduce((a, b) => a + b, 0);
    outputHuman(`  ${'─'.repeat(totalWidth)}`);

    // Rows
    for (const [name, profileMap] of groups) {
      let line = `  ${pad(name, nameWidth)}`;
      for (const profile of PROFILES) {
        const entry = profileMap.get(profile);
        if (entry) {
          let display = entry.variant ? `${entry.model} (${entry.variant})` : entry.model;
          if (entry.customized) {
            display = yellow(`${display} *`);
            // Pad based on uncolored length
            const plainLen = (entry.variant ? `${entry.model} (${entry.variant})` : entry.model).length + 2;
            const padding = Math.max(0, profileWidths[profile] - plainLen);
            line += display + ' '.repeat(padding);
          } else {
            line += pad(display, profileWidths[profile]);
          }
        } else {
          line += pad(dim('—'), profileWidths[profile]);
        }
      }
      outputHuman(line);
    }
    outputHuman('');
  };

  renderTable('Agents', agentEntries);
  renderTable('Scopes', scopeEntries);

  // Show legend if any customized
  const hasCustomized = entryWithCustom.some((e) => e.customized);
  if (hasCustomized) {
    outputHuman(`  ${yellow('*')} = customized (differs from built-in default)`);
    outputHuman('');
  }

  // If no specific mode was requested, list available modes
  if (!opts.providerMode) {
    const modeNames = allModes.map((m) => m.name);
    outputHuman(`  ${dim(`Available provider modes: ${modeNames.join(', ')}`)}`);
    outputHuman(`  ${dim(`Use: pilot models show <mode>`)}`);
    outputHuman('');
  }
}

// ── Edit command ──────────────────────────────────────────────────────────

interface EditOptions {
  json?: boolean;
}

/**
 * `pilot models edit`
 *
 * Interactive model reassignment flow:
 * 1. Select provider mode
 * 2. Select agent/scope
 * 3. Select profile(s)
 * 4. Enter new model string
 * 5. Enter variant (optional)
 * 6. Confirm change
 */
async function modelsEditCommand(_opts: EditOptions): Promise<void> {
  const allModes = getProviderModes();
  if (allModes.length === 0) {
    outputHuman(`\n  ${yellow('No provider modes found.')} Run ${cyan('pilot init')} first.\n`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    // If we didn't finish normally, the process will exit
  });

  try {
    outputHuman('');
    outputHuman(`  ${bold('Model Editor')}`);
    outputHuman('');

    // Step 1: Select provider mode
    outputHuman(`  ${bold('Provider modes:')}`);
    const modeNames = allModes.map((m) => m.name);
    for (let i = 0; i < allModes.length; i++) {
      const m = allModes[i];
      const label = m.is_builtin ? dim(' (built-in)') : dim(' (custom)');
      outputHuman(`    [${i + 1}] ${m.name}${label}`);
    }
    const selectedMode = await ask(rl, 'Select provider mode', {
      choices: modeNames,
      defaultValue: modeNames[0],
    });
    outputHuman('');

    // Step 2: Get entries for this mode and list agents/scopes
    const entries = getAllEntriesForMode(selectedMode);
    if (entries.length === 0) {
      outputHuman(`  ${yellow(`No entries found for mode '${selectedMode}'.`)}`);
      return;
    }

    const agentOrScopes = [...new Set(entries.map((e) => e.agent_or_scope))];
    outputHuman(`  ${bold('Agents/Scopes:')}`);
    for (let i = 0; i < agentOrScopes.length; i++) {
      outputHuman(`    [${i + 1}] ${agentOrScopes[i]}`);
    }
    const selectedAgent = await ask(rl, 'Select agent/scope', {
      choices: agentOrScopes,
    });
    outputHuman('');

    // Step 3: Select profile(s)
    outputHuman(`  ${bold('Which profile?')}`);
    outputHuman('    [1] quality  [2] balanced  [3] budget  [4] all');
    const profileChoice = await ask(rl, 'Select profile', {
      choices: ['quality', 'balanced', 'budget', 'all'],
    });
    const selectedProfiles: ModelProfile[] = profileChoice === 'all' ? [...PROFILES] : [profileChoice as ModelProfile];
    outputHuman('');

    // Step 4: Enter new model
    const newModel = await ask(rl, 'New model (provider/model-id)');
    if (!newModel) {
      outputHuman(`  ${yellow('No model provided.')} Cancelled.`);
      return;
    }
    outputHuman('');

    // Step 5: Enter variant (optional)
    const newVariant = await ask(rl, 'Variant (empty for none)');
    outputHuman('');

    // Step 6: Show before/after and confirm
    outputHuman(`  ${bold('Changes:')}`);
    for (const profile of selectedProfiles) {
      const current = entries.find((e) => e.agent_or_scope === selectedAgent && e.profile === profile);
      const currentDisplay = current
        ? (current.variant ? `${current.model} (${current.variant})` : current.model)
        : dim('(not set)');
      const newDisplay = newVariant ? `${newModel} (${newVariant})` : newModel;
      outputHuman(`    ${profile}:`);
      outputHuman(`      Before: ${currentDisplay}`);
      outputHuman(`      After:  ${green(newDisplay)}`);
    }
    outputHuman('');

    const confirm = await ask(rl, 'Apply? (y/n)', { defaultValue: 'n' });
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      outputHuman('  Cancelled.');
      outputHuman('');
      return;
    }

    // Apply changes
    for (const profile of selectedProfiles) {
      setModelEntry(
        selectedMode,
        selectedAgent,
        profile,
        newModel,
        newVariant || null,
      );
    }

    outputHuman('');
    const profileLabel = selectedProfiles.length === 3 ? 'all profiles' : selectedProfiles.join(', ');
    outputHuman(`  ${green('✓')} Updated ${selectedAgent} (${profileLabel}) in ${selectedMode}.`);
    outputHuman('');

    if (isJsonMode()) {
      outputJson({
        action: 'edit',
        providerMode: selectedMode,
        agentOrScope: selectedAgent,
        profiles: selectedProfiles,
        model: newModel,
        variant: newVariant || null,
        applied: true,
      });
    }
  } finally {
    rl.close();
  }
}

// ── Reset command ─────────────────────────────────────────────────────────

interface ResetOptions {
  json?: boolean;
}

/**
 * `pilot models reset [mode]`
 *
 * Reset model assignments to built-in defaults.
 * If mode specified, reset only that mode. Otherwise reset all.
 */
async function modelsResetCommand(providerMode?: string, opts?: ResetOptions): Promise<void> {
  if (providerMode) {
    resetProviderMode(providerMode);
    if (isJsonMode()) {
      outputJson({ reset: true, mode: providerMode });
    } else {
      outputHuman(`\n  ${green('✓')} Reset ${bold(providerMode)} to built-in defaults.\n`);
    }
  } else {
    resetAllToDefaults();
    if (isJsonMode()) {
      outputJson({ reset: true, mode: 'all' });
    } else {
      outputHuman(`\n  ${green('✓')} Reset all model assignments to built-in defaults.\n`);
    }
  }
}

// ── Add Provider command ──────────────────────────────────────────────────

/** Valid provider mode name: lowercase alphanumeric + hyphens, 2-50 chars. */
const PROVIDER_NAME_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

interface AddProviderOptions {
  clone?: string;
  json?: boolean;
}

/**
 * `pilot models add-provider <name>`
 *
 * Create a new custom provider mode, optionally cloning from an existing one.
 */
async function modelsAddProviderCommand(name: string, opts: AddProviderOptions): Promise<void> {
  // Validate name format
  if (!PROVIDER_NAME_RE.test(name)) {
    const msg = `Invalid provider mode name "${name}". Must be 2-50 chars, lowercase alphanumeric + hyphens.`;
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  // Check if already exists
  const existing = getProviderMode(name);
  if (existing) {
    const msg = `Provider mode '${name}' already exists.`;
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  let entryCount = 0;

  if (opts.clone) {
    // Verify source mode exists
    const sourceMode = getProviderMode(opts.clone);
    if (!sourceMode) {
      const msg = `Source provider mode '${opts.clone}' not found.`;
      if (isJsonMode()) {
        outputJson({ error: msg });
      } else {
        process.stderr.write(`  ${red('✗')} ${msg}\n`);
      }
      process.exit(2);
    }

    // Create the mode first, then clone entries
    addProviderMode(name, `Custom mode cloned from ${opts.clone}`, false);
    cloneProviderMode(opts.clone, name);

    const entries = getAllEntriesForMode(name);
    entryCount = entries.length;
  } else {
    // Create empty mode
    addProviderMode(name, 'Custom provider mode', false);
  }

  if (isJsonMode()) {
    outputJson({ created: true, name, entries: entryCount });
  } else {
    if (opts.clone) {
      outputHuman(`\n  ${green('✓')} Created provider mode '${bold(name)}' with ${entryCount} entries cloned from '${opts.clone}'.`);
    } else {
      outputHuman(`\n  ${green('✓')} Created provider mode '${bold(name)}'.`);
      outputHuman(`  ${dim('Populate it with:')} pilot models edit`);
    }
    outputHuman('');
  }
}

// ── Remove Provider command ──────────────────────────────────────────────

interface RemoveProviderOptions {
  json?: boolean;
}

/**
 * `pilot models remove-provider <name>`
 *
 * Remove a custom provider mode and all its model entries.
 * Refuses to remove built-in modes.
 */
async function modelsRemoveProviderCommand(name: string, opts: RemoveProviderOptions): Promise<void> {
  const existing = getProviderMode(name);
  if (!existing) {
    const msg = `Provider mode '${name}' not found.`;
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  if (existing.is_builtin === 1) {
    const msg = `Cannot remove built-in provider mode '${name}'. Only custom modes can be removed.`;
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  removeProviderMode(name);

  if (isJsonMode()) {
    outputJson({ removed: true, name });
  } else {
    outputHuman(`\n  ${green('✓')} Removed provider mode '${bold(name)}' and all its model entries.\n`);
  }
}

// ── Diff command ──────────────────────────────────────────────────────────

interface DiffOptions {
  json?: boolean;
  providerMode?: string;
}

/**
 * `pilot models diff`
 *
 * Show customized entries that differ from their built-in defaults.
 */
async function modelsDiffCommand(opts: DiffOptions): Promise<void> {
  const defaults = getConfigFileDefaults();
  const mode = opts.providerMode ?? defaults.providerMode;

  const entries = getAllEntriesForMode(mode);
  if (entries.length === 0) {
    if (isJsonMode()) {
      outputJson({ providerMode: mode, diffs: [], message: `Provider mode '${mode}' not found or has no entries.` });
    } else {
      outputHuman(`\n  ${yellow(`Provider mode '${mode}' not found or has no entries.`)}\n`);
    }
    return;
  }

  // Collect customized entries with before/after
  const { AGENT_MODELS } = await import('../core/models.js');
  const agentMap = (AGENT_MODELS as Record<string, Record<string, Record<string, { model: string; variant?: string }>>>)[mode];

  interface DiffEntry {
    agentOrScope: string;
    profile: string;
    defaultModel: string | null;
    defaultVariant: string | null;
    currentModel: string;
    currentVariant: string | null;
  }

  const diffs: DiffEntry[] = [];

  for (const e of entries) {
    if (!isCustomized(e.provider_mode, e.agent_or_scope, e.profile as ModelProfile)) continue;

    // Find default value
    let defaultModel: string | null = null;
    let defaultVariant: string | null = null;
    if (agentMap) {
      const profileMap = agentMap[e.agent_or_scope];
      if (profileMap) {
        const defaultEntry = profileMap[e.profile];
        if (defaultEntry) {
          defaultModel = defaultEntry.model;
          defaultVariant = defaultEntry.variant ?? null;
        }
      }
    }

    diffs.push({
      agentOrScope: e.agent_or_scope,
      profile: e.profile,
      defaultModel,
      defaultVariant,
      currentModel: e.model,
      currentVariant: e.variant,
    });
  }

  if (diffs.length === 0) {
    if (isJsonMode()) {
      outputJson({ providerMode: mode, diffs: [] });
    } else {
      outputHuman(`\n  No customizations found for provider mode '${bold(mode)}'.\n`);
    }
    return;
  }

  if (isJsonMode()) {
    outputJson({ providerMode: mode, diffs });
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold(`Customizations in '${mode}':`)} (${diffs.length} changed)`);
  outputHuman('');

  for (const d of diffs) {
    const defaultDisplay = d.defaultModel
      ? (d.defaultVariant ? `${d.defaultModel} (${d.defaultVariant})` : d.defaultModel)
      : dim('(not in defaults)');
    const currentDisplay = d.currentVariant
      ? `${d.currentModel} (${d.currentVariant})`
      : d.currentModel;

    outputHuman(`  ${bold(d.agentOrScope)} (${d.profile}):`);
    outputHuman(`    Default: ${defaultDisplay}`);
    outputHuman(`    Current: ${yellow(currentDisplay)}`);
  }
  outputHuman('');
}

// ── Export command ────────────────────────────────────────────────────────

/**
 * `pilot models export`
 *
 * Export all model_profiles and provider_modes as JSON to stdout.
 */
async function modelsExportCommand(_opts: { json?: boolean }): Promise<void> {
  const modes = getProviderModes();

  const allEntries: ModelProfileRow[] = [];
  for (const m of modes) {
    const entries = getAllEntriesForMode(m.name);
    allEntries.push(...entries);
  }

  const exportData = {
    version: 1,
    provider_modes: modes.map((m) => ({
      name: m.name,
      description: m.description,
      is_builtin: m.is_builtin === 1,
    })),
    model_profiles: allEntries.map((e) => ({
      provider_mode: e.provider_mode,
      agent_or_scope: e.agent_or_scope,
      profile: e.profile,
      model: e.model,
      variant: e.variant,
    })),
  };

  // Always output JSON for export (it's a data dump)
  process.stdout.write(JSON.stringify(exportData, null, 2) + '\n');
}

// ── Import command ────────────────────────────────────────────────────────

interface ImportOptions {
  json?: boolean;
}

interface ImportData {
  version: number;
  provider_modes: Array<{ name: string; description: string; is_builtin?: boolean }>;
  model_profiles: Array<{
    provider_mode: string;
    agent_or_scope: string;
    profile: string;
    model: string;
    variant: string | null;
  }>;
}

/**
 * `pilot models import <file>`
 *
 * Read JSON file and upsert provider modes and model entries.
 */
async function modelsImportCommand(file: string, opts: ImportOptions): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    const msg = `Cannot read file: ${file}`;
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  let data: ImportData;
  try {
    data = JSON.parse(raw) as ImportData;
  } catch {
    const msg = `Invalid JSON in file: ${file}`;
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  // Validate structure
  if (typeof data.version !== 'number' || !Array.isArray(data.provider_modes) || !Array.isArray(data.model_profiles)) {
    const msg = 'Invalid import format. Must have version (number), provider_modes (array), and model_profiles (array).';
    if (isJsonMode()) {
      outputJson({ error: msg });
    } else {
      process.stderr.write(`  ${red('✗')} ${msg}\n`);
    }
    process.exit(2);
  }

  // Upsert provider modes (skip if already exists)
  let modesImported = 0;
  for (const pm of data.provider_modes) {
    const existing = getProviderMode(pm.name);
    if (!existing) {
      addProviderMode(pm.name, pm.description, pm.is_builtin ?? false);
      modesImported++;
    }
  }

  // Upsert model entries
  let entriesImported = 0;
  for (const mp of data.model_profiles) {
    setModelEntry(
      mp.provider_mode,
      mp.agent_or_scope,
      mp.profile as ModelProfile,
      mp.model,
      mp.variant,
    );
    entriesImported++;
  }

  if (isJsonMode()) {
    outputJson({ imported: true, providerModes: modesImported, modelEntries: entriesImported });
  } else {
    outputHuman(`\n  ${green('✓')} Imported ${modesImported} provider modes and ${entriesImported} model entries.\n`);
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

export {
  modelsShowCommand,
  modelsEditCommand,
  modelsResetCommand,
  modelsAddProviderCommand,
  modelsRemoveProviderCommand,
  modelsDiffCommand,
  modelsExportCommand,
  modelsImportCommand,
};
