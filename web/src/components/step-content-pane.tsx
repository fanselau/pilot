/**
 * Content pane — flat section-based renderer with nested sticky headers.
 *
 * Renders ALL step groups in a single continuous scroll. Each step has a
 * sticky header; subsessions are visual dividers (not sticky) that can be
 * collapsed. Child session content is server-inlined — no lazy loading.
 *
 * Follow mode uses MutationObserver to track any DOM changes in the scroll
 * container, ensuring it works for child session streaming too.
 */

import { Fragment, useRef, useEffect, useCallback, useMemo, useState, type MutableRefObject } from 'react'
import type { StepTimelineGroup, StepTimelineItem, JobStepSummary, TimelineSection } from '@pilot/core/types.js'
import { ChevronRight } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { ToolSummaryChips } from '~/components/tool-summary-chips'
import { formatCompactDuration } from '~/lib/format'
import {
  isJudgeStep,
  synthesizeHeaderFields,
  resolveSemanticType,
  getSemanticColors,
  SEMANTIC_TYPE_CONFIG,
  deriveBranchIdentity,
  type SemanticSessionType,
} from '~/lib/step-semantics'
import { TimelineItemRenderer } from '~/components/timeline-stream'
import { FollowModeBar } from '~/components/follow-mode-bar'

/** Cumulative upward-scroll px before follow mode auto-cancels. */
const CANCEL_THRESHOLD = 80

/**
 * Normalize a group to always have `sections`.
 * Handles stale React Query cache that may still have old-format `items` field.
 */
function ensureSections(group: StepTimelineGroup): TimelineSection[] {
  if (group.sections && group.sections.length > 0) return group.sections

  // Migration shim: wrap old-format items in a single root section
  const legacyItems = (group as any).items as StepTimelineItem[] | undefined
  if (legacyItems && legacyItems.length > 0) {
    return [{
      sessionId: group.sessionId ?? 'unknown',
      parentSessionId: null,
      title: group.sessionId ?? 'root',
      status: group.status === 'running' ? 'active' : group.status === 'completed' || group.status === 'done' ? 'done' : 'unknown',
      models: [],
      durationMs: null,
      depth: 0,
      items: legacyItems.filter((i: any) => i.kind === 'activity' || i.kind === 'tool-summary'),
    }]
  }

  return []
}

export interface StepContentPaneProps {
  groups: StepTimelineGroup[]
  jobId: string
  autoFollow: boolean
  onFollowToggle: () => void
  onFollowCancel?: () => void
  isActive?: boolean
  scrollToStepRef: MutableRefObject<((idx: number) => void) | null>
  onVisibleStepChange: (idx: number | null) => void
  steps?: JobStepSummary[]
  hideHeader?: boolean
}

function stepStatusVariant(status: string) {
  switch (status) {
    case 'running': return 'info' as const
    case 'completed': case 'done': return 'success' as const
    case 'failed': return 'destructive' as const
    case 'pending': return 'warning' as const
    default: return 'secondary' as const
  }
}

// ── Section header for subsessions ──────────────────────────────────────

function SubsessionHeader({
  section,
  collapsed,
  onToggle,
  subBgClass,
  borderClass,
}: {
  section: TimelineSection
  collapsed: boolean
  onToggle: () => void
  /** Darker bg class from the parent step's semantic config. */
  subBgClass: string
  /** Border class from the parent step — keeps palette consistent. */
  borderClass: string
}) {
  const identity = deriveBranchIdentity(section.title)
  const isActive = section.status === 'active'

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ top: 'var(--step-h, 2.5rem)' }}
      className={[
        'sticky z-20',
        'w-full text-left backdrop-blur-sm px-3 py-1 flex items-center gap-1.5',
        'hover:bg-accent/10 transition-colors',
        `border-b ${borderClass}`,
        subBgClass,
        isActive ? 'border-l-[3px] border-l-sky-500' : `border-l-2 ${borderClass}`,
      ].filter(Boolean).join(' ')}
    >
      <ChevronRight className={`h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      {isActive && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
      )}
      <span className="text-[10px] text-muted-foreground/80 truncate max-w-[200px]">
        {identity.role ?? identity.label}
      </span>
      <Badge variant={section.status === 'active' ? 'info' : section.status === 'done' ? 'success' : 'secondary'} size="sm">
        {section.status}
      </Badge>
      {section.models[0] && (
        <span className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[120px]">
          {section.models[0].split('/').pop()}
        </span>
      )}
      {section.durationMs != null && (
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/50 tabular-nums">
          {formatCompactDuration(section.durationMs)}
        </span>
      )}
    </button>
  )
}

// ── Step group section ──────────────────────────────────────────────────

function StepGroupSection({
  group,
  stepMeta,
  sectionRef,
}: {
  group: StepTimelineGroup
  stepMeta?: JobStepSummary
  sectionRef: (el: HTMLDivElement | null) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const stepHeaderRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const synth = synthesizeHeaderFields(group)
  const semanticType = resolveSemanticType(group)
  const config = SEMANTIC_TYPE_CONFIG[semanticType]
  const Icon = config.icon
  const { bgClass, borderClass } = getSemanticColors(group)

  const sections = ensureSections(group)
  const allItems = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections],
  )

  // Measure step header height → CSS variable for subsession sticky offset
  useEffect(() => {
    const header = stepHeaderRef.current
    const container = groupRef.current
    if (!header || !container) return
    const update = () => container.style.setProperty('--step-h', `${header.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  const toggle = useCallback((sessionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  return (
    <div
      ref={(el) => {
        groupRef.current = el
        sectionRef(el)
      }}
      data-step-index={group.stepIndex}
    >
      {/* Sticky step header */}
      <div ref={stepHeaderRef} className={[
        'sticky top-0 z-30 backdrop-blur px-3 py-2.5 space-y-1',
        bgClass,
        `border-b-2 ${borderClass}`,
        synth.isActive ? 'border-l-[3px] border-l-sky-500' : '',
      ].filter(Boolean).join(' ')}>
        {/* Row 1: icon + label + status + model + duration */}
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
            <Badge variant="outline" size="sm" className="font-mono text-[10px] truncate">
              {synth.model}
            </Badge>
          )}
          {stepMeta?.durationMs != null && (
            <span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums">
              {formatCompactDuration(stepMeta.durationMs)}
            </span>
          )}
        </div>
        {/* Row 2: stage + continuation reason + counters + tools */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {synth.stage && (
            <span className="text-[10px] text-muted-foreground/70">{synth.stage}</span>
          )}
          {synth.continuationReason && (
            <span className="text-[10px] text-amber-400/70 italic">{synth.continuationReason}</span>
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
          <ToolSummaryChips items={allItems} />
        </div>
        {/* Error alert */}
        {stepMeta?.error && (
          <div className="text-rose-400 bg-rose-500/10 px-2 py-1 rounded text-xs leading-tight line-clamp-3">
            {stepMeta.error}
          </div>
        )}
      </div>

      {/* Judge verdict card */}
      {isJudgeStep(group) && group.verdictReason && (
        <div className={[
          'mx-4 my-2 rounded-md border px-3 py-2 space-y-1',
          group.status === 'completed' || group.status === 'done'
            ? 'border-green-500/30 bg-green-500/5 border-l-2 border-l-green-500'
            : group.status === 'failed'
              ? 'border-red-500/30 bg-red-500/5 border-l-2 border-l-red-500'
              : 'border-amber-500/30 bg-amber-500/5 border-l-2 border-l-amber-500',
        ].join(' ')}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Verdict</span>
            <Badge variant={
              group.status === 'completed' || group.status === 'done' ? 'success' :
              group.status === 'failed' ? 'destructive' : 'warning'
            } size="sm">{group.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">{group.verdictReason}</p>
        </div>
      )}

      {/* Find the last assistant message across ALL sections — the summary */}
      {(() => {
        // Build a set of (sectionIdx, itemIdx) for each section's last assistant msg
        // But only the very LAST one across all sections gets the summary treatment
        let lastSectionIdx = -1
        let lastItemIdx = -1
        for (let si = sections.length - 1; si >= 0; si--) {
          const sec = sections[si]
          for (let ii = sec.items.length - 1; ii >= 0; ii--) {
            const it = sec.items[ii]
            if (it.kind === 'activity' && it.role === 'assistant' && !it.isReasoning) {
              lastSectionIdx = si
              lastItemIdx = ii
              break
            }
          }
          if (lastSectionIdx >= 0) break
        }

        return sections.map((section, sectionIdx) => (
          <Fragment key={`${section.sessionId}-${sectionIdx}`}>
            {section.depth > 0 && (
              <SubsessionHeader
                section={section}
                collapsed={collapsed.has(section.sessionId)}
                onToggle={() => toggle(section.sessionId)}
                subBgClass={config.subBgClass}
                borderClass={borderClass}
              />
            )}
            {!collapsed.has(section.sessionId) && (
              <div className={[
                'space-y-1 max-w-full overflow-hidden',
                section.depth > 0 ? `border-l-2 pl-2 ml-2 sm:pl-3 sm:ml-3 ${borderClass}` : 'px-3',
              ].join(' ')}>
                {section.items.map((item, idx) => (
                  <div key={`${item.kind}-${item.partId}-${item.createdAt}`}>
                    <TimelineItemRenderer
                      item={item}
                      isLastMessage={sectionIdx === lastSectionIdx && idx === lastItemIdx}
                      accentClass={config.subBgClass}
                      accentBorder={borderClass}
                    />
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))
      })()}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function StepContentPane({
  groups,
  jobId: _jobId,
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
  const sectionRefs = useRef(new Map<number, HTMLElement>())

  // ── Scroll-direction detection for follow-mode cancel ────────────────
  const lastScrollTopRef = useRef(0)
  const consecutiveUpRef = useRef(0)

  // Reset consecutive-scroll counter when follow mode is re-enabled
  useEffect(() => {
    if (autoFollow) consecutiveUpRef.current = 0
  }, [autoFollow])

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    const scrollTop = el.scrollTop
    const delta = scrollTop - lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop

    if (delta < 0) {
      consecutiveUpRef.current += Math.abs(delta)
      if (consecutiveUpRef.current > CANCEL_THRESHOLD && autoFollow) {
        onFollowCancel?.()
        consecutiveUpRef.current = 0
      }
    } else {
      consecutiveUpRef.current = 0
    }
  }, [autoFollow, onFollowCancel])

  // ── Total item count ────────────────────────────────────────────────
  const totalItems = useMemo(
    () => groups.reduce((sum, g) => sum + ensureSections(g).reduce((s, sec) => s + sec.items.length, 0), 0),
    [groups],
  )

  // ── Error navigation ────────────────────────────────────────────────
  const firstErrorGroup = useMemo(
    () => groups.find((g) => g.status === 'failed'),
    [groups],
  )

  // ── ScrollTo via ref registry ───────────────────────────────────────
  const scrollToStep = useCallback((stepIndex: number) => {
    sectionRefs.current.get(stepIndex)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleJumpToError = useCallback(() => {
    if (firstErrorGroup?.stepIndex != null) scrollToStep(firstErrorGroup.stepIndex)
  }, [firstErrorGroup, scrollToStep])

  useEffect(() => {
    scrollToStepRef.current = scrollToStep
    return () => { scrollToStepRef.current = null }
  }, [scrollToStep, scrollToStepRef])

  // ── Scroll-spy via IntersectionObserver ──────────────────────────────
  useEffect(() => {
    const container = parentRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        let topEntry: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
            topEntry = entry
          }
        }
        if (topEntry) {
          const attr = (topEntry.target as HTMLElement).dataset.stepIndex
          if (attr != null) onVisibleStepChange(Number(attr))
        }
      },
      { root: container, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    )

    const sections = container.querySelectorAll<HTMLElement>('[data-step-index]')
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [groups, onVisibleStepChange])

  // ── Follow mode via MutationObserver ────────────────────────────────
  useEffect(() => {
    if (!autoFollow) return
    const el = parentRef.current
    if (!el) return

    const scroll = () => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    const observer = new MutationObserver(scroll)
    observer.observe(el, { childList: true, subtree: true, characterData: true })
    scroll()

    return () => observer.disconnect()
  }, [autoFollow])

  // ── Empty state ──────────────────────────────────────────────────────
  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No timeline data available.
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!hideHeader && (
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <span className="text-sm font-medium">All steps</span>
          {firstErrorGroup && (
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleJumpToError}>
              Jump to error
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={parentRef} className="h-full overflow-auto" onScroll={handleScroll}>
          {groups.map((group) => {
            const stepMeta = steps?.find((s) => s.stepIndex === group.stepIndex)
            return (
              <StepGroupSection
                key={group.stepIndex ?? 'tail'}
                group={group}
                stepMeta={stepMeta}
                sectionRef={(el) => {
                  if (el && group.stepIndex != null) sectionRefs.current.set(group.stepIndex, el)
                }}
              />
            )
          })}
          <FollowModeBar visible={!autoFollow && !!isActive} onFollow={onFollowToggle} />
        </div>

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
