/**
 * TDD tests for StepSource type, extended JobStep, and MAX_STEPS_PER_JOB constant.
 *
 * RED phase: these tests fail because the types/constant don't exist yet.
 */

import { describe, it, expect } from 'vitest';
import type { StepSource, JobStep, DelegationIntent } from '../../src/core/types.js';
import { MAX_STEPS_PER_JOB } from '../../src/core/types.js';

describe('StepSource type', () => {
  it('accepts delegation value', () => {
    const source: StepSource = 'delegation';
    expect(source).toBe('delegation');
  });

  it('accepts judge:gaps value', () => {
    const source: StepSource = 'judge:gaps';
    expect(source).toBe('judge:gaps');
  });

  it('accepts judge:hung value', () => {
    const source: StepSource = 'judge:hung';
    expect(source).toBe('judge:hung');
  });

  it('accepts judge:failed value', () => {
    const source: StepSource = 'judge:failed';
    expect(source).toBe('judge:failed');
  });

  it('accepts operator value', () => {
    const source: StepSource = 'operator';
    expect(source).toBe('operator');
  });
});

describe('JobStep interface', () => {
  it('has source, reason, and error fields', () => {
    const step: JobStep = {
      id: 1,
      jobId: 'abcd',
      stepIndex: 0,
      command: 'execute-phase',
      args: '31',
      source: 'delegation',
      status: 'pending',
      sessionId: null,
      sessionTitle: null,
      reason: 'initial delegation',
      startedAt: null,
      completedAt: null,
      error: null,
      durationMs: null,
      verdictSource: null,
      verdictReason: null,
    };
    expect(step.source).toBe('delegation');
    expect(step.reason).toBe('initial delegation');
    expect(step.error).toBeNull();
  });

  it('supports pending status', () => {
    const step: JobStep = {
      id: 2,
      jobId: 'abcd',
      stepIndex: 1,
      command: 'judge',
      args: '',
      source: 'judge:gaps',
      status: 'pending',
      sessionId: null,
      sessionTitle: null,
      reason: 'judge found 3 gaps',
      startedAt: null,
      completedAt: null,
      error: null,
      durationMs: null,
      verdictSource: null,
      verdictReason: null,
    };
    expect(step.status).toBe('pending');
    expect(step.startedAt).toBeNull();
  });
});

describe('DelegationIntent plan-and-execute with categories', () => {
  it('accepts optional categories field', () => {
    const intent: DelegationIntent = {
      type: 'plan-and-execute',
      phaseNumber: 31,
      categories: ['frontend', 'testing'],
    };
    expect(intent.type).toBe('plan-and-execute');
    if (intent.type === 'plan-and-execute') {
      expect(intent.categories).toEqual(['frontend', 'testing']);
    }
  });

  it('categories is optional', () => {
    const intent: DelegationIntent = {
      type: 'plan-and-execute',
      phaseNumber: 31,
    };
    expect(intent.type).toBe('plan-and-execute');
    if (intent.type === 'plan-and-execute') {
      expect(intent.categories).toBeUndefined();
    }
  });
});

describe('MAX_STEPS_PER_JOB', () => {
  it('is exported and equals 10', () => {
    expect(MAX_STEPS_PER_JOB).toBe(10);
  });
});
