/**
 * SummaryOverlay — toggleable sheet showing per-step verdict summaries.
 *
 * Provides quick access to step-level verdict reasons without leaving the
 * main activity/timeline view. Replaces the Summary tab in the old tab bar.
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { StepTimelineGroup } from '@pilot/core/types.js'
import { useIsMobile } from '~/hooks/use-media-query'
import { getFullJobTimelineFn } from '~/lib/server-fns'
import { formatStepLabel } from '~/lib/step-semantics'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetPanel,
} from '~/components/ui/sheet'
import { Badge } from '~/components/ui/badge'

// ── Types ─────────────────────────────────────────────────────────────────

interface SummaryOverlayProps {
  jobId: string
  trigger: React.ReactNode
}

// ── Component ─────────────────────────────────────────────────────────────

export function SummaryOverlay({ jobId, trigger }: SummaryOverlayProps) {
  const isMobile = useIsMobile()

  // Re-use the cached timeline query — no extra request if parent already fetched it
  const { data: timelineData } = useQuery({
    queryKey: ['job-timeline-full', jobId],
    queryFn: () => getFullJobTimelineFn({ data: jobId }),
  })

  const groups: StepTimelineGroup[] = timelineData?.groups ?? []

  // Only show steps that have a verdictReason (judge summary content)
  const summaryGroups = groups.filter((g) => g.verdictReason)

  return (
    <Sheet>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side={isMobile ? 'bottom' : 'right'}>
        <SheetHeader>
          <SheetTitle>Job Summary</SheetTitle>
        </SheetHeader>

        <SheetPanel>
          {summaryGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No summary available yet.
            </p>
          ) : (
            <div className="space-y-5">
              {summaryGroups.map((group) => {
                const label = formatStepLabel(group)
                const statusVariant =
                  group.status === 'completed' || group.status === 'done'
                    ? ('success' as const)
                    : group.status === 'failed'
                      ? ('destructive' as const)
                      : ('secondary' as const)

                return (
                  <div
                    key={`summary-${group.stepIndex}`}
                    className="space-y-1.5"
                  >
                    {/* Step label row */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-muted-foreground">
                        #{group.stepIndex}
                      </span>
                      <Badge variant="secondary" size="sm">
                        {label}
                      </Badge>
                      <Badge variant={statusVariant} size="sm">
                        {group.status}
                      </Badge>
                    </div>

                    {/* Verdict reason text */}
                    <p className="text-sm leading-snug text-foreground/90">
                      {group.verdictReason}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </SheetPanel>
      </SheetContent>
    </Sheet>
  )
}
