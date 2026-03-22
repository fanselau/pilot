/**
 * Split-pane job detail layout.
 *
 * Left pane (34% default): compact job metadata + step timeline sidebar.
 * Right pane (66%): continuous-scroll content with scroll-spy highlights.
 *
 * Sidebar clicks scroll the content pane to the target step section.
 * An IntersectionObserver in the content pane drives sidebar highlighting.
 *
 * Uses react-resizable-panels v4 for resizable split layout.
 * On mobile (<800px via useIsMobile), collapses to single-column with
 * compact top bar (status + Info + Summary triggers) and full-height content.
 * Tab bar is completely removed — activity/timeline is the only surface.
 */

import { useRef, useState, useMemo } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { JobDetailSnapshot, StepTimelineGroup } from '@pilot/core/types.js'
import { StepTimelineSidebar } from '~/components/step-timeline-sidebar'
import { StepContentPane } from '~/components/step-content-pane'
import { JobInfoPanel } from '~/components/job-info-panel'
import { SummaryOverlay } from '~/components/summary-overlay'
import { useIsMobile } from '~/hooks/use-media-query'
import { StatusBadge } from '~/components/ui/status-badge'
import { Button } from '~/components/ui/button'
import { formatCompactDuration } from '~/lib/format'
import { formatStepLabel } from '~/lib/step-semantics'

// ── Split-pane detail ─────────────────────────────────────────────────────

interface SplitPaneDetailProps {
  snapshot: JobDetailSnapshot
  groups: StepTimelineGroup[]
  isActive: boolean
}

export function SplitPaneDetail({
  snapshot,
  groups,
  isActive,
}: SplitPaneDetailProps) {
  // Ref-based scroll-to: content pane registers its scrollTo function here
  const scrollToStepRef = useRef<((idx: number) => void) | null>(null)

  // Scroll-spy driven: which step is currently visible in the content pane
  const [visibleStepIndex, setVisibleStepIndex] = useState<number | null>(null)

  const [autoFollow, setAutoFollow] = useState(isActive)

  const isMobile = useIsMobile()

  // Compute elapsed time for running banner
  const elapsed = useMemo(() => {
    if (!isActive || !snapshot.job.startedAt) return null
    const startMs = Date.parse(snapshot.job.startedAt)
    if (isNaN(startMs)) return null
    return formatCompactDuration(Date.now() - startMs)
  }, [isActive, snapshot.job.startedAt])

  // Look up the current step's group for semantic label in top bar
  const currentGroup = useMemo(
    () =>
      snapshot.job.currentStep != null
        ? (groups.find((g) => g.stepIndex === snapshot.job.currentStep) ?? null)
        : null,
    [groups, snapshot.job.currentStep],
  )

  // ── Mobile: tabless content-first layout ──────────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Compact top bar: status + step label + Info + Summary triggers */}
        <div className="flex-shrink-0 border-b px-3 py-1.5 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={snapshot.job.status} pulse={isActive} size="sm" />
            <span className="text-xs text-muted-foreground truncate flex-1">
              {snapshot.job.currentStep != null &&
                (currentGroup
                  ? `${formatStepLabel(currentGroup)} #${snapshot.job.currentStep}`
                  : `#${snapshot.job.currentStep}`)}
            </span>
            {isActive && elapsed && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {elapsed}
              </span>
            )}
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            )}

            {/* Summary overlay trigger */}
            <SummaryOverlay
              jobId={snapshot.job.id}
              trigger={
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                  Summary
                </Button>
              }
            />

            {/* Info panel trigger */}
            <JobInfoPanel
              snapshot={snapshot}
              isActive={isActive}
              trigger={
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                  Info
                </Button>
              }
            />
          </div>
        </div>

        {/* Full-height activity/timeline — no tabs */}
        <div className="flex-1 overflow-auto">
          <StepContentPane
            groups={groups}
            jobId={snapshot.job.id}
            autoFollow={autoFollow}
            onFollowToggle={() => setAutoFollow(true)}
            scrollToStepRef={scrollToStepRef}
            onVisibleStepChange={setVisibleStepIndex}
            steps={snapshot.steps}
            hideHeader
          />
        </div>
      </div>
    )
  }

  // ── Desktop: resizable split-pane ─────────────────────────────────────

  return (
    <Group
      orientation="horizontal"
      style={{ height: 'calc(100dvh - 4rem)' }}
    >
      <Panel defaultSize="34%" minSize={280}>
        <StepTimelineSidebar
          snapshot={snapshot}
          groups={groups}
          highlightedStep={visibleStepIndex}
          isActive={isActive}
          onClickStep={(idx) => {
            scrollToStepRef.current?.(idx)
            setAutoFollow(false)
          }}
        />
      </Panel>
      <Separator className="w-1 cursor-col-resize bg-border transition-colors hover:bg-primary/40" />
      <Panel>
        <StepContentPane
          groups={groups}
          jobId={snapshot.job.id}
          autoFollow={autoFollow}
          onFollowToggle={() => setAutoFollow(true)}
          scrollToStepRef={scrollToStepRef}
          onVisibleStepChange={setVisibleStepIndex}
          steps={snapshot.steps}
        />
      </Panel>
    </Group>
  )
}
