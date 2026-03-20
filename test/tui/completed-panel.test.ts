/**
 * Regression tests for CompletedPanel pure helpers.
 *
 * Validates:
 * - computeRowBg priority: selection always wins over flash (the core overlay fix)
 * - statusIcon mapping for completed/failed/cancelled/other
 * - flashBg per status
 * - formatDuration edge cases (null, negative, seconds, minutes, hours)
 * - formatRelativeTime ranges (past, recent, minutes, hours, days)
 *
 * No UI renderer required — tests exercise pure exported helper functions.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeRowBg,
  statusIcon,
  buildCompletedRowBadges,
  flashBg,
  formatDuration,
  formatRelativeTime,
} from '../../src/tui/components/completed-panel.js';
import { buildObservabilityCues, formatObservabilityLine } from '../../src/tui/components/running-panel.js';
import { theme, statusColors } from '../../src/tui/theme.js';
import type { Job, JobObservabilitySnapshot, JobStatus, TokenUsageBreakdown } from '../../src/core/types.js';

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
  return {
    jobId: 'cmp1',
    jobStatus: 'completed',
    terminal: true,
    requested: {
      modelProfile: 'balanced',
      providerMode: 'hybrid',
      scope: 'phase',
      intendedExecutorModel: 'anthropic/claude-sonnet-4-6',
      notes: [],
    },
    observed: {
      status: 'available',
      models: ['anthropic/claude-sonnet-4-6'],
      notes: [],
    },
    tokens: {
      status: 'available',
      totals: totals({ input: 25_000, output: 10_000, total: 35_000 }),
      byModel: {
        'anthropic/claude-sonnet-4-6': totals({ input: 25_000, output: 10_000, total: 35_000 }),
      },
      notes: [],
    },
    cost: {
      status: 'estimated',
      currency: 'USD',
      estimatedUsd: 0.21,
      byModel: [],
      notes: [],
    },
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'cmp1',
    project: 'proj',
    scope: 'phase',
    description: 'Implement phase status badges',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08T10:00:00Z',
    startedAt: '2026-03-08T10:01:00Z',
    completedAt: '2026-03-08T10:02:00Z',
    error: null,
    resumeHint: null,
    attempts: 1,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'hybrid',
    judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 92, reason: 'All acceptance criteria passed.' }),
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    gitBaseCommit: '1111111111111111111111111111111111111111',
    gitHeadCommit: '2222222222222222222222222222222222222222',
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 3,
    retryCount: 0,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

// ── computeRowBg ─────────────────────────────────────────────────────────────

describe('computeRowBg — overlay fix regression', () => {
  it('returns theme.highlight when selected=true flashing=false', () => {
    expect(computeRowBg(true, false)).toBe(theme.highlight);
  });

  it('returns theme.highlight when BOTH selected=true AND flashing=true (selection wins)', () => {
    // This is the core regression: selection must always beat flash
    // Old bug: flash bg would appear on selected row, causing double-layer overlay
    expect(computeRowBg(true, true)).toBe(theme.highlight);
    expect(computeRowBg(true, true, 'completed')).toBe(theme.highlight);
    expect(computeRowBg(true, true, 'failed')).toBe(theme.highlight);
    expect(computeRowBg(true, true, 'cancelled')).toBe(theme.highlight);
  });

  it('returns flashBg when selected=false and flashing=true', () => {
    expect(computeRowBg(false, true, 'completed')).toBe(flashBg('completed'));
    expect(computeRowBg(false, true, 'failed')).toBe(flashBg('failed'));
    expect(computeRowBg(false, true, 'cancelled')).toBe(flashBg('cancelled'));
  });

  it('returns undefined when selected=false and flashing=false (default bg)', () => {
    expect(computeRowBg(false, false)).toBeUndefined();
    expect(computeRowBg(false, false, 'completed')).toBeUndefined();
    expect(computeRowBg(false, false, 'failed')).toBeUndefined();
  });

  it('uses completed status as default when status omitted', () => {
    // Default status is 'completed' per function signature
    const withDefault = computeRowBg(false, true);
    const withExplicit = computeRowBg(false, true, 'completed');
    expect(withDefault).toBe(withExplicit);
  });

  it('selection priority is deterministic across all status values', () => {
    const statuses: JobStatus[] = ['completed', 'failed', 'cancelled', 'pending', 'running'];
    for (const status of statuses) {
      const result = computeRowBg(true, true, status);
      expect(result).toBe(theme.highlight);
    }
  });
});

// ── statusIcon ────────────────────────────────────────────────────────────────

describe('statusIcon', () => {
  it('returns checkmark + done color for completed phase job with real verdict', () => {
    // Phase job with a high-confidence verdict (truly verified)
    const job = { status: 'completed' as JobStatus, scope: 'phase', judgeVerdict: JSON.stringify({ verdict: 'pass', confidence: 85 }) };
    const { icon, color } = statusIcon(job);
    expect(icon).toBe('✓');
    expect(color).toBe(statusColors.done);
  });

  it('returns checkmark + done color for quick completed job (no judge)', () => {
    // Quick jobs always show ✓ — they don't go through the judge
    const job = { status: 'completed' as JobStatus, scope: 'quick' };
    const { icon, color } = statusIcon(job);
    expect(icon).toBe('✓');
    expect(color).toBe(statusColors.done);
  });

  it('returns warning icon for completed phase job with no verdict', () => {
    // Phase job with null verdict = inconclusive (benefit of doubt or judge never ran)
    const job = { status: 'completed' as JobStatus, scope: 'phase', judgeVerdict: null };
    const { icon, color } = statusIcon(job);
    expect(icon).toBe('⚠');
    expect(color).toBe(statusColors.warning);
  });

  it('returns warning icon for completed phase job with confidence=0 verdict', () => {
    // confidence=0 = judge failed, benefit of doubt was stored
    const job = { status: 'completed' as JobStatus, scope: 'phase', judgeVerdict: JSON.stringify({ verdict: 'pass', confidence: 0 }) };
    const { icon, color } = statusIcon(job);
    expect(icon).toBe('⚠');
    expect(color).toBe(statusColors.warning);
  });

  it('returns warning icon for completed phase job with unparseable verdict', () => {
    const job = { status: 'completed' as JobStatus, scope: 'phase', judgeVerdict: 'not-json' };
    const { icon, color } = statusIcon(job);
    expect(icon).toBe('⚠');
    expect(color).toBe(statusColors.warning);
  });

  it('returns x-mark + failed color for failed', () => {
    const { icon, color } = statusIcon({ status: 'failed' as JobStatus });
    expect(icon).toBe('✗');
    expect(color).toBe(statusColors.failed);
  });

  it('returns dash + cancelled color for cancelled', () => {
    const { icon, color } = statusIcon({ status: 'cancelled' as JobStatus });
    expect(icon).toBe('–');
    expect(color).toBe(statusColors.cancelled);
  });

  it('returns space + muted color for unknown/default statuses', () => {
    const { icon, color } = statusIcon({ status: 'pending' as JobStatus });
    expect(icon).toBe(' ');
    expect(color).toBe(theme.muted);

    const { icon: runIcon, color: runColor } = statusIcon({ status: 'running' as JobStatus });
    expect(runIcon).toBe(' ');
    expect(runColor).toBe(theme.muted);
  });
});

describe('buildCompletedRowBadges', () => {
  it('builds judge + undo badges for completed phase pass rows', () => {
    const labels = buildCompletedRowBadges(makeJob()).map((badge) => badge.label);
    expect(labels).toEqual(['[judge:pass 92%]', '[undo:safe]']);
  });

  it('renders judge:gaps badge for doubting verdicts (mapped to gaps)', () => {
    const labels = buildCompletedRowBadges(
      makeJob({ judgeVerdict: JSON.stringify({ verdict: 'doubting', confidence: 61, reason: 'Mixed evidence.' }) }),
    ).map((badge) => badge.label);
    expect(labels).toEqual(['[judge:gaps 61%]', '[undo:safe]']);
  });

  it('renders judge:inconclusive when confidence is zero', () => {
    const labels = buildCompletedRowBadges(
      makeJob({ judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 0, reason: 'Benefit of doubt.' }) }),
    ).map((badge) => badge.label);
    expect(labels).toEqual(['[judge:inconclusive]', '[undo:safe]']);
  });

  it('composes judge + retry + undo badges for failed phase rows', () => {
    const labels = buildCompletedRowBadges(
      makeJob({
        status: 'failed',
        error: 'Requirements not met',
        judgeVerdict: JSON.stringify({ verdict: 'failed', confidence: 95, reason: 'Two must-haves missing.' }),
        gitBaseCommit: '1111111111111111111111111111111111111111',
        gitHeadCommit: '1111111111111111111111111111111111111111',
      }),
    ).map((badge) => badge.label);
    expect(labels).toEqual(['[judge:fail 95%]', '[needs-revision]', '[undo:safe]']);
  });

  it('marks malformed verdicts as inconclusive and keeps operational badges', () => {
    const labels = buildCompletedRowBadges(
      makeJob({ status: 'cancelled', judgeVerdict: 'not-json', gitBaseCommit: null, gitHeadCommit: null }),
    ).map((badge) => badge.label);
    expect(labels).toEqual(['[judge:inconclusive]', '[cancelled]', '[undo:unavailable]']);
  });

  it('renders judge:gaps badge for partial verdicts (mapped to gaps)', () => {
    const labels = buildCompletedRowBadges(
      makeJob({
        judgeVerdict: JSON.stringify({
          verdict: 'partial',
          confidence: 55,
          reason: 'Some plans incomplete',
          retryRecommendation: 'retry-resume',
        }),
      }),
    ).map((badge) => badge.label);
    expect(labels).toContain('[judge:gaps 55%]');
  });
});

// ── flashBg ───────────────────────────────────────────────────────────────────

describe('flashBg', () => {
  it('returns dark green tint for completed', () => {
    expect(flashBg('completed')).toBe('#0d2b0d');
  });

  it('returns dark red tint for failed', () => {
    expect(flashBg('failed')).toBe('#2b0d0d');
  });

  it('returns dark neutral for cancelled', () => {
    expect(flashBg('cancelled')).toBe('#1a1a1a');
  });

  it('returns default dark for other statuses', () => {
    expect(flashBg('pending')).toBe('#111111');
    expect(flashBg('running')).toBe('#111111');
  });

  it('flash colors are distinct from theme.highlight (no double-layer confusion)', () => {
    // Flash tints must differ from selection highlight to avoid visual ambiguity
    expect(flashBg('completed')).not.toBe(theme.highlight);
    expect(flashBg('failed')).not.toBe(theme.highlight);
    expect(flashBg('cancelled')).not.toBe(theme.highlight);
  });

  it('flash colors are all dark hex codes (not bright/harsh)', () => {
    // All flash backgrounds start with a low-luminance hex — never white or bright
    const colors = [
      flashBg('completed'),
      flashBg('failed'),
      flashBg('cancelled'),
      flashBg('pending'),
    ];
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      // Red channel < 0x40 (64) = dark
      const r = parseInt(c.slice(1, 3), 16);
      expect(r).toBeLessThan(0x40);
    }
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns em-dash when startedAt is null', () => {
    expect(formatDuration(null, '2026-03-03T10:05:00Z')).toBe('—');
  });

  it('returns em-dash when completedAt is null', () => {
    expect(formatDuration('2026-03-03T10:00:00Z', null)).toBe('—');
  });

  it('returns em-dash when both are null', () => {
    expect(formatDuration(null, null)).toBe('—');
  });

  it('returns em-dash when completedAt is before startedAt (negative duration)', () => {
    expect(formatDuration('2026-03-03T10:05:00Z', '2026-03-03T10:00:00Z')).toBe('—');
  });

  it('formats sub-minute duration as seconds', () => {
    const started = '2026-03-03T10:00:00Z';
    const completed = '2026-03-03T10:00:45Z';
    expect(formatDuration(started, completed)).toBe('45s');
  });

  it('formats exactly 60 seconds as 1m00s', () => {
    const started = '2026-03-03T10:00:00Z';
    const completed = '2026-03-03T10:01:00Z';
    expect(formatDuration(started, completed)).toBe('1m00s');
  });

  it('formats minutes with seconds', () => {
    const started = '2026-03-03T10:00:00Z';
    const completed = '2026-03-03T10:05:30Z';
    expect(formatDuration(started, completed)).toBe('5m30s');
  });

  it('formats exactly 59 minutes 59 seconds as mins+secs', () => {
    const started = '2026-03-03T10:00:00Z';
    const completed = '2026-03-03T10:59:59Z';
    expect(formatDuration(started, completed)).toBe('59m59s');
  });

  it('formats exactly 1 hour as 1h00m', () => {
    const started = '2026-03-03T10:00:00Z';
    const completed = '2026-03-03T11:00:00Z';
    expect(formatDuration(started, completed)).toBe('1h00m');
  });

  it('formats hours and minutes without seconds', () => {
    const started = '2026-03-03T10:00:00Z';
    const completed = '2026-03-03T12:15:00Z';
    expect(formatDuration(started, completed)).toBe('2h15m');
  });

  it('handles zero duration as 0s', () => {
    const ts = '2026-03-03T10:00:00Z';
    expect(formatDuration(ts, ts)).toBe('0s');
  });
});

// ── formatRelativeTime ────────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null input', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('returns "just now" for future dates (negative diff)', () => {
    // A date slightly in the future
    const future = new Date(Date.now() + 5000).toISOString();
    expect(formatRelativeTime(future)).toBe('just now');
  });

  it('returns seconds format for sub-minute', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 30_000);  // 30s later
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('30s ago');
  });

  it('returns 0s ago for same timestamp', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime());
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('0s ago');
  });

  it('returns "59s ago" for 59 seconds ago', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 59_000);
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('59s ago');
  });

  it('returns "1 min ago" for exactly 60 seconds', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 60_000);
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('1 min ago');
  });

  it('returns minutes format for 2-59 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 5 * 60_000);  // 5 minutes
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('5 min ago');
  });

  it('returns "1 hr ago" for exactly 60 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 60 * 60_000);
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('1 hr ago');
  });

  it('returns hours format for multi-hour', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 3 * 60 * 60_000);  // 3 hours
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('3 hr ago');
  });

  it('returns "1d ago" for exactly 24 hours', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 24 * 60 * 60_000);
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('1d ago');
  });

  it('returns days format for multi-day', () => {
    vi.useFakeTimers();
    const base = new Date('2026-03-03T10:00:00Z');
    vi.setSystemTime(base.getTime() + 7 * 24 * 60 * 60_000);  // 7 days
    expect(formatRelativeTime('2026-03-03T10:00:00Z')).toBe('7d ago');
  });
});

describe('completed panel observability cues', () => {
  it('renders compact completed observability line with totals and estimate', () => {
    const cues = buildObservabilityCues(makeSnapshot(), false);
    const line = formatObservabilityLine(cues);

    expect(line).toContain('tok:35.0k');
    expect(line).toContain('~$0.210 est');
    expect(line).toContain('model:claude-sonnet-4-6');
  });

  it('adds warning badges for unusual completed jobs', () => {
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
          models: ['anthropic/claude-sonnet-4-6', 'openai/gpt-5.4'],
          notes: [],
        },
        cost: {
          status: 'estimated',
          currency: 'USD',
          estimatedUsd: 1.4,
          byModel: [],
          notes: [],
        },
      }),
      false,
    );

    expect(cues.flags).toContain('mismatch');
    expect(cues.flags).toContain('multi-model');
    expect(cues.flags).toContain('high-cost');
  });
});
