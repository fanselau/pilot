/**
 * Content pane for the split-pane job detail view.
 *
 * Always renders ALL step groups in a continuous scroll. The sidebar drives
 * navigation via scrollIntoView, and an IntersectionObserver reports which
 * step section is currently visible (scroll-spy).
 *
 * Uses @tanstack/react-virtual for virtualization when total item count
 * exceeds VIRTUALIZE_THRESHOLD (200).
 * Auto-scrolls to bottom for running jobs when autoFollow=true.
 */

import { useRef, useEffect, useCallback, type MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StepTimelineGroup, StepTimelineItem } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { TimelineItemRenderer } from '~/components/timeline-stream'

/** Minimum item count before virtual scrolling is activated. */
const VIRTUALIZE_THRESHOLD = 200

export interface StepContentPaneProps {
  groups: StepTimelineGroup[]
  jobId: string
  autoFollow: boolean
  onFollowToggle: () => void
  /** Ref that the parent sets; content pane registers its scrollTo function here. */
  scrollToStepRef: MutableRefObject<((idx: number) => void) | null>
  /** Callback when the visible step changes (scroll-spy). */
  onVisibleStepChange: (idx: number | null) => void
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
 * Continuous-scroll content pane with scroll-spy.
 * All groups are always rendered. Sidebar clicks trigger scrollIntoView.
 */
export function StepContentPane({
  groups,
  jobId,
  autoFollow,
  onFollowToggle,
  scrollToStepRef,
  onVisibleStepChange,
}: StepContentPaneProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // All items flattened (for virtualization threshold check)
  const allItems: StepTimelineItem[] = groups.flatMap((g) => g.items)
  const useVirtual = allItems.length >= VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 20,
  })

  // ── ScrollTo registration ───────────────────────────────────────────────

  const scrollToStep = useCallback((stepIndex: number) => {
    const el = document.getElementById(`step-section-${stepIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  useEffect(() => {
    scrollToStepRef.current = scrollToStep
    return () => {
      scrollToStepRef.current = null
    }
  }, [scrollToStep, scrollToStepRef])

  // ── Scroll-spy via IntersectionObserver ──────────────────────────────────

  useEffect(() => {
    if (useVirtual) return // Skip scroll-spy in virtualized mode

    const container = parentRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost intersecting section
        let topEntry: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
            topEntry = entry
          }
        }
        if (topEntry) {
          const stepAttr = (topEntry.target as HTMLElement).dataset.stepIndex
          if (stepAttr != null) {
            onVisibleStepChange(Number(stepAttr))
          }
        }
      },
      {
        root: container,
        rootMargin: '-10% 0px -70% 0px',
        threshold: 0,
      },
    )

    const sections = container.querySelectorAll<HTMLElement>('[data-step-index]')
    sections.forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [groups, useVirtual, onVisibleStepChange])

  // ── Auto-follow for running jobs ────────────────────────────────────────

  useEffect(() => {
    if (!autoFollow || allItems.length === 0) return
    if (useVirtual) {
      virtualizer.scrollToIndex(allItems.length - 1, { align: 'end' })
    } else if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight
    }
  }, [autoFollow, allItems.length, useVirtual, virtualizer])

  // ── Empty state ──────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No timeline activity yet — waiting for job to run.
      </div>
    )
  }

  // ── Header ──────────────────────────────────────────────────────────────

  const header = (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <span className="text-sm font-medium">All steps</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {allItems.length} item{allItems.length !== 1 ? 's' : ''}
        {useVirtual ? ' (virtualized)' : ''}
      </span>
    </div>
  )

  // ── Content ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {header}

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
                const item = allItems[virtualRow.index]
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
            /* Continuous scroll: all groups rendered as sections */
            <div className="space-y-0">
              {groups.map((group) => (
                <section
                  key={group.stepIndex ?? 'unattributed'}
                  id={`step-section-${group.stepIndex}`}
                  data-step-index={group.stepIndex}
                >
                  <div className="flex items-center gap-2 py-2 px-4 sticky top-0 bg-background/95 backdrop-blur z-10 border-b">
                    <Badge variant="secondary" size="sm">
                      {group.command === 'delegation'
                        ? 'Delegation'
                        : group.stepIndex === null
                          ? 'Unattributed'
                          : `Step ${group.stepIndex}`}
                    </Badge>
                    <Badge variant={stepStatusVariant(group.status)} size="sm">
                      {group.status}
                    </Badge>
                    <span className="truncate text-xs text-muted-foreground">
                      {group.command}
                    </span>
                  </div>
                  <div className="space-y-0.5 border-l-2 border-border/40 pl-3 ml-4">
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
                </section>
              ))}
            </div>
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
