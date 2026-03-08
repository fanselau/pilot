import { describe, expect, it } from 'vitest';
import {
  formatTokens,
  summarizeObservedModels,
  buildObservabilityCues,
  formatObservabilityLine,
} from '../../src/tui/components/running-panel.js';
import type { JobObservabilitySnapshot, TokenUsageBreakdown } from '../../src/core/types.js';

function totals(overrides: Partial<TokenUsageBreakdown> = {}): TokenUsageBreakdown {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<JobObservabilitySnapshot> = {}): JobObservabilitySnapshot {
  const base: JobObservabilitySnapshot = {
    jobId: 'j123',
    jobStatus: 'running',
    terminal: false,
    requested: {
      modelProfile: 'balanced',
      providerMode: 'hybrid',
      scope: 'phase',
      intendedExecutorModel: 'anthropic/claude-sonnet-4-6',
      notes: [],
    },
    observed: {
      status: 'partial',
      models: ['anthropic/claude-sonnet-4-6'],
      notes: [],
    },
    tokens: {
      status: 'partial',
      totals: totals({ input: 12_000, output: 8_000, reasoning: 500, total: 20_500 }),
      byModel: {
        'anthropic/claude-sonnet-4-6': totals({ input: 12_000, output: 8_000, reasoning: 500, total: 20_500 }),
      },
      notes: [],
    },
    cost: {
      status: 'partial',
      currency: 'USD',
      estimatedUsd: 0.143,
      byModel: [],
      notes: [],
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

describe('running-panel observability helpers', () => {
  describe('formatTokens', () => {
    it('formats raw values below 1k', () => {
      expect(formatTokens(999)).toBe('999');
    });

    it('formats thousands with k suffix', () => {
      expect(formatTokens(12_400)).toBe('12.4k');
    });

    it('formats millions with M suffix', () => {
      expect(formatTokens(1_300_000)).toBe('1.3M');
    });
  });

  describe('summarizeObservedModels', () => {
    it('returns n/a when no models observed', () => {
      expect(summarizeObservedModels([])).toBe('n/a');
    });

    it('returns short model name for single model', () => {
      expect(summarizeObservedModels(['anthropic/claude-sonnet-4-6'])).toBe('claude-sonnet-4-6');
    });

    it('compacts multiple models into first+count form', () => {
      expect(
        summarizeObservedModels([
          'anthropic/claude-sonnet-4-6',
          'openai/gpt-5.3-codex',
          'anthropic/claude-opus-4-6',
        ]),
      ).toBe('claude-sonnet-4-6 +2');
    });
  });

  describe('buildObservabilityCues', () => {
    it('marks missing live snapshot as live n/a', () => {
      const cues = buildObservabilityCues(null, true);
      expect(cues.tokenLabel).toBe('tok live:n/a');
      expect(cues.modelLabel).toBe('model live:n/a');
      expect(cues.costLabel).toBe('cost n/a');
    });

    it('marks running snapshot values as live/partial', () => {
      const cues = buildObservabilityCues(makeSnapshot(), true);
      expect(cues.tokenLabel).toBe('tok live:20.5k');
      expect(cues.modelLabel).toBe('model live:claude-sonnet-4-6');
      expect(cues.costLabel).toBe('~$0.143 est*');
    });

    it('flags expensive and unusual jobs for scanability', () => {
      const cues = buildObservabilityCues(
        makeSnapshot({
          requested: {
            modelProfile: 'balanced',
            providerMode: 'hybrid',
            scope: 'phase',
            intendedExecutorModel: 'anthropic/claude-opus-4-6',
            notes: [],
          },
          observed: {
            status: 'available',
            models: ['anthropic/claude-sonnet-4-6', 'openai/gpt-5.3-codex'],
            notes: [],
          },
          tokens: {
            status: 'available',
            totals: totals({ input: 700_000, output: 400_000, total: 1_100_000 }),
            byModel: {},
            notes: [],
          },
          cost: {
            status: 'estimated',
            currency: 'USD',
            estimatedUsd: 1.2,
            byModel: [],
            notes: [],
          },
          terminal: true,
          jobStatus: 'completed',
        }),
        false,
      );

      expect(cues.flags).toContain('mismatch');
      expect(cues.flags).toContain('multi-model');
      expect(cues.flags).toContain('high-cost');
      expect(cues.flags).toContain('high-tok');
    });
  });

  describe('formatObservabilityLine', () => {
    it('renders compact line with warning badges', () => {
      const line = formatObservabilityLine({
        tokenLabel: 'tok live:20.5k',
        costLabel: '~$0.143 est*',
        modelLabel: 'model live:claude-sonnet-4-6 +1',
        flags: ['mismatch', 'high-cost', 'high-tok'],
      });

      expect(line).toContain('tok live:20.5k');
      expect(line).toContain('~$0.143 est*');
      expect(line).toContain('model live:claude-sonnet-4-6 +1');
      expect(line).toContain('!mismatch,high-cost');
      expect(line).not.toContain('high-tok');
    });
  });
});
