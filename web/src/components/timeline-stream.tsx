/**
 * Step-grouped timeline component.
 *
 * Renders explicit step containers as the primary timeline structure.
 * Chronology is preserved inside each step group, including inline
 * lifecycle branch blocks for child sessions.
 *
 * All timeline data loads in a single query (no pagination / Load More buttons).
 * Truncated activity rows have a "Show full" button that fetches complete content.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  StepTimelineGroup,
  StepTimelineItem,
  TimelineActivityItem,
  TimelineToolSummaryItem,
} from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '~/components/ui/empty'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { BranchLifecycleBlock } from '~/components/branch-lifecycle-block'
import { SyntaxHighlight, detectLanguage } from '~/components/syntax-highlight'
import { useJobDetailStream } from '~/lib/sse'
import { getFullJobTimelineFn, getFullMessageFn } from '~/lib/server-fns'
import { formatStepLabel, isJudgeStep } from '~/lib/step-semantics'

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}...`
}

function roleVariant(role: string) {
  switch (role) {
    case 'assistant':
      return 'info' as const
    case 'user':
      return 'secondary' as const
    case 'system':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

function toolStatusVariant(status: string | undefined) {
  switch (status) {
    case 'completed':
      return 'success' as const
    case 'error':
      return 'destructive' as const
    case 'running':
      return 'info' as const
    default:
      return 'secondary' as const
  }
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
    case 'unattributed':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

function groupKey(group: StepTimelineGroup): string {
  if (group.stepIndex === null) return 'step-unattributed'
  return `step-${group.stepIndex}`
}

export function ActivityRow({ item }: { item: TimelineActivityItem }) {
  const [fullText, setFullText] = useState<string | null>(null)
  const isTruncated = item.text.length > 220

  async function handleShowFull() {
    const result = await getFullMessageFn({
      data: { sessionId: item.sessionId, partId: item.partId },
    })
    if (result?.text) {
      setFullText(result.text)
    }
  }

  const displayText = fullText ?? item.text
  const isCodeLike = useMemo(() => detectLanguage(displayText) !== null, [displayText])

  return (
    <div className="py-1.5 max-w-full overflow-hidden space-y-0.5">
      {/* Header row: metadata */}
      <div className="flex items-center gap-x-2">
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatTime(item.createdAt)}
        </span>
        <Badge variant={roleVariant(item.role)} size="sm">
          {item.role}
        </Badge>
      </div>
      {/* Content row */}
      <div className="min-w-0">
        {fullText && isCodeLike ? (
          <SyntaxHighlight content={displayText} />
        ) : (
          <span className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
            {fullText ? displayText : truncate(displayText, 220)}
          </span>
        )}
        {isTruncated && !fullText && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-auto py-0 px-1 text-xs text-primary"
            onClick={() => void handleShowFull()}
          >
            Show full
          </Button>
        )}
      </div>
    </div>
  )
}

export function ToolSummaryRow({ item }: { item: TimelineToolSummaryItem }) {
  const hasLongInput = (item.toolInput?.length ?? 0) > 100
  const isError = item.toolStatus === 'error'

  return (
    <Collapsible>
      <div className={`py-1.5 max-w-full overflow-hidden space-y-0.5 ${isError ? 'bg-rose-500/5 rounded' : ''}`}>
        {/* Header row: metadata */}
        <div className="flex items-center gap-x-2">
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatTime(item.createdAt)}
          </span>
          <span className={`shrink-0 text-xs font-mono font-medium max-w-[120px] truncate ${isError ? 'text-rose-400' : 'text-sky-400'}`}>
            {item.tool}
          </span>
          {item.toolStatus && (
            <Badge variant={toolStatusVariant(item.toolStatus)} size="sm">
              {item.toolStatus}
            </Badge>
          )}
        </div>
        {/* Content row */}
        <div className="min-w-0">
          {hasLongInput ? (
            <>
              <CollapsibleTrigger className="text-left text-xs text-muted-foreground hover:text-foreground">
                <span className="line-clamp-1">{truncate(item.toolInput ?? '', 120)}</span>
                <span className="text-xs text-primary ml-1">[expand]</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="min-w-0 max-w-full overflow-hidden">
                <div className="mt-1 max-w-full rounded-md border bg-muted/50 p-2">
                  <SyntaxHighlight
                    content={item.toolInput ?? ''}
                    className="whitespace-pre-wrap break-words text-foreground/90 [overflow-wrap:anywhere]"
                  />
                </div>
              </CollapsibleContent>
            </>
          ) : (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {truncate(item.toolInput ?? '', 120)}
            </span>
          )}
        </div>
      </div>
    </Collapsible>
  )
}

export function TimelineItemRenderer({
  item,
  jobId,
}: {
  item: StepTimelineItem
  jobId: string
}) {
  switch (item.kind) {
    case 'activity':
      return <ActivityRow item={item} />
    case 'tool-summary':
      return <ToolSummaryRow item={item} />
    case 'fork-card':
      return <BranchLifecycleBlock item={item} jobId={jobId} />
    default:
      return null
  }
}

function StepGroupSection({
  group,
  jobId,
}: {
  group: StepTimelineGroup
  jobId: string
}) {
  const stepLabel = formatStepLabel(group)

  return (
    <section className="space-y-2">
      {/* Step group header — sticky with z-30 to stack above nested session headers */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/30 flex flex-wrap items-center gap-2 px-2 py-1.5">
        <Badge variant={group.stepIndex === null ? 'outline' : 'secondary'}>
          {stepLabel}
        </Badge>
        <Badge variant={stepStatusVariant(group.status)} size="sm">
          {group.status}
        </Badge>
        <span className="text-sm text-muted-foreground">{group.command}</span>
      </div>

      {isJudgeStep(group) && group.verdictReason && (
        <div className="px-4 py-1 border-b border-amber-500/20 bg-amber-500/5 text-xs text-muted-foreground">
          <span className="text-amber-400 font-medium">Verdict:</span>{' '}
          <span className="line-clamp-1">{group.verdictReason}</span>
        </div>
      )}

      <div className="relative min-w-0 max-w-full overflow-hidden space-y-0.5 border-l-2 border-border/40 pl-2 sm:pl-4">
        {group.items.map((item, idx) => {
          const itemKey = item.kind === 'fork-card'
            ? `fork-${item.sessionId}-${item.createdAt}-${idx}`
            : `${item.kind}-${item.partId}-${item.createdAt}-${idx}`

          return (
            <div key={itemKey}>
              <TimelineItemRenderer item={item} jobId={jobId} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

interface TimelineStreamProps {
  jobId: string
  isActive: boolean
}

export function TimelineStream({ jobId, isActive }: TimelineStreamProps) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['job-timeline-full', jobId],
    queryFn: () => getFullJobTimelineFn({ data: jobId }),
    refetchInterval: isActive ? 3000 : 30_000,
  })

  const { events } = useJobDetailStream(
    jobId,
    '0',
    isActive,
    3000,
  )

  useEffect(() => {
    if (events.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['job-timeline-full', jobId] })
    }
  }, [events.length, jobId, queryClient])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          Failed to load timeline: {error.message}
        </CardContent>
      </Card>
    )
  }

  const groups = data?.groups ?? []
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0)

  if (totalItems === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No activity yet</EmptyTitle>
          <EmptyDescription>
            Timeline items will appear here as the job executes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Timeline
      </h3>
      <Card className="min-w-0 max-w-full overflow-hidden">
        <CardContent className="min-w-0 max-w-full overflow-hidden py-3 space-y-3">
          <ScrollArea className="max-w-full" scrollbarGutter>
            <div className="space-y-4 pr-1">
              {groups.map((group, idx) => (
                <Fragment key={groupKey(group)}>
                  {idx > 0 && <Separator />}
                  <StepGroupSection group={group} jobId={jobId} />
                </Fragment>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
