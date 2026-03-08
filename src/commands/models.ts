/**
 * `pilot models` — View and edit model assignments.
 *
 * Command handlers:
 * - modelsShowCommand: Display current model mapping as a table
 * - modelsEditCommand: Interactive model reassignment
 * - modelsResetCommand: Reset to built-in defaults
 *
 * Uses Node.js built-in readline for interactive edit (same pattern as init.ts).
 */

import readline from 'node:readline';
import {
  getAllEntriesForMode,
  getProviderModes,
  isCustomized,
  setModelEntry,
  resetProviderMode,
  resetAllToDefaults,
} from '../core/model-store.js';
import { getConfigFileDefaults } from '../core/config.js';
import { outputJson, outputHuman, isJsonMode } from '../util/output.js';
import { bold, dim, yellow, green, cyan } from '../util/colors.js';
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

// ── Exports ───────────────────────────────────────────────────────────────

export { modelsShowCommand, modelsEditCommand, modelsResetCommand };
