/**
 * Tests for continuation cycle guard and step-cap messaging (Phase 84, Plan 02).
 *
 * TDD: Tests are written before implementation to specify the required behavior.
 * RED phase — these tests will fail until the implementation is in place.
 */

import { describe, it, expect } from 'vitest';

// ── MAX_CONTINUATION_CYCLES constant ──────────────────────────────────────

describe('MAX_CONTINUATION_CYCLES', () => {
  it('is exported from types.ts with value 2', async () => {
    const types = await import('../../src/core/types.js');
    expect((types as Record<string, unknown>)['MAX_CONTINUATION_CYCLES']).toBe(2);
  });
});

// ── Step cap message breakdown ─────────────────────────────────────────────

describe('_buildStepCapMessage', () => {
  it('is exported from runner.ts', async () => {
    const runner = await import('../../src/core/runner.js');
    expect(typeof (runner as Record<string, unknown>)['_buildStepCapMessage']).toBe('function');
  });

  it('includes Breakdown: with per-source step counts', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildStepCapMessage'] as (
      totalCap: number,
      delegationSteps: number,
      gapSteps: number,
      failSteps: number,
      hungSteps: number,
    ) => string;

    const msg = fn(10, 3, 4, 2, 1);
    expect(msg).toContain('Breakdown:');
    expect(msg).toContain('3 initial');
    expect(msg).toContain('4 gap-closure');
    expect(msg).toContain('2 failure-recovery');
    expect(msg).toContain('1 hung-recovery');
    expect(msg).toContain('Step cap reached (10)');
  });

  it('explains the likely cause', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildStepCapMessage'] as (
      totalCap: number,
      delegationSteps: number,
      gapSteps: number,
      failSteps: number,
      hungSteps: number,
    ) => string;

    const msg = fn(10, 2, 5, 3, 0);
    expect(msg).toContain('judge');
  });
});

// ── Continuation limit message ─────────────────────────────────────────────

describe('_buildContinuationLimitMessage', () => {
  it('is exported from runner.ts', async () => {
    const runner = await import('../../src/core/runner.js');
    expect(typeof (runner as Record<string, unknown>)['_buildContinuationLimitMessage']).toBe('function');
  });

  it('contains "Continuation cycle limit reached" with cycle count', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildContinuationLimitMessage'] as (
      maxCycles: number,
      continuationSteps: number,
      totalSteps: number,
      lastVerdict: string,
    ) => string;

    const msg = fn(2, 6, 8, 'Tests are still failing in module X');
    expect(msg).toContain('Continuation cycle limit reached (2)');
    expect(msg).toContain('6/8 steps were continuation-driven');
    expect(msg).toContain('Tests are still failing in module X');
  });

  it('truncates long verdict reasons to 200 chars', async () => {
    const runner = await import('../../src/core/runner.js');
    const fn = (runner as Record<string, unknown>)['_buildContinuationLimitMessage'] as (
      maxCycles: number,
      continuationSteps: number,
      totalSteps: number,
      lastVerdict: string,
    ) => string;

    const longReason = 'x'.repeat(300);
    const msg = fn(2, 4, 6, longReason);
    // The reason should be sliced to 200 chars max
    const reasonPart = msg.split('Last verdict: ')[1];
    expect(reasonPart.length).toBeLessThanOrEqual(200);
  });
});
