/**
 * MobileStepDrawer — bottom-sheet step navigation for mobile viewports.
 *
 * Shows a scrollable list of step groups with step index, semantic icon,
 * command label, status badge, duration, and subsession fork count.
 * Tapping a step dismisses the drawer and scrolls the content pane
 * to that step via the onStepTap callback.
 */

import { useMemo, useState } from 'react'
import type { StepTimelineGroup, JobStepSummary } from '@pilot/core/types.js'
import {
  Sheet,
  SheetTrigger,
  SheetPopup as SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPanel,
} from '~/components/ui/sheet'
import { Badge } from '~/components/ui/badge'
import { resolveSemanticType, SEMANTIC_TYPE_CONFIG, formatStepLabel } from '~/lib/step-semantics'
import { formatCompactDuration } from '~/lib/format'
import { GitFork } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────

function stepStatusVariant(status: string) {
  switch (status) {
    case 'running':
      return 'info' as const
    case 'completed':
    case 'done':
      return 'success' as const
    case 'failed':
      return 'destructive' as const
    case 'pending':
      return 'warning' as const
    default:
      return 'outline' as const
  }
}

// ── Component ─────────────────────────────────────────────────────────────

interface MobileStepDrawerProps {
  groups: StepTimelineGroup[]
  steps: JobStepSummary[]
  onStepTap: (stepIndex: number) => void
  trigger: React.ReactNode
}

export function MobileStepDrawer({
  groups,
  steps,
  onStepTap,
  trigger,
}: MobileStepDrawerProps) {
  const [open, setOpen] = useState(false)

  const stepGroups = groups.filter((g) => g.stepIndex !== null)

  // Build stepMap for metadata lookup (duration, etc.)
  const stepMap = useMemo(() => {
    const map = new Map<number, JobStepSummary>()
    for (const s of steps) map.set(s.stepIndex, s)
    return map
  }, [steps])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Steps</SheetTitle>
          <SheetDescription>
            {stepGroups.length === 0
              ? 'No steps recorded'
              : `${stepGroups.length} step${stepGroups.length !== 1 ? 's' : ''}`}
          </SheetDescription>
        </SheetHeader>

        <SheetPanel>
          {stepGroups.length === 0 ? (
            <div className="space-y-2 py-4">
              <p className="text-sm font-medium text-foreground/80">No steps yet</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Steps will appear here as the job progresses. This job hasn&apos;t started processing.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-dashed divide-border">
              {stepGroups.map((group) => {
                const semanticType = resolveSemanticType(group)
                const config = SEMANTIC_TYPE_CONFIG[semanticType]
                const StepIcon = config.icon
                const commandLabel = formatStepLabel(group)
                const stepMeta = group.stepIndex != null ? stepMap.get(group.stepIndex) : null
                const isRunning = group.status === 'running'

                // Count fork-card items for subsession indicator
                const forkCount = group.items.filter((i) => i.kind === 'fork-card').length

                return (
                  <button
                    key={`drawer-step-${group.stepIndex}`}
                    className={[
                      'w-full min-h-[44px] flex items-start gap-2 px-3 py-2 text-left transition-colors',
                      isRunning
                        ? 'border-l-2 border-sky-400 bg-sky-500/5 hover:bg-sky-500/10'
                        : 'hover:bg-muted/50',
                    ].join(' ')}
                    onClick={() => {
                      if (group.stepIndex != null) {
                        onStepTap(group.stepIndex)
                        setOpen(false)
                      }
                    }}
                  >
                    {/* Left column: step index */}
                    <span className="w-5 shrink-0 pt-0.5 text-xs font-mono tabular-nums text-muted-foreground">
                      {group.stepIndex}
                    </span>

                    {/* Center column: icon + label, status */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {/* Row 1: icon + command label */}
                      <div className="flex items-center gap-1.5">
                        <StepIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-mono leading-tight truncate">
                          {commandLabel}
                        </span>
                      </div>
                      {/* Row 2: status badge + optional Live badge */}
                      <div className="flex items-center gap-1">
                        <Badge variant={stepStatusVariant(group.status)} size="sm">
                          {group.status}
                        </Badge>
                        {isRunning && (
                          <Badge variant="info" size="sm">
                            Live
                          </Badge>
                        )}
                      </div>
                      {/* Row 3: subsession fork indicator */}
                      {forkCount > 0 && (
                        <div className="text-[10px] text-muted-foreground ml-7 flex items-center gap-1">
                          <GitFork className="h-2.5 w-2.5" />
                          <span>
                            {forkCount} session{forkCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right column: duration */}
                    <span className="shrink-0 text-[10px] font-mono text-muted-foreground tabular-nums pt-0.5">
                      {stepMeta?.durationMs != null
                        ? formatCompactDuration(stepMeta.durationMs)
                        : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </SheetPanel>
      </SheetContent>
    </Sheet>
  )
}
