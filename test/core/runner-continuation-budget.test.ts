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
