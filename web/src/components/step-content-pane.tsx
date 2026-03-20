/**
 * Content pane for the split-pane job detail view.
 *
 * Shows the selected step's full activity stream. Uses @tanstack/react-virtual
 * for virtualization when item count exceeds VIRTUALIZE_THRESHOLD (200).
 * Auto-scrolls to bottom for running jobs when autoFollow=true.
 */

import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StepTimelineGroup, StepTimelineItem } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { TimelineItemRenderer } from '~/components/timeline-stream'

/** Minimum item count before virtual scrolling is activated. */
const VIRTUALIZE_THRESHOLD = 200

export interface StepContentPaneProps {
  groups: StepTimelineGroup[]
  selectedStep: number | null
  jobId: string
  autoFollow: boolean
  onFollowToggle: () => void
}

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
      return 'secondary' as const
  }
}

/**
 * Virtual scrolling content pane. When items ≥ VIRTUALIZE_THRESHOLD it uses
 * @tanstack/react-virtual for performance; below that it renders directly.
 */
export function StepContentPane({
  groups,
  selectedStep,
  jobId,
  autoFollow,
  onFollowToggle,
}: StepContentPaneProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Flatten items: show selected step's items, or all items if no step selected
  const items: StepTimelineItem[] = selectedStep === null
    ? groups.flatMap((g) => g.items)
    : (groups.find((g) => g.stepIndex === selectedStep)?.items ?? [])

  const selectedGroup = selectedStep !== null
    ? groups.find((g) => g.stepIndex === selectedStep)
    : null

  const useVirtual = items.length >= VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 20,
  })

  // Auto-scroll to bottom on every data change when following is active
  useEffect(() => {
    if (!autoFollow || items.length === 0) return
    if (useVirtual) {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
    } else if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight
    }
  }, [autoFollow, items.length, useVirtual, virtualizer])

  // ── Empty state ──────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No timeline activity yet — waiting for job to run.
      </div>
    )
  }

  if (selectedStep !== null && items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No activity recorded for this step.
      </div>
    )
  }

  // ── Step header when a specific step is selected ─────────────────────────

  const stepHeader = selectedGroup ? (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <Badge variant="secondary">
        {selectedGroup.stepIndex === null ? 'Unattributed' : `Step ${selectedGroup.stepIndex}`}
      </Badge>
      <Badge variant={stepStatusVariant(selectedGroup.status)} size="sm">
        {selectedGroup.status}
      </Badge>
      <span className="truncate text-sm text-muted-foreground">
        {selectedGroup.command}
      </span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        {items.length} item{items.length !== 1 ? 's' : ''}
        {useVirtual ? ' (virtualized)' : ''}
      </span>
    </div>
  ) : (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <span className="text-sm font-medium">All steps</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {items.length} item{items.length !== 1 ? 's' : ''}
        {useVirtual ? ' (virtualized)' : ''}
      </span>
    </div>
  )

  // ── Content ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {stepHeader}

      <div className="relative min-h-0 flex-1">
        <div ref={parentRef} className="h-full overflow-auto">
          {useVirtual ? (
            /* Virtualized rendering for large item counts */
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = items[virtualRow.index]
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="border-b border-border/30 px-4"
                  >
                    <TimelineItemRenderer item={item} jobId={jobId} />
                  </div>
                )
              })}
            </div>
          ) : (
            /* Direct rendering for small item counts */
            selectedStep === null ? (
              /* Overview: show all groups with separators */
              <div className="space-y-0">
                {groups.map((group, gIdx) => (
                  <div key={group.stepIndex ?? 'unattributed'}>
                    {gIdx > 0 && <Separator className="my-2" />}
                    <div className="px-4">
                      <div className="flex items-center gap-2 py-1.5">
                        <Badge variant="secondary" size="sm">
                          {group.stepIndex === null ? 'Unattributed' : `Step ${group.stepIndex}`}
                        </Badge>
                        <Badge variant={stepStatusVariant(group.status)} size="sm">
                          {group.status}
                        </Badge>
                        <span className="truncate text-xs text-muted-foreground">
                          {group.command}
                        </span>
                      </div>
                      <div className="space-y-0.5 border-l-2 border-border/40 pl-3">
                        {group.items.map((item, idx) => {
                          const key = item.kind === 'fork-card'
                            ? `fork-${item.sessionId}-${item.createdAt}-${idx}`
                            : `${item.kind}-${item.partId}-${item.createdAt}-${idx}`
                          return (
                            <div key={key}>
                              <TimelineItemRenderer item={item} jobId={jobId} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Single step: render its items directly */
              <div className="space-y-0.5 px-4 py-2">
                {items.map((item, idx) => {
                  const key = item.kind === 'fork-card'
                    ? `fork-${item.sessionId}-${item.createdAt}-${idx}`
                    : `${item.kind}-${item.partId}-${item.createdAt}-${idx}`
                  return (
                    <div key={key} className="border-b border-border/20">
                      <TimelineItemRenderer item={item} jobId={jobId} />
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        {/* Follow button — shown when not auto-following */}
        {!autoFollow && (
          <div className="pointer-events-none absolute bottom-4 right-4">
            <Button
              variant="secondary"
              size="sm"
              className="pointer-events-auto shadow-md"
              onClick={onFollowToggle}
            >
              ↓ Follow
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
