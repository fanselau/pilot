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
 * compact step indicator pills at top and full-width content below.
 */

import { useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { JobDetailSnapshot, StepTimelineGroup } from '@pilot/core/types.js'
import { StepTimelineSidebar } from '~/components/step-timeline-sidebar'
import { StepContentPane } from '~/components/step-content-pane'
import { useIsMobile } from '~/hooks/use-media-query'

// ── Mobile step indicator ─────────────────────────────────────────────────

function MobileStepIndicator({
  groups,
  visibleStep,
  onClickStep,
}: {
  groups: StepTimelineGroup[]
  visibleStep: number | null
  onClickStep: (idx: number) => void
}) {
  const stepGroups = groups.filter((g) => g.stepIndex !== null)
  if (stepGroups.length === 0) return null

  return (
    <div className="flex-shrink-0 border-b bg-background/95 overflow-x-auto">
      <div className="flex gap-1 p-2">
        {stepGroups.map((group) => {
          const isActive = visibleStep === group.stepIndex
          const label =
            group.command === 'delegation' ? 'D' : `${group.stepIndex}`
          return (
            <button
              key={`mobile-step-${group.stepIndex}`}
              className={[
                'shrink-0 px-2.5 py-1 rounded-full text-xs font-mono transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              ].join(' ')}
              onClick={() =>
                group.stepIndex !== null && onClickStep(group.stepIndex)
              }
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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

  // ── Mobile: single-column layout ──────────────────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Collapsible step indicator at top */}
        <MobileStepIndicator
          groups={groups}
          visibleStep={visibleStepIndex}
          onClickStep={(idx) => scrollToStepRef.current?.(idx)}
        />
        {/* Full-width content below */}
        <div className="flex-1 overflow-auto">
          <StepContentPane
            groups={groups}
            jobId={snapshot.job.id}
            autoFollow={autoFollow}
            onFollowToggle={() => setAutoFollow(true)}
            scrollToStepRef={scrollToStepRef}
            onVisibleStepChange={setVisibleStepIndex}
          />
        </div>
      </div>
    )
  }

  // ── Desktop: resizable split-pane ─────────────────────────────────────

  return (
    <Group
      orientation="horizontal"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <Panel defaultSize="34%" minSize={280}>
        <StepTimelineSidebar
          snapshot={snapshot}
          groups={groups}
          highlightedStep={visibleStepIndex}
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
        />
      </Panel>
    </Group>
  )
}
