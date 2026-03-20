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
 */

import { useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { JobDetailSnapshot, StepTimelineGroup } from '@pilot/core/types.js'
import { StepTimelineSidebar } from '~/components/step-timeline-sidebar'
import { StepContentPane } from '~/components/step-content-pane'

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
