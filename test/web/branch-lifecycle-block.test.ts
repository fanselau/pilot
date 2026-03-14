import { describe, expect, it } from 'vitest';
import type { BranchLifecycleItem } from '../../src/core/types.js';
import {
  deriveBranchIdentity,
  selectBranchPreview,
  getBranchDrillInPath,
} from '../../web/src/components/branch-lifecycle-block.helpers.ts';

function makeBranch(overrides: Partial<BranchLifecycleItem> = {}): BranchLifecycleItem {
  return {
    kind: 'fork-card',
    sessionId: 'child-session-1',
    parentSessionId: 'parent-session-1',
    title: 'task: gsd-executor - implement web timeline',
    createdAt: 1_000,
    updatedAt: 2_000,
    completedAt: null,
    status: 'active',
    messageCount: 4,
    tokenTotal: 320,
    models: ['openai/gpt-5.4'],
    latestMessagePreview: 'Current branch progress update',
    finalMessagePreview: null,
    childCount: 1,
    durationMs: 1_000,
    ...overrides,
  };
}

describe('selectBranchPreview', () => {
  it('uses latest preview for active branches', () => {
    const item = makeBranch({
      status: 'active',
      latestMessagePreview: 'still running summary',
      finalMessagePreview: 'final summary should not win while active',
    });

    expect(selectBranchPreview(item)).toBe('still running summary');
  });

  it('uses final preview first for done branches', () => {
    const item = makeBranch({
      status: 'done',
      latestMessagePreview: 'latest interim summary',
      finalMessagePreview: 'final answer from child branch',
    });

    expect(selectBranchPreview(item)).toBe('final answer from child branch');
  });

  it('falls back to latest preview when done branch has no final preview', () => {
    const item = makeBranch({
      status: 'done',
      latestMessagePreview: 'latest useful answer',
      finalMessagePreview: null,
    });

    expect(selectBranchPreview(item)).toBe('latest useful answer');
  });
});

describe('deriveBranchIdentity', () => {
  it('extracts role and purpose from task-style titles', () => {
    const identity = deriveBranchIdentity('task: verifier - check branch lifecycle');

    expect(identity.label).toBe('task: verifier - check branch lifecycle');
    expect(identity.role).toBe('verifier');
    expect(identity.purpose).toBe('check branch lifecycle');
  });

  it('extracts role and purpose from colon-style titles', () => {
    const identity = deriveBranchIdentity('Reviewer: validate final answer quality');

    expect(identity.role).toBe('Reviewer');
    expect(identity.purpose).toBe('validate final answer quality');
  });

  it('returns semantic fields independent from metrics', () => {
    const lowMetrics = makeBranch({ messageCount: 1, tokenTotal: 5 });
    const highMetrics = makeBranch({ messageCount: 400, tokenTotal: 90_000 });

    expect(deriveBranchIdentity(lowMetrics.title)).toEqual(
      deriveBranchIdentity(highMetrics.title),
    );
    expect(selectBranchPreview(lowMetrics)).toBe(selectBranchPreview(highMetrics));
  });
});

describe('getBranchDrillInPath', () => {
  it('builds nested child detail path using job and session identity', () => {
    expect(getBranchDrillInPath('job-42', 'session-7')).toBe('/jobs/job-42/sessions/session-7');
  });

  it('encodes path segments for safe drill-in URLs', () => {
    expect(getBranchDrillInPath('job with spaces', 'sess/with/slash')).toBe(
      '/jobs/job%20with%20spaces/sessions/sess%2Fwith%2Fslash',
    );
  });
});
