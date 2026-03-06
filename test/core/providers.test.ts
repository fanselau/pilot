/**
 * Tests for src/core/providers.ts — provider detection, mode filtering, availability checks.
 *
 * Covers:
 *   - parseProviderOutput() parses opencode models stdout into provider set
 *   - detectProviders() handles execa failures gracefully (returns empty set)
 *   - getAvailableModes() returns correct filtered modes for all provider combos
 *   - getDefaultMode() returns correct default for all provider combos
 *   - checkProviderAvailability() returns correct warnings for mismatches
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock execa before importing the module
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

// Mock delegate to avoid real binary resolution
vi.mock('../../src/core/delegate.js', () => ({
  resolveOpencodeBinary: vi.fn().mockReturnValue('/usr/bin/opencode'),
}));

import { execa } from 'execa';
import {
  parseProviderOutput,
  getAvailableModes,
  getDefaultMode,
  detectProviders,
  checkProviderAvailability,
} from '../../src/core/providers.js';

const mockExeca = vi.mocked(execa);

// ── parseProviderOutput ───────────────────────────────────────────────────

describe('parseProviderOutput', () => {
  it('extracts provider prefixes from model IDs', () => {
    const stdout = [
      'anthropic',
      '  anthropic/claude-sonnet-4-6',
      '  anthropic/claude-haiku-3.5',
      'openai',
      '  openai/gpt-4o',
      '  openai/o3-mini',
    ].join('\n');

    const result = parseProviderOutput(stdout);
    expect(result).toEqual(new Set(['anthropic', 'openai']));
  });

  it('handles single provider output', () => {
    const stdout = [
      'anthropic',
      '  anthropic/claude-sonnet-4-6',
    ].join('\n');

    const result = parseProviderOutput(stdout);
    expect(result).toEqual(new Set(['anthropic']));
  });

  it('ignores lines without slash', () => {
    const stdout = [
      'Available models:',
      'anthropic',
      '  anthropic/claude-sonnet-4-6',
      '',
      'Total: 1',
    ].join('\n');

    const result = parseProviderOutput(stdout);
    expect(result).toEqual(new Set(['anthropic']));
  });

  it('returns empty set for empty output', () => {
    const result = parseProviderOutput('');
    expect(result).toEqual(new Set());
  });

  it('handles extra whitespace and indentation', () => {
    const stdout = '  openai/gpt-4o  \n\n  anthropic/claude-sonnet-4-6\n';
    const result = parseProviderOutput(stdout);
    expect(result).toEqual(new Set(['openai', 'anthropic']));
  });
});

// ── getAvailableModes ─────────────────────────────────────────────────────

describe('getAvailableModes', () => {
  it('returns all modes when both providers available', () => {
    const detection = { providers: new Set(['anthropic', 'openai']), hasAnthropic: true, hasOpenai: true };
    expect(getAvailableModes(detection)).toEqual(['hybrid', 'claude-only', 'openai-only']);
  });

  it('returns claude-only when only anthropic available', () => {
    const detection = { providers: new Set(['anthropic']), hasAnthropic: true, hasOpenai: false };
    expect(getAvailableModes(detection)).toEqual(['claude-only']);
  });

  it('returns openai-only when only openai available', () => {
    const detection = { providers: new Set(['openai']), hasAnthropic: false, hasOpenai: true };
    expect(getAvailableModes(detection)).toEqual(['openai-only']);
  });

  it('returns claude-only as fallback when no providers detected', () => {
    const detection = { providers: new Set<string>(), hasAnthropic: false, hasOpenai: false };
    expect(getAvailableModes(detection)).toEqual(['claude-only']);
  });
});

// ── getDefaultMode ────────────────────────────────────────────────────────

describe('getDefaultMode', () => {
  it('returns hybrid when both providers available', () => {
    const detection = { providers: new Set(['anthropic', 'openai']), hasAnthropic: true, hasOpenai: true };
    expect(getDefaultMode(detection)).toBe('hybrid');
  });

  it('returns claude-only when only anthropic available', () => {
    const detection = { providers: new Set(['anthropic']), hasAnthropic: true, hasOpenai: false };
    expect(getDefaultMode(detection)).toBe('claude-only');
  });

  it('returns openai-only when only openai available', () => {
    const detection = { providers: new Set(['openai']), hasAnthropic: false, hasOpenai: true };
    expect(getDefaultMode(detection)).toBe('openai-only');
  });

  it('returns claude-only as fallback when no providers detected', () => {
    const detection = { providers: new Set<string>(), hasAnthropic: false, hasOpenai: false };
    expect(getDefaultMode(detection)).toBe('claude-only');
  });
});

// ── detectProviders ───────────────────────────────────────────────────────

describe('detectProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses multi-provider output correctly', async () => {
    mockExeca.mockResolvedValue({
      stdout: [
        'anthropic',
        '  anthropic/claude-sonnet-4-6',
        '  anthropic/claude-haiku-3.5',
        'openai',
        '  openai/gpt-4o',
        '  openai/o3-mini',
      ].join('\n'),
    } as never);

    const result = await detectProviders();
    expect(result.hasAnthropic).toBe(true);
    expect(result.hasOpenai).toBe(true);
    expect(result.providers.has('anthropic')).toBe(true);
    expect(result.providers.has('openai')).toBe(true);
  });

  it('returns empty set on execa timeout', async () => {
    mockExeca.mockRejectedValue(new Error('timed out'));
    const result = await detectProviders();
    expect(result.providers.size).toBe(0);
    expect(result.hasAnthropic).toBe(false);
    expect(result.hasOpenai).toBe(false);
  });

  it('returns empty set on execa non-zero exit', async () => {
    mockExeca.mockRejectedValue(new Error('Command failed with exit code 1'));
    const result = await detectProviders();
    expect(result.providers.size).toBe(0);
    expect(result.hasAnthropic).toBe(false);
    expect(result.hasOpenai).toBe(false);
  });
});

// ── checkProviderAvailability ─────────────────────────────────────────────

describe('checkProviderAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no warning when claude-only mode and anthropic available', async () => {
    mockExeca.mockResolvedValue({
      stdout: '  anthropic/claude-sonnet-4-6\n',
    } as never);

    const result = await checkProviderAvailability('claude-only');
    expect(result.available).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('returns warning when openai-only mode but no openai detected', async () => {
    mockExeca.mockResolvedValue({
      stdout: '  anthropic/claude-sonnet-4-6\n',
    } as never);

    const result = await checkProviderAvailability('openai-only');
    expect(result.available).toBe(false);
    expect(result.warning).toContain('openai-only');
    expect(result.warning).toContain('not detected');
  });

  it('returns warning when claude-only mode but no anthropic detected', async () => {
    mockExeca.mockResolvedValue({
      stdout: '  openai/gpt-4o\n',
    } as never);

    const result = await checkProviderAvailability('claude-only');
    expect(result.available).toBe(false);
    expect(result.warning).toContain('claude-only');
    expect(result.warning).toContain('not detected');
  });

  it('returns warning when hybrid mode but missing openai', async () => {
    mockExeca.mockResolvedValue({
      stdout: '  anthropic/claude-sonnet-4-6\n',
    } as never);

    const result = await checkProviderAvailability('hybrid');
    expect(result.available).toBe(false);
    expect(result.warning).toContain('hybrid');
    expect(result.warning).toContain('OpenAI');
  });

  it('returns no warning when detection fails entirely (no providers)', async () => {
    mockExeca.mockRejectedValue(new Error('command not found'));

    const result = await checkProviderAvailability('claude-only');
    expect(result.available).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('returns no warning when hybrid mode and both providers available', async () => {
    mockExeca.mockResolvedValue({
      stdout: '  anthropic/claude-sonnet-4-6\n  openai/gpt-4o\n',
    } as never);

    const result = await checkProviderAvailability('hybrid');
    expect(result.available).toBe(true);
    expect(result.warning).toBeNull();
  });
});
