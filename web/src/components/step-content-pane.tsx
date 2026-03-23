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

import { useRef, useEffect, useCallback, useMemo, type MutableRefObject, useState, type UIEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StepTimelineGroup, StepTimelineItem, JobStepSummary } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { SourceBadge } from '~/components/ui/status-badge'
import { ToolSummaryChips } from '~/components/tool-summary-chips'
import { formatCompactDuration } from '~/lib/format'
import { formatStepLabel, formatStepDescription, stepSemanticClass, isContinuationStep, isJudgeStep, synthesizeHeaderFields, resolveSemanticType, getSemanticIcon, getSemanticColors, SEMANTIC_TYPE_CONFIG } from '~/lib/step-semantics'
import { TimelineItemRenderer } from '~/components/timeline-stream'
import { FollowModeBar } from '~/components/follow-mode-bar'

/** Minimum item count before virtual scrolling is activated. */
const VIRTUALIZE_THRESHOLD = 200

/**
 * Cumulative upward-scroll pixels before Follow mode auto-cancels.
 * 80px ≈ 5-8mm — distinguishes intentional upward scroll from
 * incidental touch drift on mobile.
 */
const CANCEL_THRESHOLD = 80

export interface StepContentPaneProps {
  groups: StepTimelineGroup[]
  jobId: string
  autoFollow: boolean
  onFollowToggle: () => void
  /** Called when user deliberately scrolls upward (cancels follow mode). */
  onFollowCancel?: () => void
  /** Whether the job is currently active/running — controls FollowModeBar visibility. */
  isActive?: boolean
  /** Ref that the parent sets; content pane registers its scrollTo function here. */
  scrollToStepRef: MutableRefObject<((idx: number) => void) | null>
  /** Callback when the visible step changes (scroll-spy). */
  onVisibleStepChange: (idx: number | null) => void
  /** Optional step summaries for enriched headers (source, reason, error, duration). */
  steps?: JobStepSummary[]
  /** When true, hide the "All steps" header bar (used on mobile to save vertical space). */
  hideHeader?: boolean
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

/** Returns the colored bottom border class for a step group header based on semantic type. */
function stepHeaderBorderClass(group: StepTimelineGroup): string {
  const { borderClass } = getSemanticColors(group)
  return `border-b-2 ${borderClass}`
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
  onFollowCancel,
  isActive,
  scrollToStepRef,
  onVisibleStepChange,
  steps,
  hideHeader = false,
}: StepContentPaneProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // ── Scroll-direction detection for follow-mode auto-cancel ────────────────
  const lastScrollTopRef = useRef(0)
  const consecutiveUpScrollRef = useRef(0)

  // All items flattened (for virtualization threshold check)
  const allItems: StepTimelineItem[] = groups.flatMap((g) => g.items)
  const useVirtual = allItems.length >= VIRTUALIZE_THRESHOLD

  // ── New-activity highlight tracking ──────────────────────────────────
  const prevItemCountRef = useRef(0)
  const [newItemStart, setNewItemStart] = useState<number>(allItems.length)

  useEffect(() => {
    if (allItems.length > prevItemCountRef.current && prevItemCountRef.current > 0) {
      setNewItemStart(prevItemCountRef.current)
      // Clear the highlight class after animation completes (1.5s)
      const timer = setTimeout(() => setNewItemStart(allItems.length), 1500)
      prevItemCountRef.current = allItems.length
      return () => clearTimeout(timer)
    }
    prevItemCountRef.current = allItems.length
  }, [allItems.length])

  // Reset consecutive-scroll counter when follow mode is re-enabled
  useEffect(() => {
    if (autoFollow) {
      consecutiveUpScrollRef.current = 0
    }
  }, [autoFollow])

  // Scroll handler — detects deliberate upward scroll to auto-cancel follow mode
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const scrollTop = el.scrollTop
    const delta = scrollTop - lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop

    if (delta < 0) {
      // Scrolling up — accumulate upward movement
      consecutiveUpScrollRef.current += Math.abs(delta)
      if (consecutiveUpScrollRef.current > CANCEL_THRESHOLD && autoFollow) {
        onFollowCancel?.()
        consecutiveUpScrollRef.current = 0
      }
    } else {
      // Scrolling down or no movement — reset accumulator
      consecutiveUpScrollRef.current = 0
    }
  }, [autoFollow, onFollowCancel])

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
      parentRef.current.scrollTo({ top: parentRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [autoFollow, allItems.length, useVirtual, virtualizer])

  // ── Empty state ──────────────────────────────────────────────────────────

  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No timeline data available. This may indicate the job&apos;s sessions could not be resolved.
      </div>
    )
  }

  // ── Jump to first error ──────────────────────────────────────────────────

  const firstErrorGroup = useMemo(
    () => groups.find((g) => g.status === 'failed'),
    [groups],
  )

  const handleJumpToError = useCallback(() => {
    if (firstErrorGroup?.stepIndex != null) {
      scrollToStep(firstErrorGroup.stepIndex)
    }
  }, [firstErrorGroup, scrollToStep])

  // ── Header ──────────────────────────────────────────────────────────────

  const header = hideHeader ? null : (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <span className="text-sm font-medium">All steps</span>
      {firstErrorGroup && (
        <Button
          variant="destructive"
          size="sm"
          className="text-xs"
          onClick={handleJumpToError}
        >
          Jump to error
        </Button>
      )}
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
          <div ref={parentRef} className="h-full overflow-auto" onScroll={handleScroll}>
          {useVirtual ? (
            /* Virtualized rendering for large item counts */
            <>
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
              <FollowModeBar visible={!autoFollow && !!isActive} onFollow={onFollowToggle} />
            </>
          ) : (
            /* Continuous scroll: all groups rendered as sections */
            <div className="space-y-0">
              {(() => {
                let runningIndex = 0
                return groups.map((group) => {
                  // Look up step metadata for enriched header
                  const stepMeta = steps?.find((s) => s.stepIndex === group.stepIndex)
                  const groupStartIndex = runningIndex
                  runningIndex += group.items.length
                  return (
                    <section
                      key={group.stepIndex ?? 'unattributed'}
                      id={`step-section-${group.stepIndex}`}
                      data-step-index={group.stepIndex}
                    >
                      {(() => {
                        const synth = synthesizeHeaderFields(group)
                        const semanticType = resolveSemanticType(group)
                        const config = SEMANTIC_TYPE_CONFIG[semanticType]
                        const Icon = config.icon
                        const { bgClass, borderClass } = getSemanticColors(group)
                        return (
                          <div className={[
                            'sticky top-0 backdrop-blur z-30 px-3 py-2.5 space-y-1',
                            bgClass,
                            `border-b-2 ${borderClass}`,
                            synth.isActive ? 'border-l-[3px] border-l-sky-500' : '',
                          ].filter(Boolean).join(' ')}>
                            {/* Row 1: Semantic icon + label + status + active pulse + model + duration + summary link */}
                            <div className="flex flex-wrap items-center gap-2">
                              {synth.isActive && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
                              )}
                              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <Badge variant="secondary" size="sm" className="font-semibold">
                                {group.semanticLabel || config.label}
                              </Badge>
                              {config.isGap && (
                                <Badge variant="outline" size="sm" className="text-[10px] text-amber-500 border-amber-500/30 px-1">
                                  Gap
                                </Badge>
                              )}
                              {group.stepIndex !== null && group.stepIndex >= 0 && (
                                <span className="text-[10px] font-mono text-muted-foreground/60">
                                  #{group.stepIndex}
                                </span>
                              )}
                              <Badge variant={stepStatusVariant(group.status)} size="sm">
                                {group.status}
                              </Badge>
                              {synth.model && (
                                <Badge variant="outline" size="sm" className="font-mono text-[10px] max-w-[160px] truncate">
                                  {synth.model}
                                </Badge>
                              )}
                              {stepMeta?.durationMs != null && (
                                <span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums">
                                  {formatCompactDuration(stepMeta.durationMs)}
                                </span>
                              )}
                              {synth.hasSummary && (
                                <button
                                  className="ml-auto text-[10px] text-amber-400/80 hover:text-amber-400 underline-offset-2 hover:underline transition-colors"
                                  onClick={() => {
                                    const el = document.getElementById(`step-${group.stepIndex}-summary`)
                                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                  }}
                                >
                                  View Summary ↓
                                </button>
                              )}
                            </div>
                            {/* Row 2: Stage context + continuation reason + status counters + tool chips */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              {synth.stage && (
                                <span className="text-[10px] text-muted-foreground/70">
                                  {synth.stage}
                                </span>
                              )}
                              {synth.continuationReason && (
                                <span className="text-[10px] text-amber-400/70 italic">
                                  {synth.continuationReason}
                                </span>
                              )}
                              {synth.statusCounters && (
                                <span className="text-[10px] font-mono text-muted-foreground/60">
                                  {synth.statusCounters.done}/{synth.statusCounters.total} sessions
                                </span>
                              )}
                              {stepMeta?.reason && (
                                <span className="text-[10px] text-muted-foreground/60 italic truncate max-w-[260px]">
                                  {stepMeta.reason}
                                </span>
                              )}
                              <ToolSummaryChips items={group.items} />
                            </div>
                            {/* Error alert (if present) */}
                            {stepMeta?.error && (
                              <div className="text-rose-400 bg-rose-500/10 px-2 py-1 rounded text-xs leading-tight line-clamp-3">
                                {stepMeta.error}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {/* Judge verdict summary card — deep-link target */}
                      {isJudgeStep(group) && group.verdictReason && (
                        <div
                          id={`step-${group.stepIndex}-summary`}
                          className={[
                            'mx-4 my-2 rounded-md border px-3 py-2 space-y-1',
                            group.status === 'completed' || group.status === 'done'
                              ? 'border-green-500/30 bg-green-500/5 border-l-2 border-l-green-500'
                              : group.status === 'failed'
                                ? 'border-red-500/30 bg-red-500/5 border-l-2 border-l-red-500'
                                : 'border-amber-500/30 bg-amber-500/5 border-l-2 border-l-amber-500',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                              Verdict
                            </span>
                            <Badge variant={
                              group.status === 'completed' || group.status === 'done' ? 'success' :
                              group.status === 'failed' ? 'destructive' : 'warning'
                            } size="sm">
                              {group.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {group.verdictReason}
                          </p>
                        </div>
                      )}
                      <div className={[
                        'space-y-0.5 border-l-2 pl-2 ml-2 sm:pl-3 sm:ml-4 max-w-full overflow-hidden',
                        getSemanticColors(group).borderClass,
                      ].join(' ')}>
                        {group.items.map((item, idx) => {
                          const globalIdx = groupStartIndex + idx
                          const isNew = globalIdx >= newItemStart && newItemStart < allItems.length
                          const key = item.kind === 'fork-card'
                            ? `fork-${item.sessionId}-${item.createdAt}-${idx}`
                            : `${item.kind}-${(item as { partId: string }).partId}-${item.createdAt}-${idx}`
                          return (
                            <div key={key} className={isNew ? 'animate-highlight-fade' : ''}>
                              <TimelineItemRenderer item={item} jobId={jobId} />
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })
              })()}
              <FollowModeBar visible={!autoFollow && !!isActive} onFollow={onFollowToggle} />
            </div>
          )}
        </div>

        {/* Floating buttons — jump to error (when header hidden) */}
        {hideHeader && firstErrorGroup && (
          <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col gap-2 items-end">
            <Button
              variant="destructive"
              size="sm"
              className="pointer-events-auto shadow-md text-xs"
              onClick={handleJumpToError}
            >
              ↑ Error
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
