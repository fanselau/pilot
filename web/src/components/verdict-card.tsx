/**
 * VerdictCard — compact left-pane card showing judge verdict,
 * confidence bar, reason text, gap list, and verdict history.
 *
 * Fetches data via getJobVerdictFn and getJobVerdictHistoryFn.
 * Gaps are shown in a collapsible section to save vertical space.
 */

import { useQuery } from '@tanstack/react-query'
import { getJobVerdictFn, getJobVerdictHistoryFn } from '~/lib/server-fns'
import { VerdictBadge } from '~/components/ui/status-badge'
import { Badge } from '~/components/ui/badge'
import { Progress, ProgressTrack, ProgressIndicator } from '~/components/ui/progress'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/collapsible'

// ── Types ─────────────────────────────────────────────────────────────────

interface ParsedVerdict {
  verdict: string
  confidence: number
  reason: string
  gaps?: string[]
  retryRecommendation?: string
}

// ── Component ─────────────────────────────────────────────────────────────

interface VerdictCardProps {
  jobId: string
}

export function VerdictCard({ jobId }: VerdictCardProps) {
  const { data: rawVerdict } = useQuery({
    queryKey: ['job-verdict', jobId],
    queryFn: () => getJobVerdictFn({ data: jobId }),
  })

  const { data: history } = useQuery({
    queryKey: ['job-verdict-history', jobId],
    queryFn: () => getJobVerdictHistoryFn({ data: jobId }),
  })

  // No verdict data at all — hide the card
  if (!rawVerdict) return null

  const verdict = rawVerdict as ParsedVerdict
  const hasGaps = verdict.gaps && verdict.gaps.length > 0
  const hasHistory = history && history.length > 1

  // Confidence as 0–100 for the progress bar
  const confidencePct = typeof verdict.confidence === 'number'
    ? Math.round(verdict.confidence * (verdict.confidence <= 1 ? 100 : 1))
    : null

  return (
    <div className="border-b p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Judge Verdict
      </p>

      {/* Verdict badge + confidence */}
      <div className="flex items-center gap-2">
        <VerdictBadge verdict={verdict.verdict} />
        {confidencePct !== null && (
          <div className="flex-1 flex items-center gap-1.5">
            <Progress value={confidencePct} className="flex-1">
              <ProgressTrack className="h-1.5">
                <ProgressIndicator
                  className={
                    confidencePct >= 80 ? 'bg-emerald-400' :
                    confidencePct >= 50 ? 'bg-amber-400' :
                    'bg-rose-400'
                  }
                />
              </ProgressTrack>
            </Progress>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
              {confidencePct}%
            </span>
          </div>
        )}
      </div>

      {/* Reason text */}
      {verdict.reason && (
        <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
          {verdict.reason}
        </p>
      )}

      {/* Gap list — collapsible */}
      {hasGaps && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform [[data-panel-open]_&]:rotate-90">
              <path d="M6 4l4 4-4 4" />
            </svg>
            {verdict.gaps!.length} gap{verdict.gaps!.length > 1 ? 's' : ''} found
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 space-y-0.5 pl-3">
              {verdict.gaps!.map((gap, i) => (
                <li key={i} className="text-[10px] text-muted-foreground leading-tight flex gap-1">
                  <span className="text-rose-400 shrink-0">•</span>
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Verdict history progression */}
      {hasHistory && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {history!.map((entry, i) => (
            <span key={entry.stepIndex} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-zinc-600 text-[10px]">→</span>}
              <Badge
                variant={
                  entry.verdict === 'completed' || entry.verdict === 'pass' ? 'success' :
                  entry.verdict === 'failed' || entry.verdict === 'fail' ? 'destructive' :
                  'warning'
                }
                size="sm"
                className="text-[9px]"
              >
                {entry.verdict}
              </Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
