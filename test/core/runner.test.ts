/**
 * Tests for pure exported helpers in runner.ts.
 *
 * Tests `parseJudgeVerdict`, `getDynamicMaxParallel`, and `hasSystemdRunUser`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs so we can control /proc/meminfo content for getDynamicMaxParallel tests
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: unknown) => {
      if (filePath === '/proc/meminfo') {
        return _mockMeminfoContent;
      }
      return actual.readFileSync(filePath, encoding as BufferEncoding);
    }),
  };
});

// Module-level variable to control mock /proc/meminfo content.
// Updated per-test before the module reads it.
let _mockMeminfoContent = 'MemAvailable:   62914560 kB\n'; // 60 GB default

import { parseJudgeVerdict, getDynamicMaxParallel, hasSystemdRunUser, _resetSystemdRunCache } from '../../src/core/runner.js';

// ── parseJudgeVerdict ──────────────────────────────────────────────────────

describe('parseJudgeVerdict', () => {
  it('parses verdict from fenced ```json block', () => {
    const content = [
      "Here's my verdict:",
      '```json',
      '{"verdict":"pass","confidence":95,"summary":"All good","retryRecommendation":"none"}',
      '```',
      'End.',
    ].join('\n');

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('pass');
    expect(result!.confidence).toBe(95);
    expect(result!.summary).toBe('All good');
    expect(result!.retryRecommendation).toBe('none');
  });

  it('parses verdict from raw JSON (entire content is JSON)', () => {
    const content = '{"verdict":"fail","confidence":80,"summary":"Missing tests","retryRecommendation":"retry-full","retryHint":"Add unit tests"}';

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('fail');
    expect(result!.confidence).toBe(80);
    expect(result!.summary).toBe('Missing tests');
    expect(result!.retryRecommendation).toBe('retry-full');
    expect(result!.retryHint).toBe('Add unit tests');
  });

  it('parses verdict from text-wrapped JSON (extracts first {...} block)', () => {
    const content = 'After careful analysis, I believe {"verdict":"partial","confidence":60,"summary":"Partial success","retryRecommendation":"retry-resume"} is my assessment.';

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('partial');
    expect(result!.confidence).toBe(60);
    expect(result!.summary).toBe('Partial success');
    expect(result!.retryRecommendation).toBe('retry-resume');
  });

  it('returns null when no JSON found in content', () => {
    const content = "I couldn't evaluate this session properly.";

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('returns null for invalid verdict field', () => {
    const content = '{"verdict":"unknown","confidence":50,"summary":"test","retryRecommendation":"none"}';

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON in fenced block', () => {
    const content = '```json\n{broken json}\n```';

    const result = parseJudgeVerdict(content);
    expect(result).toBeNull();
  });

  it('handles whitespace in fenced JSON blocks', () => {
    const content = [
      'My evaluation:',
      '```json',
      '',
      '  {',
      '    "verdict": "pass",',
      '    "confidence": 90,',
      '    "summary": "Looks great",',
      '    "retryRecommendation": "none"',
      '  }',
      '',
      '```',
    ].join('\n');

    const result = parseJudgeVerdict(content);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('pass');
    expect(result!.confidence).toBe(90);
    expect(result!.summary).toBe('Looks great');
  });
});

// ── getDynamicMaxParallel ─────────────────────────────────────────────────

describe('getDynamicMaxParallel', () => {
  it('caps at configuredMax when plenty of memory available (60GB, 8GB per session, 4GB reserved)', () => {
    // 60GB available - 4GB reserved = 56GB usable, 56GB / 8GB = 7 slots → capped at configuredMax=4
    _mockMeminfoContent = 'MemAvailable:   62914560 kB\n'; // 60 GB
    const result = getDynamicMaxParallel(4, 8192, 4096);
    expect(result).toBe(4); // configuredMax wins
  });

  it('returns memory-limited slot count when less than configuredMax (32GB available, 8GB per session, 4GB reserved)', () => {
    // 32GB available - 4GB reserved = 28GB usable, 28GB / 8GB = 3 slots → 3 < configuredMax=5
    _mockMeminfoContent = 'MemAvailable:   33554432 kB\n'; // 32 GB
    const result = getDynamicMaxParallel(5, 8192, 4096);
    expect(result).toBe(3); // memory-limited
  });

  it('returns 0 when available memory is less than reserved (3GB available, 4GB reserved)', () => {
    // 3GB available - 4GB reserved = negative → clamped to 0 usable → 0 slots
    _mockMeminfoContent = 'MemAvailable:   3145728 kB\n'; // 3 GB
    const result = getDynamicMaxParallel(4, 8192, 4096);
    expect(result).toBe(0);
  });

  it('returns configuredMax on non-Linux (ENOENT → Infinity)', async () => {
    // Simulate non-Linux: readFileSync throws ENOENT → getAvailableMemoryMb returns Infinity
    _mockMeminfoContent = ''; // Won't be reached — mock throws instead
    const { readFileSync } = vi.mocked(await import('node:fs'));
    const saved = readFileSync.getMockImplementation();
    readFileSync.mockImplementationOnce((path: unknown) => {
      if (path === '/proc/meminfo') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw new Error('unexpected call');
    });

    const result = getDynamicMaxParallel(3, 8192, 4096);
    expect(result).toBe(3); // configuredMax returned on Infinity

    // Restore
    if (saved) readFileSync.mockImplementation(saved as Parameters<typeof readFileSync.mockImplementation>[0]);
    else readFileSync.mockRestore();
  });
});

// ── hasSystemdRunUser ─────────────────────────────────────────────────────

describe('hasSystemdRunUser', () => {
  beforeEach(() => {
    _resetSystemdRunCache();
  });

  afterEach(() => {
    _resetSystemdRunCache();
  });

  it('returns a boolean', async () => {
    const result = await hasSystemdRunUser();
    expect(typeof result).toBe('boolean');
  });

  it('caches its result after first call (returns same value on second call)', async () => {
    const first = await hasSystemdRunUser();
    const second = await hasSystemdRunUser();
    expect(first).toBe(second);
  });
});
