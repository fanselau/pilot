/**
 * Tests for pure exported helpers in runner.ts.
 *
 * Only tests `parseJudgeVerdict` — a pure function that parses judge session
 * output into a typed verdict. No DB, no execa mocking required.
 */

import { describe, it, expect } from 'vitest';
import { parseJudgeVerdict } from '../../src/core/runner.js';

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
