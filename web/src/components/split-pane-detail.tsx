/**
 * Split-pane job detail layout.
 *
 * Left pane (34% default): compact job metadata + step timeline sidebar.
 * Right pane (66%): selected step's activity content.
 *
 * Uses react-resizable-panels v4 for resizable split layout.
 */

import { useEffect, useState } from 'react'
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
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(
    null,
  )
  const [autoFollow, setAutoFollow] = useState(isActive)

  // Auto-follow: when isActive && autoFollow, track the last running/active step
  useEffect(() => {
    if (!isActive || !autoFollow) return
    const activeGroup = [...groups]
      .reverse()
      .find((g) => g.status === 'running' || g.status === 'active')
    if (activeGroup?.stepIndex != null) {
      setSelectedStepIndex(activeGroup.stepIndex)
    } else if (groups.length > 0) {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup.stepIndex != null) {
        setSelectedStepIndex(lastGroup.stepIndex)
      }
    }
  }, [groups, isActive, autoFollow])

  // For completed jobs, default to last step on first render
  useEffect(() => {
    if (!isActive && selectedStepIndex === null && groups.length > 0) {
      const lastGroup = groups[groups.length - 1]
      setSelectedStepIndex(lastGroup.stepIndex)
    }
  }, [isActive, groups, selectedStepIndex])

  return (
    <Group
      orientation="horizontal"
      style={{ height: 'calc(100vh - 4rem)' }}
    >
      <Panel defaultSize="34%" minSize={280}>
        <StepTimelineSidebar
          snapshot={snapshot}
          groups={groups}
          selectedStep={selectedStepIndex}
          onSelectStep={(idx) => {
            setSelectedStepIndex(idx)
            setAutoFollow(false)
          }}
        />
      </Panel>
      <Separator className="w-1 cursor-col-resize bg-border transition-colors hover:bg-primary/40" />
      <Panel>
        <StepContentPane
          groups={groups}
          selectedStep={selectedStepIndex}
          jobId={snapshot.job.id}
          autoFollow={autoFollow}
          onFollowToggle={() => setAutoFollow(true)}
        />
      </Panel>
    </Group>
  )
}
