/**
 * ObservabilityCard — compact left-pane card showing token breakdown,
 * per-model usage, cost estimate, and requested vs observed model info.
 *
 * Fetches data via getJobObservabilityFn and renders inline within
 * the step timeline sidebar. Skeleton loading while data is in flight.
 */

import { useQuery } from '@tanstack/react-query'
import { getJobObservabilityFn } from '~/lib/server-fns'
import { formatTokens, formatCost } from '~/lib/format'
import { TokenBar, CostDot } from '~/components/ui/sparkline'
import { Badge } from '~/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipPopup, TooltipProvider } from '~/components/ui/tooltip'

// ── Skeleton ──────────────────────────────────────────────────────────────

function ObservabilitySkeleton() {
  return (
    <div className="border-b p-3 space-y-2 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}

// ── Token Row ─────────────────────────────────────────────────────────────

function TokenRow({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  if (value === 0) return null
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="w-12 shrink-0 text-right font-mono tabular-nums">
        {formatTokens(value)}
      </span>
      <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

interface ObservabilityCardProps {
  jobId: string
  isActive: boolean
}

export function ObservabilityCard({ jobId, isActive }: ObservabilityCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['job-observability', jobId],
    queryFn: () => getJobObservabilityFn({ data: jobId }),
    refetchInterval: isActive ? 5000 : false,
  })

  if (isLoading) return <ObservabilitySkeleton />
  if (!data) return null

  const { tokens, cost, requested, observed } = data
  const totals = tokens.totals

  // Per-model breakdown
  const modelEntries = Object.entries(tokens.byModel)

  return (
    <div className="border-b p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Observability
      </p>

      {/* Token breakdown */}
      {totals && (
        <div className="space-y-1">
          <TokenRow label="Input" value={totals.input} total={totals.total} color="bg-sky-400/70" />
          <TokenRow label="Output" value={totals.output} total={totals.total} color="bg-emerald-400/70" />
          <TokenRow label="Reasoning" value={totals.reasoning} total={totals.total} color="bg-violet-400/70" />
          <TokenRow label="Cache R" value={totals.cacheRead} total={totals.total} color="bg-amber-400/50" />
          <TokenRow label="Cache W" value={totals.cacheWrite} total={totals.total} color="bg-orange-400/50" />

          <div className="flex items-center gap-2 text-[11px] pt-0.5 border-t border-zinc-800">
            <span className="w-16 shrink-0 font-medium text-foreground">Total</span>
            <span className="w-12 shrink-0 text-right font-mono tabular-nums font-medium">
              {formatTokens(totals.total)}
            </span>
            <TokenBar input={totals.input} output={totals.output} reasoning={totals.reasoning} />
          </div>
        </div>
      )}

      {/* Per-model breakdown */}
      {modelEntries.length > 0 && (
        <div className="space-y-1">
          {modelEntries.map(([model, usage]) => (
            <div key={model} className="flex items-center gap-1.5 text-[10px]">
              <Badge variant="outline" size="sm" className="max-w-[140px] truncate font-mono text-[10px]">
                {model}
              </Badge>
              <span className="font-mono tabular-nums text-muted-foreground">
                {formatTokens(usage.total)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Cost estimate */}
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Est. cost</span>
        <span className="font-mono tabular-nums font-medium">{formatCost(cost.estimatedUsd)}</span>
        <CostDot usd={cost.estimatedUsd} />
        {/* Per-model costs in tooltip */}
        {cost.byModel.length > 1 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-[10px] text-muted-foreground underline decoration-dotted cursor-help">
                breakdown
              </TooltipTrigger>
              <TooltipPopup className="max-w-[240px]">
                <div className="space-y-0.5 p-1">
                  {cost.byModel.map((m) => (
                    <div key={m.model} className="flex justify-between gap-3 text-[10px]">
                      <span className="truncate font-mono">{m.model}</span>
                      <span className="font-mono tabular-nums">{formatCost(m.estimatedUsd)}</span>
                    </div>
                  ))}
                </div>
              </TooltipPopup>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Requested vs Observed */}
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        <span>{requested.modelProfile}</span>
        <span className="text-zinc-600">→</span>
        {observed.models.length > 0 ? (
          observed.models.map((m) => (
            <Badge key={m} variant="outline" size="sm" className="font-mono text-[9px]">
              {m.split('/').pop()}
            </Badge>
          ))
        ) : (
          <span className="italic">no data</span>
        )}
      </div>
    </div>
  )
}
