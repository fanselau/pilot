/**
 * Tests for budget-aware continuation gating and improved human-only detection.
 *
 * Budget checks ensure handleGapsContinuation and handleFailedContinuation
 * do not blindly re-delegate when remaining step budget is insufficient.
 */

import { describe, it, expect } from 'vitest';

// ── MIN_CONTINUATION_BUDGET constant ──────────────────────────────────────

describe('MIN_CONTINUATION_BUDGET', () => {
  it('is exported from types.ts with value 3', async () => {
    const types = await import('../../src/core/types.js');
    expect((types as Record<string, unknown>)['MIN_CONTINUATION_BUDGET']).toBe(3);
  });
});

// ── buildBudgetExhaustedMessage ────────────────────────────────────────────

describe('_buildBudgetExhaustedMessage', () => {
  it('is exported from runner.ts', async () => {
    const runner = await import('../../src/core/runner.js');
    expect(typeof (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage']).toBe('function');
  });

  it('contains "Budget insufficient" with remaining and required counts', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const msg = fn(2, 3, 8, 'judge:gaps', 'Some gaps remain');
    expect(msg).toContain('Budget insufficient');
    expect(msg).toContain('2 steps remaining');
    expect(msg).toContain('3 needed');
    expect(msg).toContain('8 steps already completed');
  });

  it('includes "gap closure" label for judge:gaps source', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const msg = fn(1, 3, 9, 'judge:gaps');
    expect(msg).toContain('gap closure');
    expect(msg).toContain('substantially complete');
  });

  it('includes "failure recovery" label for judge:failed source', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const msg = fn(0, 3, 10, 'judge:failed', 'Tests failing');
    expect(msg).toContain('failure recovery');
    expect(msg).toContain('Recovery could not proceed');
  });

  it('includes truncated last verdict reason when provided', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const longReason = 'x'.repeat(300);
    const msg = fn(2, 3, 8, 'judge:gaps', longReason);
    expect(msg).toContain('Last verdict:');
    // Reason should be truncated to 200 chars
    const reasonPart = msg.split('Last verdict: ')[1]?.split('. ')[0];
    expect(reasonPart!.length).toBeLessThanOrEqual(200);
  });

  it('omits last verdict when no reason provided', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const msg = fn(2, 3, 8, 'judge:gaps');
    expect(msg).not.toContain('Last verdict:');
  });
});

// ── Budget math verification ───────────────────────────────────────────────

describe('Budget math', () => {
  it('MAX_STEPS_PER_JOB - totalSteps < MIN_CONTINUATION_BUDGET triggers budget gate', async () => {
    const types = await import('../../src/core/types.js');
    const MAX = (types as Record<string, unknown>)['MAX_STEPS_PER_JOB'] as number;
    const MIN = (types as Record<string, unknown>)['MIN_CONTINUATION_BUDGET'] as number;

    // With 8 steps of 10 total, remaining = 2 < 3 → budget insufficient
    const remaining = MAX - 8;
    expect(remaining).toBeLessThan(MIN);
    expect(remaining).toBe(2);
  });

  it('MAX_STEPS_PER_JOB - totalSteps >= MIN_CONTINUATION_BUDGET allows continuation', async () => {
    const types = await import('../../src/core/types.js');
    const MAX = (types as Record<string, unknown>)['MAX_STEPS_PER_JOB'] as number;
    const MIN = (types as Record<string, unknown>)['MIN_CONTINUATION_BUDGET'] as number;

    // With 7 steps of 10 total, remaining = 3 >= 3 → budget sufficient
    const remaining = MAX - 7;
    expect(remaining).toBeGreaterThanOrEqual(MIN);
    expect(remaining).toBe(3);
  });

  it('budget gate should be checked BEFORE cycle count check (budget is first gate)', async () => {
    // This is a specification test — the constants must support budget-first ordering:
    // If remaining < MIN_CONTINUATION_BUDGET, stop immediately regardless of cycle count.
    // If remaining >= MIN_CONTINUATION_BUDGET, THEN check cycles >= MAX_CONTINUATION_CYCLES.
    const types = await import('../../src/core/types.js');
    const MAX = (types as Record<string, unknown>)['MAX_STEPS_PER_JOB'] as number;
    const MIN = (types as Record<string, unknown>)['MIN_CONTINUATION_BUDGET'] as number;
    const MAX_CYCLES = (types as Record<string, unknown>)['MAX_CONTINUATION_CYCLES'] as number;

    // Budget gate values must be meaningful
    expect(MIN).toBeGreaterThan(0);
    expect(MAX).toBeGreaterThan(MIN);
    expect(MAX_CYCLES).toBeGreaterThan(0);
  });
});

// ── Gaps budget-exhaustion outcome: completed_pending_review ────────────────

describe('Budget-exhaustion outcome for gaps_found', () => {
  it('gaps + budget exhaustion should suggest human review (not failure)', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const msg = fn(2, 3, 8, 'judge:gaps', 'Minor UI gaps');
    // For gaps, the message should indicate the work is substantially done
    expect(msg).toContain('substantially complete');
    expect(msg).toContain('human review');
  });
});

// ── Failed budget-exhaustion outcome: markFailed ────────────────────────────

describe('Budget-exhaustion outcome for failed', () => {
  it('failed + budget exhaustion should explain recovery could not proceed', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildBudgetExhaustedMessage'] as (
      remaining: number,
      required: number,
      totalSteps: number,
      source: 'judge:gaps' | 'judge:failed',
      lastReason?: string,
    ) => string;

    const msg = fn(1, 3, 9, 'judge:failed', 'Build errors persist');
    expect(msg).toContain('Recovery could not proceed');
    expect(msg).toContain('remaining step budget');
  });
});

// ── Phase 84 guard backward compatibility ──────────────────────────────────

describe('Phase 84 continuation-cycle guard compatibility', () => {
  it('MAX_CONTINUATION_CYCLES still exists and is 2', async () => {
    const types = await import('../../src/core/types.js');
    expect((types as Record<string, unknown>)['MAX_CONTINUATION_CYCLES']).toBe(2);
  });

  it('_buildContinuationLimitMessage still works correctly', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildContinuationLimitMessage'] as (
      maxCycles: number,
      continuationSteps: number,
      totalSteps: number,
      lastVerdict: string,
    ) => string;

    const msg = fn(2, 6, 8, 'Tests are still failing');
    expect(msg).toContain('Continuation cycle limit reached (2)');
    expect(msg).toContain('6/8 steps were continuation-driven');
  });
});

// ── isHumanOnlyRemaining — extended signals ────────────────────────────────

describe('isHumanOnlyRemaining — extended signals', () => {
  // Helper type matching JudgeVerdict shape
  type Verdict = { verdict: string; confidence: number; reason: string; gaps?: string[] };

  let isHumanOnlyRemaining: (verdict: Verdict) => boolean;

  it('loads isHumanOnlyRemaining from runner.ts', async () => {
    const runner = await import('../../src/core/runner.js');
    isHumanOnlyRemaining = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as typeof isHumanOnlyRemaining;
    expect(typeof isHumanOnlyRemaining).toBe('function');
  });

  // Approval/sign-off keywords
  it('detects "approve", "sign-off", "QA", "stakeholder", "product owner" keywords', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Needs stakeholder approve'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Requires sign-off from lead'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['QA pass needed'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Product owner review'] })).toBe(true);
  });

  // Deploy/release keywords
  it('detects "deploy", "release", "publish", "ship" as human-action signals', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Deploy to production'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Release to app store'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Publish package'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Ship to customers'] })).toBe(true);
  });

  // Soft/review/polish keywords
  it('detects "polish", "tweak", "copy edit", "wording" as soft/review items', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Polish the UI spacing'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Tweak button alignment'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Copy edit the homepage'] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Fix wording on the landing page'] })).toBe(true);
  });

  // Confidence-based: high confidence + all soft gaps → true
  it('with confidence >= 85 and all gaps matching soft-review patterns (no code keywords) returns true', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    // Soft gaps that match the softGapKeywords but NOT the humanKeywords regex directly
    expect(fn({
      verdict: 'gaps_found',
      confidence: 85,
      reason: 'Minor adjustments needed',
      gaps: ['spacing adjustment', 'alignment check', 'padding fix'],
    })).toBe(true);

    expect(fn({
      verdict: 'gaps_found',
      confidence: 90,
      reason: 'Almost done',
      gaps: ['color adjust needed', 'font size tweak'],
    })).toBe(true);
  });

  // Confidence-based: high confidence + gaps with code keywords → false
  it('with confidence >= 85 BUT gaps containing code keywords returns false', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({
      verdict: 'gaps_found',
      confidence: 90,
      reason: 'Nearly there',
      gaps: ['Fix the compile error in auth.ts'],
    })).toBe(false);

    expect(fn({
      verdict: 'gaps_found',
      confidence: 95,
      reason: 'Close',
      gaps: ['polish UI', 'bug in login form'],
    })).toBe(false);
  });

  // Low confidence + soft gaps → still true (keyword match alone is sufficient)
  it('with confidence < 85 and soft gaps still returns true (keyword match alone is sufficient)', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({
      verdict: 'gaps_found',
      confidence: 50,
      reason: '',
      gaps: ['Deploy to staging'],
    })).toBe(true);
  });

  // Code keywords → always false
  it('returns false for gaps with "bug", "error", "crash", "test fail", "missing implementation"', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Fix the bug in parser'] })).toBe(false);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['Handle the error case'] })).toBe(false);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['App crash on startup'] })).toBe(false);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['test fail in auth module'] })).toBe(false);
    expect(fn({ verdict: 'gaps_found', confidence: 70, reason: '', gaps: ['missing implementation for API'] })).toBe(false);
  });

  // Backward compatibility: existing behavior preserved
  it('preserves existing behavior — "manual review needed" in reason returns true', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 60, reason: 'Needs manual review', gaps: [] })).toBe(true);
    expect(fn({ verdict: 'gaps_found', confidence: 60, reason: 'visual inspection needed', gaps: [] })).toBe(true);
  });

  it('preserves existing behavior — code keyword in reason overrides human keyword', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 60, reason: 'manual review needed but there is a bug', gaps: [] })).toBe(false);
  });

  it('returns false when no human signals at all', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['isHumanOnlyRemaining'] as (v: Verdict) => boolean;

    expect(fn({ verdict: 'gaps_found', confidence: 60, reason: 'Some work needed', gaps: ['implement feature X'] })).toBe(false);
  });
});
