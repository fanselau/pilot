/**
 * Unit tests for src/core/time-utils.ts
 *
 * Tests timezone-safe timestamp parsing and duration calculation.
 * SQLite stores timestamps without timezone suffix — must be treated as UTC.
 */

import { describe, it, expect } from 'vitest';
import { safeParseTimestamp, computeSafeDurationMs } from '../../src/core/time-utils.js';

describe('safeParseTimestamp', () => {
  it('parses SQLite-style UTC string without Z suffix', () => {
    const ms = safeParseTimestamp('2026-03-20 16:14:00');
    expect(ms).not.toBeNull();
    // 2026-03-20T16:14:00Z in epoch ms
    expect(ms).toBe(Date.parse('2026-03-20T16:14:00Z'));
  });

  it('parses ISO string with Z suffix to same value', () => {
    const withoutZ = safeParseTimestamp('2026-03-20 16:14:00');
    const withZ = safeParseTimestamp('2026-03-20T16:14:00Z');
    expect(withoutZ).toBe(withZ);
  });

  it('parses ISO string with T separator and Z suffix', () => {
    const ms = safeParseTimestamp('2026-03-20T16:14:00Z');
    expect(ms).not.toBeNull();
    expect(ms).toBe(Date.parse('2026-03-20T16:14:00Z'));
  });

  it('parses ISO string with positive timezone offset', () => {
    const ms = safeParseTimestamp('2026-03-20T18:14:00+02:00');
    expect(ms).not.toBeNull();
    // +02:00 offset means UTC is 16:14:00
    expect(ms).toBe(Date.parse('2026-03-20T16:14:00Z'));
  });

  it('parses ISO string with negative timezone offset', () => {
    const ms = safeParseTimestamp('2026-03-20T11:14:00-05:00');
    expect(ms).not.toBeNull();
    // -05:00 offset means UTC is 16:14:00
    expect(ms).toBe(Date.parse('2026-03-20T16:14:00Z'));
  });

  it('returns null for null input', () => {
    expect(safeParseTimestamp(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeParseTimestamp('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(safeParseTimestamp('garbage')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(safeParseTimestamp('9999-99-99 99:99:99')).toBeNull();
  });

  it('returns epoch ms (number) not epoch seconds', () => {
    const ms = safeParseTimestamp('2026-03-20 16:14:00');
    // epoch ms should be much larger than epoch seconds
    expect(ms).toBeGreaterThan(1_000_000_000_000);
  });
});

describe('computeSafeDurationMs', () => {
  it('computes correct duration between two SQLite timestamps', () => {
    const duration = computeSafeDurationMs(
      '2026-03-20 16:14:00',
      '2026-03-20 16:15:30',
    );
    expect(duration).toBe(90_000); // 90 seconds = 90000 ms
  });

  it('returns null when startedAt is null', () => {
    expect(computeSafeDurationMs(null, '2026-03-20 16:15:30')).toBeNull();
  });

  it('returns null when startedAt is empty string', () => {
    expect(computeSafeDurationMs('', '2026-03-20 16:15:30')).toBeNull();
  });

  it('returns a positive number when completedAt is null (running job)', () => {
    const duration = computeSafeDurationMs('2026-03-20 16:14:00', null);
    expect(duration).not.toBeNull();
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 for same start and end timestamps', () => {
    const duration = computeSafeDurationMs(
      '2026-03-20 16:14:00',
      '2026-03-20 16:14:00',
    );
    expect(duration).toBe(0);
  });

  it('returns null when startedAt is unparseable', () => {
    expect(computeSafeDurationMs('not-a-date', '2026-03-20 16:15:30')).toBeNull();
  });

  it('handles Z-suffix timestamps same as SQLite format', () => {
    const withSqlite = computeSafeDurationMs(
      '2026-03-20 16:14:00',
      '2026-03-20 16:15:30',
    );
    const withZ = computeSafeDurationMs(
      '2026-03-20T16:14:00Z',
      '2026-03-20T16:15:30Z',
    );
    expect(withSqlite).toBe(withZ);
  });

  it('returns non-negative value even for out-of-order timestamps', () => {
    const duration = computeSafeDurationMs(
      '2026-03-20 16:15:30',
      '2026-03-20 16:14:00',
    );
    // clamped to 0 by Math.max(0, ...)
    expect(duration).toBe(0);
  });
});
