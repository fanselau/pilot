/**
 * Provider detection — auto-detect available AI providers via `opencode models`.
 *
 * Runs opencode models, parses provider prefixes from model IDs,
 * and provides mode filtering/recommendation based on available providers.
 * Pure core module — no UI dependencies.
 */

import { execa } from 'execa';
import type { ProviderMode } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProviderDetection {
  providers: Set<string>;
  hasAnthropic: boolean;
  hasOpenai: boolean;
}

export interface ProviderAvailability {
  available: boolean;
  warning: string | null;
}

// ── Detection ─────────────────────────────────────────────────────────────

/**
 * Detect available providers by running `opencode models` and parsing output.
 * Returns provider prefixes (e.g., "anthropic", "openai") extracted from model IDs.
 * On ANY failure (timeout, not installed, non-zero exit), returns empty set.
 */
async function detectProviders(): Promise<ProviderDetection> {
  try {
    const { resolveOpencodeBinary } = await import('./delegate.js');
    const binary = resolveOpencodeBinary();
    const result = await execa(binary, ['models'], { timeout: 10_000 });
    const providers = parseProviderOutput(result.stdout);
    return {
      providers,
      hasAnthropic: providers.has('anthropic'),
      hasOpenai: providers.has('openai'),
    };
  } catch {
    return { providers: new Set(), hasAnthropic: false, hasOpenai: false };
  }
}

/**
 * Parse `opencode models` stdout into a set of provider prefixes.
 * Model lines contain "provider/model-name" — extract the prefix before "/".
 */
function parseProviderOutput(stdout: string): Set<string> {
  const providers = new Set<string>();
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex > 0) {
      providers.add(trimmed.slice(0, slashIndex));
    }
  }
  return providers;
}

// ── Mode filtering ────────────────────────────────────────────────────────

/**
 * Returns available ProviderMode options based on detected providers.
 */
function getAvailableModes(detection: ProviderDetection): ProviderMode[] {
  const { hasAnthropic, hasOpenai } = detection;
  if (hasAnthropic && hasOpenai) return ['hybrid', 'claude-only', 'openai-only'];
  if (hasAnthropic) return ['claude-only'];
  if (hasOpenai) return ['openai-only'];
  return ['claude-only']; // fallback
}

/**
 * Returns the recommended default mode based on detected providers.
 */
function getDefaultMode(detection: ProviderDetection): ProviderMode {
  const { hasAnthropic, hasOpenai } = detection;
  if (hasAnthropic && hasOpenai) return 'hybrid';
  if (hasAnthropic) return 'claude-only';
  if (hasOpenai) return 'openai-only';
  return 'claude-only'; // fallback
}

// ── Availability check ────────────────────────────────────────────────────

/**
 * Check if the configured provider mode matches available providers.
 * Returns a warning string if there's a mismatch, null if all good.
 */
async function checkProviderAvailability(mode: string): Promise<ProviderAvailability> {
  const detection = await detectProviders();

  // If detection failed entirely (no providers found), skip warnings
  // to avoid false positives when opencode isn't available
  if (detection.providers.size === 0) {
    return { available: true, warning: null };
  }

  const { hasAnthropic, hasOpenai } = detection;

  if (mode === 'openai-only' && !hasOpenai) {
    return {
      available: false,
      warning: '⚠ Provider mode openai-only selected but OpenAI models not detected in opencode. Run: pilot init to reconfigure.',
    };
  }

  if (mode === 'claude-only' && !hasAnthropic) {
    return {
      available: false,
      warning: '⚠ Provider mode claude-only selected but Anthropic models not detected in opencode. Run: pilot init to reconfigure.',
    };
  }

  if (mode === 'hybrid') {
    if (!hasAnthropic && !hasOpenai) {
      return {
        available: false,
        warning: '⚠ Provider mode hybrid selected but neither Anthropic nor OpenAI models detected in opencode. Run: pilot init to reconfigure.',
      };
    }
    if (!hasAnthropic) {
      return {
        available: false,
        warning: '⚠ Provider mode hybrid selected but Anthropic models not detected in opencode. OpenAI-only models available.',
      };
    }
    if (!hasOpenai) {
      return {
        available: false,
        warning: '⚠ Provider mode hybrid selected but OpenAI models not detected in opencode. Anthropic-only models available.',
      };
    }
  }

  return { available: true, warning: null };
}

export {
  detectProviders,
  parseProviderOutput,
  getAvailableModes,
  getDefaultMode,
  checkProviderAvailability,
};
