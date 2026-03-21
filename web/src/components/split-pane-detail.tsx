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

import { useRef, useState, useMemo } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { JobDetailSnapshot, StepTimelineGroup } from '@pilot/core/types.js'
import { StepTimelineSidebar } from '~/components/step-timeline-sidebar'
import { StepContentPane } from '~/components/step-content-pane'
import { useIsMobile } from '~/hooks/use-media-query'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/sheet'
import { StatusBadge } from '~/components/ui/status-badge'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { ObservabilityCard } from '~/components/observability-card'
import { VerdictCard } from '~/components/verdict-card'
import { GitCheckpointCard } from '~/components/git-checkpoint-card'
import { ToolSummaryChips } from '~/components/tool-summary-chips'
import { formatCompactDuration } from '~/lib/format'
import { formatStepLabel, isContinuationStep } from '~/lib/step-semantics'

// ── Mobile step indicator ─────────────────────────────────────────────────

function mobileStepChar(group: StepTimelineGroup): string {
  if (group.command === 'delegation') return 'D'
  const label = formatStepLabel(group)
  if (label === 'Execution') return 'E'
  if (label === 'Planning') return 'P'
  if (label === 'Judge' || label === 'Verification') return 'J'
  if (label === 'Gap Closure') return 'G'
  if (label === 'Recovery') return 'R'
  if (label === 'Quick Task') return 'Q'
  return group.stepIndex !== null ? `${group.stepIndex}` : '?'
}

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
          const label = mobileStepChar(group)
          const isCont = isContinuationStep(group)
          return (
            <button
              key={`mobile-step-${group.stepIndex}`}
              className={[
                'shrink-0 px-2.5 py-1 rounded-full text-xs font-mono transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
                isCont && !isActive ? 'ring-1 ring-amber-400/50' : '',
              ].filter(Boolean).join(' ')}
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

  // Compute elapsed time for running banner
  const elapsed = useMemo(() => {
    if (!isActive || !snapshot.job.startedAt) return null
    const startMs = Date.parse(snapshot.job.startedAt)
    if (isNaN(startMs)) return null
    return formatCompactDuration(Date.now() - startMs)
  }, [isActive, snapshot.job.startedAt])

  // Step groups for timeline tab
  const stepGroups = useMemo(
    () => groups.filter((g) => g.stepIndex !== null),
    [groups],
  )

  // Look up the current step's group for semantic label in running banner
  const currentGroup = useMemo(
    () => snapshot.job.currentStep != null
      ? groups.find((g) => g.stepIndex === snapshot.job.currentStep) ?? null
      : null,
    [groups, snapshot.job.currentStep],
  )

  // ── Mobile: tabbed layout ──────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Sticky compact summary */}
        <div className="flex-shrink-0 border-b px-3 py-2 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <StatusBadge status={snapshot.job.status} pulse={isActive} size="sm" />
            <span className="font-mono text-sm font-bold">{snapshot.job.id}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {snapshot.job.currentStep != null && (
                currentGroup
                  ? `${formatStepLabel(currentGroup)} #${snapshot.job.currentStep}`
                  : `#${snapshot.job.currentStep}`
              )}
              {isActive && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
            </span>

            {/* Action bottom sheet */}
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="sm" className="h-7 px-2 text-xs" />}>
                Actions
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-lg">
                <SheetHeader>
                  <SheetTitle>Job Actions</SheetTitle>
                </SheetHeader>
                <div className="p-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Job {snapshot.job.id} — {snapshot.job.status}
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Running banner */}
        {isActive && (
          <div className="flex-shrink-0 bg-sky-500/10 border-b border-sky-500/20 px-3 py-1.5 flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-sky-300">
              {currentGroup
                ? `${formatStepLabel(currentGroup)} #${snapshot.job.currentStep ?? '…'}…`
                : `Running #${snapshot.job.currentStep ?? '…'}…`}
            </span>
            <span className="text-muted-foreground ml-auto">{elapsed}</span>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="steps" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="flex-shrink-0 border-b overflow-x-auto">
            <TabsTrigger value="steps">Timeline</TabsTrigger>
            <TabsTrigger value="timeline">Summary</TabsTrigger>
            <TabsTrigger value="meta">Meta</TabsTrigger>
          </TabsList>

          <TabsContent value="steps" className="flex-1 overflow-auto">
            <StepContentPane
              groups={groups}
              jobId={snapshot.job.id}
              autoFollow={autoFollow}
              onFollowToggle={() => setAutoFollow(true)}
              scrollToStepRef={scrollToStepRef}
              onVisibleStepChange={setVisibleStepIndex}
              steps={snapshot.steps}
            />
          </TabsContent>

          <TabsContent value="timeline" className="flex-1 overflow-auto p-3">
            {/* Step indicator pills + per-step tool summaries */}
            <div className="space-y-2">
              {stepGroups.map((group) => {
                const stepMeta = snapshot.steps.find((s) => s.stepIndex === group.stepIndex)
                const label = formatStepLabel(group)
                return (
                  <button
                    key={`timeline-${group.stepIndex}`}
                    className={[
                      'w-full text-left px-3 py-2 rounded-lg border transition-colors duration-150',
                      visibleStepIndex === group.stepIndex
                        ? 'border-sky-400/30 bg-sky-500/5'
                        : 'border-border hover:bg-white/[0.03]',
                    ].join(' ')}
                    onClick={() => group.stepIndex != null && scrollToStepRef.current?.(group.stepIndex)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" size="sm">{label}</Badge>
                      <Badge
                        variant={
                          group.status === 'running' ? 'info' :
                          group.status === 'completed' || group.status === 'done' ? 'success' :
                          group.status === 'failed' ? 'destructive' : 'secondary'
                        }
                        size="sm"
                      >
                        {group.status}
                      </Badge>
                      {stepMeta?.durationMs != null && (
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                          {formatCompactDuration(stepMeta.durationMs)}
                        </span>
                      )}
                    </div>
                    <ToolSummaryChips items={group.items} />
                  </button>
                )
              })}
              {stepGroups.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No steps yet.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="meta" className="flex-1 overflow-auto p-3 space-y-3">
            <ObservabilityCard jobId={snapshot.job.id} isActive={isActive} />
            <VerdictCard jobId={snapshot.job.id} />
            <GitCheckpointCard
              gitBaseCommit={snapshot.job.gitBaseCommit ?? null}
              gitHeadCommit={snapshot.job.gitHeadCommit ?? null}
              startedDirty={snapshot.job.startedDirty}
            />
          </TabsContent>
        </Tabs>
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
