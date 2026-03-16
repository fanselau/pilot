import type { Job } from './types.js';

export type JudgeSignalOutcome = 'none' | 'pass' | 'fail' | 'partial' | 'doubt' | 'inconclusive';

type JudgeVerdictValue = 'succeeded' | 'failed' | 'doubting' | 'pass' | 'fail' | 'partial';

interface ParsedJudgeVerdictPayload {
  verdict: string | null;
  confidence: number | null;
  reason: string | null;
  retryRecommendation: string | null;  // 'retry-resume' | 'retry-full' | 'none'
  retryHint: string | null;
  failureFingerprint: string[] | null;
}

export interface JudgeSignal {
  outcome: JudgeSignalOutcome;
  badge: string;
  confidence: number | null;
  reason: string | null;
  verdict: string | null;
  retryRecommendation: string | null;
  retryHint: string | null;
  failureFingerprint: string[] | null;
}

const VERDICT_TO_OUTCOME: Record<JudgeVerdictValue, Exclude<JudgeSignalOutcome, 'none' | 'inconclusive'>> = {
  succeeded: 'pass',
  failed: 'fail',
  doubting: 'doubt',
  pass: 'pass',
  fail: 'fail',
  partial: 'partial',
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
    retryRecommendation: parsed.retryRecommendation,
    retryHint: parsed.retryHint,
    failureFingerprint: parsed.failureFingerprint,
  };
}
