import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  truncateString,
  truncateTitle,
  formatProgressBar,
} from '../../src/util/format.js';

describe('formatDuration', () => {
  it('returns "0s" for 0 seconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('returns "30s" for 30 seconds', () => {
    expect(formatDuration(30)).toBe('30s');
  });

  it('returns "59s" for 59 seconds', () => {
    expect(formatDuration(59)).toBe('59s');
  });

  it('returns "1m" for 60 seconds', () => {
    expect(formatDuration(60)).toBe('1m');
  });

  it('returns "1m 30s" for 90 seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('returns "45m" for 2700 seconds', () => {
    expect(formatDuration(2700)).toBe('45m');
  });

  it('returns "1h 0m" for 3600 seconds', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
  });

  it('returns "2h 15m" for 8100 seconds', () => {
    expect(formatDuration(8100)).toBe('2h 15m');
  });

  it('returns "0s" for negative input', () => {
    expect(formatDuration(-10)).toBe('0s');
  });

  it('handles fractional seconds by flooring', () => {
    expect(formatDuration(30.7)).toBe('30s');
  });
});

describe('truncateString', () => {
  it('returns short string unchanged', () => {
    expect(truncateString('hello', 10)).toBe('hello');
  });

  it('returns string at exact maxLen unchanged', () => {
    expect(truncateString('12345', 5)).toBe('12345');
  });

  it('truncates long string with ellipsis', () => {
    const result = truncateString('this is a long string', 10);
    expect(result).toBe('this is a\u2026');
    expect(result.length).toBe(10);
  });

  it('handles maxLen of 1', () => {
    expect(truncateString('hello', 1)).toBe('\u2026');
  });

  it('handles empty string', () => {
    expect(truncateString('', 10)).toBe('');
  });
});

describe('truncateTitle', () => {
  it('defaults maxLen to 80', () => {
    const long = 'a'.repeat(100);
    const result = truncateTitle(long);
    expect(result.length).toBe(80);
  });

  it('accepts custom maxLen', () => {
    const result = truncateTitle('a'.repeat(50), 20);
    expect(result.length).toBe(20);
  });

  it('returns short titles unchanged', () => {
    expect(truncateTitle('short')).toBe('short');
  });
});

describe('formatProgressBar', () => {
  it('shows empty bar for 0%', () => {
    expect(formatProgressBar(0, 10)).toBe('\u2591'.repeat(10));
  });

  it('shows full bar for 100%', () => {
    expect(formatProgressBar(100, 10)).toBe('\u2588'.repeat(10));
  });

  it('shows half bar for 50%', () => {
    expect(formatProgressBar(50, 10)).toBe('\u2588'.repeat(5) + '\u2591'.repeat(5));
  });

  it('shows 60% correctly', () => {
    expect(formatProgressBar(60, 10)).toBe('\u2588'.repeat(6) + '\u2591'.repeat(4));
  });

  it('clamps values above 100', () => {
    expect(formatProgressBar(150, 10)).toBe('\u2588'.repeat(10));
  });

  it('clamps values below 0', () => {
    expect(formatProgressBar(-10, 10)).toBe('\u2591'.repeat(10));
  });

  it('defaults to width 10', () => {
    const result = formatProgressBar(50);
    expect(result.length).toBe(10);
  });
});
