import { describe, expect, it } from 'vitest';
import type { Job } from '../../src/core/types.js';
import { buildJudgeSignal, formatJudgeReason, parseJudgeVerdictPayload, formatJudgeBadge } from '../../src/core/judge-signal.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ab12',
    project: 'demo-proj',
    scope: 'phase',
    description: 'do thing',
    requirementPath: null,
    status: 'completed',
    priority: 0,
    dependsOn: null,
    parentJobId: null,
    createdAt: '2026-03-08 00:00:00',
    startedAt: null,
    completedAt: null,
    error: null,
    resumeHint: null,
    attempts: 0,
    timeout: 0,
    delegationPlan: null,
    currentStep: 0,
    sessionTitles: null,
    modelProfile: 'balanced',
    providerMode: 'claude-only',
    judgeVerdict: null,
    actualModels: null,
    callbackUrl: null,
    callbackSessionKey: null,
    notifyRoute: null,
    categories: null,
    runtimeSkillSnapshot: null,
    gitBaseCommit: null,
    gitHeadCommit: null,
    startedDirty: false,
    skipGracePeriod: false,
    retryBudget: 3,
    retryCount: 0,
    retryHint: null,
    lastFailureFingerprint: null,
    hungCount: 0,
    lastHungReason: null,
    ...overrides,
  };
}

describe('buildJudgeSignal', () => {
  it('maps succeeded verdict to judge:pass badge', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 92, reason: 'looks good' }),
    }));

    expect(signal.outcome).toBe('pass');
    expect(signal.badge).toBe('judge:pass 92%');
    expect(signal.reason).toBe('looks good');
  });

  it('maps failed verdict to judge:fail badge', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'failed', confidence: 95, reason: 'missing output' }),
    }));

    expect(signal.outcome).toBe('fail');
    expect(signal.badge).toBe('judge:fail 95%');
  });

  it('maps doubting verdict to judge:gaps badge (transition)', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'doubting', confidence: 61, reason: 'partially met' }),
    }));

    expect(signal.outcome).toBe('gaps');
    expect(signal.badge).toBe('judge:gaps 61%');
  });

  it('returns inconclusive for confidence 0 payloads', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 0, reason: 'benefit of doubt' }),
    }));

    expect(signal.outcome).toBe('inconclusive');
    expect(signal.badge).toBe('judge:inconclusive');
  });

  it('returns inconclusive when verdict key is missing', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ confidence: 92, reason: 'no verdict' }),
    }));

    expect(signal.outcome).toBe('inconclusive');
    expect(signal.badge).toBe('judge:inconclusive');
  });

  it('returns inconclusive for malformed json payloads', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: '{"verdict": "succeeded", ',
    }));

    expect(signal.outcome).toBe('inconclusive');
    expect(signal.badge).toBe('judge:inconclusive');
  });

  it('returns inconclusive for unknown verdict values', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'shrug', confidence: 77, reason: 'unknown value' }),
    }));

    expect(signal.outcome).toBe('inconclusive');
    expect(signal.badge).toBe('judge:inconclusive');
  });

  it('returns none for non-phase jobs', () => {
    const signal = buildJudgeSignal(makeJob({
      scope: 'quick',
      judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 100, reason: 'not used' }),
    }));

    expect(signal.outcome).toBe('none');
    expect(signal.badge).toBe('');
    expect(signal.reason).toBeNull();
  });

  it('prefers reason over summary and falls back to summary', () => {
    const reasonFirst = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({
        verdict: 'succeeded',
        confidence: 88,
        reason: 'new reason',
        summary: 'legacy summary',
      }),
    }));

    const summaryFallback = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({
        verdict: 'succeeded',
        confidence: 88,
        summary: 'legacy summary',
      }),
    }));

    expect(reasonFirst.reason).toBe('new reason');
    expect(summaryFallback.reason).toBe('legacy summary');
  });
});

describe('formatJudgeReason', () => {
  it('returns fallback text when reason is missing', () => {
    expect(formatJudgeReason(null)).toBe('n/a');
    expect(formatJudgeReason(null, 'benefit of doubt')).toBe('benefit of doubt');
  });
});

describe('buildJudgeSignal — new verdict format (pass/fail/partial)', () => {
  it('maps pass verdict to judge:pass badge', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'pass', confidence: 85, reason: 'tests pass' }),
    }));
    expect(signal.outcome).toBe('pass');
    expect(signal.badge).toBe('judge:pass 85%');
  });

  it('maps partial verdict to judge:gaps badge (transition)', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({
        verdict: 'partial',
        confidence: 45,
        reason: 'incomplete',
        retryRecommendation: 'retry-resume',
        retryHint: 'Resume from plan 03',
        failureFingerprint: ['test: timeout'],
      }),
    }));
    expect(signal.outcome).toBe('gaps');
    expect(signal.badge).toBe('judge:gaps 45%');
    expect(signal.retryRecommendation).toBe('retry-resume');
    expect(signal.retryHint).toBe('Resume from plan 03');
    expect(signal.failureFingerprint).toEqual(['test: timeout']);
  });

  it('maps fail verdict to judge:fail badge', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'fail', confidence: 90, reason: 'build errors' }),
    }));
    expect(signal.outcome).toBe('fail');
    expect(signal.badge).toBe('judge:fail 90%');
  });

  it('handles legacy succeeded alongside new pass (backward compat)', () => {
    const legacy = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 92, reason: 'ok' }),
    }));
    expect(legacy.outcome).toBe('pass');

    const modern = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'pass', confidence: 92, reason: 'ok' }),
    }));
    expect(modern.outcome).toBe('pass');
  });

  it('passes through null retry fields when not present in verdict', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 90, reason: 'ok' }),
    }));
    expect(signal.retryRecommendation).toBeNull();
    expect(signal.retryHint).toBeNull();
    expect(signal.failureFingerprint).toBeNull();
  });
});

// ── parseJudgeVerdictPayload (Phase 73: new verdict values) ──────────────

describe('parseJudgeVerdictPayload — Phase 73 verdict values', () => {
  it('handles passed verdict', () => {
    const result = parseJudgeVerdictPayload(
      JSON.stringify({ verdict: 'passed', confidence: 85, reason: 'All tests pass', gaps: [] }),
    );
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('passed');
    expect(result!.confidence).toBe(85);
    expect(result!.gaps).toEqual([]);
  });

  it('handles gaps_found verdict with gaps', () => {
    const result = parseJudgeVerdictPayload(
      JSON.stringify({ verdict: 'gaps_found', confidence: 45, reason: '2 tests failing', gaps: ['test_auth fails', 'test_login missing'] }),
    );
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('gaps_found');
    expect(result!.confidence).toBe(45);
    expect(result!.gaps).toHaveLength(2);
    expect(result!.gaps).toEqual(['test_auth fails', 'test_login missing']);
  });

  it('returns null for non-string verdict', () => {
    const result = parseJudgeVerdictPayload(
      JSON.stringify({ verdict: 123, confidence: 90, reason: 'bad verdict type' }),
    );
    expect(result).not.toBeNull();
    expect(result!.verdict).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseJudgeVerdictPayload(null)).toBeNull();
  });
});

// ── buildJudgeSignal — Phase 73 canonical verdicts ──────────────────────

describe('buildJudgeSignal — Phase 73 canonical verdicts', () => {
  it('maps passed to pass outcome', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'passed', confidence: 85, reason: 'tests pass' }),
    }));
    expect(signal.outcome).toBe('pass');
    expect(signal.badge).toBe('judge:pass 85%');
  });

  it('maps gaps_found to gaps outcome', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({
        verdict: 'gaps_found',
        confidence: 45,
        reason: 'gaps remain',
        gaps: ['auth test'],
        verificationStatus: 'gaps_found',
        actionableGapCount: 2,
        humanVerificationCount: 1,
        routingDecision: 'continue-gaps',
        routingReason: 'Structured verification reports 2 actionable gap(s)',
        artifactPath: '/tmp/87-VERIFICATION.md',
      }),
    }));
    expect(signal.outcome).toBe('gaps');
    expect(signal.badge).toBe('judge:gaps 45%');
    expect(signal.gaps).toEqual(['auth test']);
    expect(signal.verification).toMatchObject({
      status: 'gaps_found',
      actionableGapCount: 2,
      humanVerificationCount: 1,
      routingDecision: 'continue-gaps',
      routingReason: 'Structured verification reports 2 actionable gap(s)',
      artifactPath: '/tmp/87-VERIFICATION.md',
    });
  });

  it('maps legacy doubting to gaps outcome', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'doubting', confidence: 55, reason: 'partial' }),
    }));
    expect(signal.outcome).toBe('gaps');
  });

  it('maps legacy partial to gaps outcome', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'partial', confidence: 40, reason: 'incomplete' }),
    }));
    expect(signal.outcome).toBe('gaps');
  });
});

// ── formatJudgeBadge — gaps outcome ──────────────────────────────────────

describe('formatJudgeBadge — Phase 73', () => {
  it('handles gaps outcome', () => {
    expect(formatJudgeBadge('gaps', 45)).toBe('judge:gaps 45%');
  });

  it('handles pass outcome', () => {
    expect(formatJudgeBadge('pass', 92)).toBe('judge:pass 92%');
  });

  it('handles inconclusive with null confidence', () => {
    expect(formatJudgeBadge('inconclusive', null)).toBe('judge:inconclusive');
  });

  it('keeps older verdict payloads backward compatible when structured verification fields are absent', () => {
    const signal = buildJudgeSignal(makeJob({
      judgeVerdict: JSON.stringify({ verdict: 'succeeded', confidence: 92, reason: 'legacy payload' }),
    }));

    expect(signal.outcome).toBe('pass');
    expect(signal.verification).toBeNull();
  });
});
