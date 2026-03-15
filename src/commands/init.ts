/**
 * `pilot init` — Interactive first-time configuration setup.
 *
 * Auto-detects available providers via opencode models,
 * prompts for provider mode / model profile / project directory,
 * and writes ~/.pilot/config.json with validated settings.
 *
 * Uses Node.js built-in readline — no new dependencies.
 */

import readline from 'node:readline';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectProviders, getAvailableModes, getDefaultMode } from '../core/providers.js';
import { outputHuman } from '../util/output.js';
import { bold, dim, green, yellow } from '../util/colors.js';
import { installOpenClawSkill } from '../core/openclaw-skill.js';
import type { ProviderMode } from '../core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Resolve the config file path (mirrors config.ts logic). */
function resolveConfigFilePath(): string {
  if (process.env.PILOT_CONFIG_FILE) {
    return process.env.PILOT_CONFIG_FILE;
  }
  return path.join(os.homedir(), '.pilot', 'config.json');
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
        // Accept number selection
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= options.choices.length) {
          resolve(options.choices[num - 1]);
          return;
        }
        // Accept direct name
        if (options.choices.includes(trimmed)) {
          resolve(trimmed);
          return;
        }
        // Invalid — retry with same question
        process.stdout.write(`  ${yellow('Invalid choice. Please try again.')}\n`);
        resolve(ask(rl, question, options));
        return;
      }

      resolve(trimmed || options?.defaultValue || '');
    });
  });
}

// ── Default config file content (matches config.ts shape) ────────────────

function buildConfigContent(opts: {
  providerMode: ProviderMode;
  modelProfile: string;
  projectDir: string;
}): Record<string, unknown> {
  return {
    projectDir: opts.projectDir,
    runner: {
      maxParallel: null,
    },
    memory: {
      sessionMaxMb: 8192,
      reservedMb: 4096,
      killThresholdMb: 2048,
    },
    defaults: {
      modelProfile: opts.modelProfile,
      providerMode: opts.providerMode,
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

// ── Main init command ─────────────────────────────────────────────────────

interface InitOptions {
  yes?: boolean;
  force?: boolean;
}

async function initCommand(opts: InitOptions): Promise<void> {
  const configPath = resolveConfigFilePath();

  // Check if config already exists (unless --force)
  if (existsSync(configPath) && !opts.force) {
    outputHuman('');
    outputHuman(yellow(`  Config file already exists: ${configPath}`));
    outputHuman(dim(`  Use 'pilot config edit' to modify or run 'pilot init --force' to recreate.`));
    outputHuman('');
    return;
  }

  outputHuman('');
  outputHuman(`  ${bold('Pilot Configuration Setup')}`);
  outputHuman('');

  // Detect providers
  outputHuman(dim(`  Detecting available providers...`));
  const detection = await detectProviders();

  if (detection.providers.size > 0) {
    outputHuman(`  Detected providers: ${[...detection.providers].join(', ')}`);
  } else {
    outputHuman(dim(`  No providers detected (opencode models unavailable)`));
  }
  outputHuman('');

  const availableModes = getAvailableModes(detection);
  const defaultMode = getDefaultMode(detection);

  let providerMode: ProviderMode;
  let modelProfile: string;
  let projectDir: string;

  if (opts.yes) {
    // Non-interactive: use auto-detected defaults
    providerMode = defaultMode;
    modelProfile = 'balanced';
    projectDir = '~/dev';
  } else {
    // Interactive prompts
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Provider mode
      const modeChoicesDisplay = availableModes
        .map((m, i) => `[${i + 1}] ${m}${m === defaultMode ? ' (default)' : ''}`)
        .join('  ');
      outputHuman(`  Provider mode: ${modeChoicesDisplay}`);
      providerMode = await ask(rl, 'Select provider mode', {
        choices: availableModes,
        defaultValue: defaultMode,
      }) as ProviderMode;
      outputHuman('');

      // Model profile
      const profiles = ['quality', 'balanced', 'budget'];
      outputHuman(`  Model profile: [1] quality  [2] balanced (default)  [3] budget`);
      modelProfile = await ask(rl, 'Select model profile', {
        choices: profiles,
        defaultValue: 'balanced',
      });
      outputHuman('');

      // Project directory
      projectDir = await ask(rl, 'Project directory', {
        defaultValue: '~/dev',
      });
      outputHuman('');
    } finally {
      rl.close();
    }
  }

  // Build config
  const config = buildConfigContent({
    providerMode,
    modelProfile,
    projectDir,
  });

  // Create directory if needed
  const configDir = path.dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Write config file
  const json = JSON.stringify(config, null, 2) + '\n';
  writeFileSync(configPath, json, 'utf-8');
  chmodSync(configPath, 0o600);

  // Install OpenClaw skill if OpenClaw is detected
  const skillResult = installOpenClawSkill();
  if (skillResult.installed) {
    outputHuman(`  ${green('✓')} OpenClaw skill installed`);
  } else {
    outputHuman(dim(`  ℹ OpenClaw not detected, skill install skipped`));
  }

  // Print summary
  outputHuman(`  ${green('✓')} Config written to ${configPath}`);
  outputHuman('');
  outputHuman(`    Provider mode:  ${providerMode}`);
  outputHuman(`    Model profile:  ${modelProfile}`);
  outputHuman(`    Project dir:    ${projectDir}`);
  outputHuman('');
  outputHuman(dim(`  Run 'pilot config' to see full resolved configuration.`));
  outputHuman('');
}

export { initCommand };
