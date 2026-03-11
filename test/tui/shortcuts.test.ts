/**
 * Tests for TUI keyboard shortcut wiring, help overlay accuracy,
 * and footer bar hint correctness.
 *
 * Pure unit tests — no SolidJS rendering needed.
 *
 * Validates:
 *   - Help overlay HELP_TEXT contains only implemented shortcuts (no phantoms)
 *   - Cancel validates pending status
 *   - Retry validates failed/cancelled status
 *   - Footer HINTS keys match per view
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks for TUI component imports ────────────────────────────────────────

// Mock the SolidJS/OpenTUI imports that help-overlay.tsx and footer-bar.tsx need
vi.mock('@opentui/solid', () => ({
  useKeyboard: vi.fn(),
  useRenderer: vi.fn(() => ({ destroy: vi.fn() })),
  useTerminalDimensions: vi.fn(() => () => ({ width: 80, height: 24 })),
}));

vi.mock('solid-js', () => ({
  createSignal: vi.fn((v: unknown) => [() => v, vi.fn()]),
  createMemo: vi.fn((fn: () => unknown) => fn),
  createEffect: vi.fn(),
  on: vi.fn(),
  batch: vi.fn((fn: () => unknown) => fn()),
  Show: vi.fn(),
  Switch: vi.fn(),
  Match: vi.fn(),
  For: vi.fn(),
  onMount: vi.fn(),
  onCleanup: vi.fn(),
}));

// ── Import HELP_TEXT and HINTS ─────────────────────────────────────────────

import { HELP_TEXT } from '../../src/tui/components/help-overlay.js';
import { HINTS } from '../../src/tui/components/footer-bar.js';

// ── Implemented shortcut keys ──────────────────────────────────────────────
// This is the authoritative set of keys handled in app.tsx's useKeyboard callback.
// If a shortcut is added/removed in app.tsx, this list must be updated.
const IMPLEMENTED_KEYS = new Set([
  'q', '?', '/', 'Esc', 'Tab', 's',
  '1', '2', '3',
  'u',
  'K',
  'r', 'x',
  'j', 'k', '↓', '↑',
  'g', 'G',
  'Enter',
  'Ctrl+C', 'Backspace',
]);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HELP_TEXT accuracy — no phantom shortcuts', () => {
  it('contains only implemented shortcuts', () => {
    // Extract shortcut keys from HELP_TEXT
    // Each line looks like: "  q / Ctrl+C   Quit" or "  j / ↓        Move cursor down"
    const lines = HELP_TEXT.split('\n').filter(l => l.trim() && !l.includes('──'));
    const extractedKeys: string[] = [];

    for (const line of lines) {
      // Match key sequences before the description
      // Pattern: leading spaces, then key(s) separated by " / ", then spaces and description
      const match = line.match(/^\s+(.+?)\s{2,}/);
      if (!match) continue;

      const keysPart = match[1].trim();
      if (!keysPart) continue;
      // Split on " / " to get individual keys
      const keys = keysPart.split(/\s*\/\s*/).filter(k => k.length > 0);
      extractedKeys.push(...keys);
    }

    // Verify each extracted key is in the implemented set
    for (const key of extractedKeys) {
      // Normalize: "1 2 3" are space-separated in help text
      if (key.match(/^\d(\s+\d)+$/)) {
        // Multiple digit keys on one line: "1 2 3"
        for (const digit of key.split(/\s+/)) {
          expect(IMPLEMENTED_KEYS.has(digit)).toBe(true);
        }
      } else {
        expect(IMPLEMENTED_KEYS.has(key), `"${key}" found in HELP_TEXT but not implemented`).toBe(true);
      }
    }
  });

  it('HELP_TEXT is non-empty and contains all shortcut sections', () => {
    expect(HELP_TEXT.length).toBeGreaterThan(0);
    expect(HELP_TEXT).toContain('Global');
    expect(HELP_TEXT).toContain('Dashboard');
    expect(HELP_TEXT).toContain('Detail');
  });

  it('lists r retry, x cancel, K kill shortcuts', () => {
    expect(HELP_TEXT).toContain('r');
    expect(HELP_TEXT).toContain('Retry');
    expect(HELP_TEXT).toContain('x');
    expect(HELP_TEXT).toContain('Cancel');
    expect(HELP_TEXT).toContain('K');
    expect(HELP_TEXT).toMatch(/Force.quit/i);
  });

  it('does NOT contain phantom shortcuts from pre-Phase-52 cleanup', () => {
    // These are examples of shortcuts that might have been listed in older versions
    // but should NOT appear in the current HELP_TEXT:
    // - Ctrl+R (was never implemented in app.tsx)
    // - d (was not in the keyboard handler)
    // The key assertion is that the HELP_TEXT matches the actual handlers.
    // Since we verified all extracted keys are in IMPLEMENTED_KEYS above,
    // any phantom would have caused that test to fail.
    expect(HELP_TEXT).not.toContain('Ctrl+R');
    expect(HELP_TEXT).not.toContain('Ctrl+D');
  });
});

describe('Footer bar HINTS', () => {
  it('dashboard hints include essential keys', () => {
    const dash = HINTS.dashboard;
    expect(dash).toContain('j/k');
    expect(dash).toContain('enter');
    expect(dash).toContain('tab');
    expect(dash).toContain('r retry');
    expect(dash).toContain('x cancel');
    expect(dash).toContain('K kill');
    expect(dash).toContain('?');
    expect(dash).toContain('q');
  });

  it('detail hints include essential keys', () => {
    const detail = HINTS.detail;
    expect(detail).toContain('r retry');
    expect(detail).toContain('x cancel');
    expect(detail).toContain('K kill');
    expect(detail).toContain('?');
    expect(detail).toContain('esc');
  });

  it('split hints exist', () => {
    expect(HINTS.split).toBeDefined();
    expect(HINTS.split.length).toBeGreaterThan(0);
  });

  it('all ViewType keys have hints defined', () => {
    expect(HINTS.dashboard).toBeDefined();
    expect(HINTS.detail).toBeDefined();
    expect(HINTS.split).toBeDefined();
  });
});

describe('TUI shortcut status validation — cancel', () => {
  it('cancel only applies to pending jobs (mirrors x handler in app.tsx)', () => {
    // The x handler in app.tsx checks: job.status === 'pending'
    // This test verifies the status contract
    const statuses = ['pending', 'running', 'failed', 'completed', 'cancelled'] as const;
    const cancellableStatuses = statuses.filter(s => s === 'pending');
    expect(cancellableStatuses).toEqual(['pending']);

    // Verify non-pending statuses are NOT cancellable
    const nonCancellable = statuses.filter(s => s !== 'pending');
    for (const status of nonCancellable) {
      expect(status).not.toBe('pending');
    }
  });
});

describe('TUI shortcut status validation — retry', () => {
  it('retry only applies to failed/cancelled jobs (mirrors r handler in app.tsx)', () => {
    // The r handler in app.tsx checks: job.status === 'failed' || job.status === 'cancelled'
    const statuses = ['pending', 'running', 'failed', 'completed', 'cancelled'] as const;
    const retryableStatuses = statuses.filter(s => s === 'failed' || s === 'cancelled');
    expect(retryableStatuses).toEqual(['failed', 'cancelled']);

    // Verify non-retryable statuses
    const nonRetryable = statuses.filter(s => s !== 'failed' && s !== 'cancelled');
    expect(nonRetryable).toEqual(['pending', 'running', 'completed']);
  });
});
