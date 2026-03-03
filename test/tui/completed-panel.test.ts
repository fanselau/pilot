/**
 * Regression tests for completed-panel pure helper functions.
 *
 * Key regression: computeRowBg(selected=true, flashing=true) MUST return
 * theme.highlight, NOT theme.fg or a flash color. This is the exact overlay
 * bug that was fixed in 27-01 — selection must always win over flash.
 *
 * We test pure functions extracted from completed-panel.tsx without rendering
 * any SolidJS/OpenTUI components.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mocks for SolidJS and OpenTUI ─────────────────────────────────────────

vi.mock('solid-js', () => ({
  For: vi.fn(),
  createSignal: vi.fn(() => [() => new Set(), vi.fn()]),
  createEffect: vi.fn(),
  on: vi.fn((_deps: unknown, fn: unknown) => fn),
  onMount: vi.fn(),
  onCleanup: vi.fn(),
  Show: vi.fn(),
}));

vi.mock('@opentui/solid', () => ({}));

vi.mock('../../src/tui/widgets/scrollable.js', () => ({
  Scrollable: vi.fn(),
}));

vi.mock('../../src/tui/data/opencode-db.js', () => ({
  fetchSessionEnrichment: vi.fn(() => ({ tokens: new Map() })),
}));

vi.mock('../../src/tui/components/running-panel.js', () => ({
  formatTokens: (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`,
}));

// ── Import helpers after mocks ─────────────────────────────────────────────

import {
  computeRowBg,
  flashBg,
  statusIcon,
  formatDuration,
  formatRelativeTime,
} from '../../src/tui/components/completed-panel.js';
import { theme, statusColors } from '../../src/tui/theme.js';

// ── computeRowBg — selection/flash priority ───────────────────────────────

describe('computeRowBg — selection always wins (overlay bug regression)', () => {
  it('returns theme.highlight when selected=true and flashing=true', () => {
    // THIS IS THE KEY REGRESSION ASSERTION:
    // The old buggy code returned theme.fg (bright white) when flashing,
    // which would overlay the selection highlight. Fixed: selection wins.
    const result = computeRowBg(true, true, 'completed');
    expect(result).toBe(theme.highlight);
    expect(result).not.toBe(theme.fg);
  });

  it('returns theme.highlight when selected=true and flashing=false', () => {
    const result = computeRowBg(true, false, 'completed');
    expect(result).toBe(theme.highlight);
  });

  it('returns flash color (not theme.fg) when selected=false and flashing=true', () => {
    const result = computeRowBg(false, true, 'completed');
    // Should be dark tint, not bright white (theme.fg = '#eeeeee')
    expect(result).toBeDefined();
    expect(result).not.toBe(theme.fg);
    // Flash bg should be a dark green tint for completed jobs
    expect(result).toBe(flashBg('completed'));
  });

  it('returns undefined when selected=false and flashing=false', () => {
    const result = computeRowBg(false, false, 'completed');
    expect(result).toBeUndefined();
  });

  it('flash bg for completed is dark green tint (not white/bright)', () => {
    const result = computeRowBg(false, true, 'completed');
    // #0d2b0d is the dark green tint — must not be #eeeeee or similar
    expect(result).toBe('#0d2b0d');
  });

  it('flash bg for failed is dark red tint', () => {
    const result = computeRowBg(false, true, 'failed');
    expect(result).toBe('#2b0d0d');
  });

  it('flash bg for cancelled is dark neutral', () => {
    const result = computeRowBg(false, true, 'cancelled');
    expect(result).toBe('#1a1a1a');
  });

  it('selection highlight overrides any flash status variant', () => {
    // Verify selection wins for all job statuses
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      expect(computeRowBg(true, true, status)).toBe(theme.highlight);
      expect(computeRowBg(true, false, status)).toBe(theme.highlight);
    }
  });
});

// ── flashBg — dark tints, not bright colors ───────────────────────────────

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

  it('returns a fallback dark color for unknown statuses', () => {
    // 'pending' or 'running' would hit the default case
    const result = flashBg('pending');
    expect(result).toBeTruthy();
    // Should not be a bright color
    expect(result).not.toBe(theme.fg);
    expect(result).not.toBe(statusColors.running);
  });
});

// ── statusIcon ─────────────────────────────────────────────────────────────

describe('statusIcon', () => {
  it('returns checkmark and done color for completed', () => {
    const result = statusIcon('completed');
    expect(result.icon).toBe('✓');
    expect(result.color).toBe(statusColors.done);
  });

  it('returns X and failed color for failed', () => {
    const result = statusIcon('failed');
    expect(result.icon).toBe('✗');
    expect(result.color).toBe(statusColors.failed);
  });

  it('returns dash and cancelled color for cancelled', () => {
    const result = statusIcon('cancelled');
    expect(result.icon).toBe('–');
    expect(result.color).toBe(statusColors.cancelled);
  });

  it('returns space and muted color for unknown/default status', () => {
    const result = statusIcon('pending');
    expect(result.icon).toBe(' ');
    expect(result.color).toBe(theme.muted);
  });
});

// ── formatDuration ─────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns dash when both null', () => {
    expect(formatDuration(null, null)).toBe('—');
  });

  it('returns dash when startedAt is null', () => {
    expect(formatDuration(null, '2026-03-03T11:00:00Z')).toBe('—');
  });

  it('returns dash when completedAt is null', () => {
    expect(formatDuration('2026-03-03T10:00:00Z', null)).toBe('—');
  });

  it('returns formatted duration for 1 hour apart', () => {
    const start = '2026-03-03T10:00:00Z';
    const end = '2026-03-03T11:00:00Z';
    expect(formatDuration(start, end)).toBe('1h00m');
  });

  it('returns formatted duration for 5m30s apart', () => {
    const start = '2026-03-03T10:00:00Z';
    const end = '2026-03-03T10:05:30Z';
    expect(formatDuration(start, end)).toBe('5m30s');
  });

  it('returns seconds for sub-minute durations', () => {
    const start = '2026-03-03T10:00:00Z';
    const end = '2026-03-03T10:00:45Z';
    expect(formatDuration(start, end)).toBe('45s');
  });

  it('returns dash when completedAt is before startedAt', () => {
    const start = '2026-03-03T11:00:00Z';
    const end = '2026-03-03T10:00:00Z'; // end before start
    expect(formatDuration(start, end)).toBe('—');
  });

  it('handles 90 minutes (1h30m)', () => {
    const start = '2026-03-03T10:00:00Z';
    const end = '2026-03-03T11:30:00Z';
    expect(formatDuration(start, end)).toBe('1h30m');
  });
});

// ── formatRelativeTime ─────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns empty string for null', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('returns "Ns ago" for seconds-ago', () => {
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const result = formatRelativeTime(thirtySecsAgo);
    // Should match "Ns ago" pattern (might be 29-31 seconds due to timing)
    expect(result).toMatch(/^\d+s ago$/);
  });

  it('returns "N min ago" for minutes-ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = formatRelativeTime(fiveMinAgo);
    expect(result).toMatch(/^\d+ min ago$/);
  });

  it('returns "N hr ago" for hours-ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(twoHoursAgo);
    expect(result).toMatch(/^\d+ hr ago$/);
  });

  it('returns "Nd ago" for days-ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(twoDaysAgo);
    expect(result).toMatch(/^\d+d ago$/);
  });

  it('returns "just now" for future dates (negative diff)', () => {
    const future = new Date(Date.now() + 10_000).toISOString();
    expect(formatRelativeTime(future)).toBe('just now');
  });
});
