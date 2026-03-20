import type { Job } from './types.js';

export type JudgeSignalOutcome = 'none' | 'pass' | 'fail' | 'gaps' | 'partial' | 'doubt' | 'inconclusive';

type JudgeVerdictValue = 'succeeded' | 'failed' | 'doubting' | 'pass' | 'fail' | 'partial' | 'passed' | 'gaps_found';

interface ParsedJudgeVerdictPayload {
  verdict: string | null;
  confidence: number | null;
  reason: string | null;
  gaps: string[] | null;
  // Keep retry fields for backward compat parsing (old verdicts in DB)
  retryRecommendation: string | null;
  retryHint: string | null;
  failureFingerprint: string[] | null;
}

export interface JudgeSignal {
  outcome: JudgeSignalOutcome;
  badge: string;
  confidence: number | null;
  reason: string | null;
  verdict: string | null;
  gaps: string[] | null;
  // Keep retry fields for backward compat (old verdicts in DB)
  retryRecommendation: string | null;
  retryHint: string | null;
  failureFingerprint: string[] | null;
}

const VERDICT_TO_OUTCOME: Record<JudgeVerdictValue, Exclude<JudgeSignalOutcome, 'none' | 'inconclusive'>> = {
  // New canonical values
  passed: 'pass',
  gaps_found: 'gaps',
  // Legacy values (backward compat)
  succeeded: 'pass',
  failed: 'fail',
  doubting: 'gaps',    // transition: was 'doubt'
  pass: 'pass',
  fail: 'fail',
  partial: 'gaps',     // transition: was 'partial'
};

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.round(value);
  if (normalized <= 0 || normalized > 100) return null;
  return normalized;
}

function mapVerdictToOutcome(verdict: string | null): Exclude<JudgeSignalOutcome, 'none' | 'inconclusive'> | null {
  if (!verdict) return null;
  return VERDICT_TO_OUTCOME[verdict as JudgeVerdictValue] ?? null;
}

export function parseJudgeVerdictPayload(judgeVerdict: string | null): ParsedJudgeVerdictPayload | null {
  if (!judgeVerdict) return null;

  try {
    const parsed = JSON.parse(judgeVerdict) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      verdict: asText(parsed.verdict),
      confidence: normalizeConfidence(parsed.confidence),
      reason: asText(parsed.reason) ?? asText(parsed.summary),
      gaps: Array.isArray(parsed.gaps)
        ? (parsed.gaps as unknown[]).filter((s): s is string => typeof s === 'string')
        : null,
      // Legacy fields (backward compat for old verdicts in DB)
      retryRecommendation: asText(parsed.retryRecommendation),
      retryHint: asText(parsed.retryHint),
      failureFingerprint: Array.isArray(parsed.failureFingerprint)
        ? (parsed.failureFingerprint as unknown[]).filter((s): s is string => typeof s === 'string')
        : null,
    };
  } catch {
    return null;
  }
}

export function formatJudgeBadge(outcome: JudgeSignalOutcome, confidence: number | null): string {
  if (outcome === 'none') return '';
  if (outcome === 'inconclusive' || confidence === null) return 'judge:inconclusive';
  // 'gaps' outcome shows as "judge:gaps N%" for gap-found verdicts
  return `judge:${outcome} ${confidence}%`;
}

export function formatJudgeReason(reason: string | null, fallback = 'n/a'): string {
  return reason ?? fallback;
}

export function buildJudgeSignal(job: Pick<Job, 'scope' | 'judgeVerdict'>): JudgeSignal {
  if (job.scope !== 'phase') {
    return {
      outcome: 'none',
      badge: '',
      confidence: null,
      reason: null,
      verdict: null,
      gaps: null,
      retryRecommendation: null,
      retryHint: null,
      failureFingerprint: null,
    };
  }

  const parsed = parseJudgeVerdictPayload(job.judgeVerdict);
  const mappedOutcome = mapVerdictToOutcome(parsed?.verdict ?? null);

  if (!parsed || !mappedOutcome || parsed.confidence === null) {
    return {
      outcome: 'inconclusive',
      badge: formatJudgeBadge('inconclusive', null),
      confidence: null,
      reason: parsed?.reason ?? null,
      verdict: parsed?.verdict ?? null,
      gaps: parsed?.gaps ?? null,
      retryRecommendation: parsed?.retryRecommendation ?? null,
      retryHint: parsed?.retryHint ?? null,
      failureFingerprint: parsed?.failureFingerprint ?? null,
    };
  }

  return {
    outcome: mappedOutcome,
    badge: formatJudgeBadge(mappedOutcome, parsed.confidence),
    confidence: parsed.confidence,
    reason: parsed.reason,
    verdict: parsed.verdict,
    gaps: parsed.gaps,
    retryRecommendation: parsed.retryRecommendation,
    retryHint: parsed.retryHint,
    failureFingerprint: parsed.failureFingerprint,
  };
}
