/**
 * Merged chronological timeline component.
 *
 * Renders the unified timeline stream for a job, merging root
 * session activity with sub-agent fork cards in chronological order.
 * Uses getJobTimelineFn for data and supports cursor-based pagination.
 */

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  TimelineItem,
  TimelineActivityItem,
  TimelineToolSummaryItem,
  TimelineForkCardItem,
  TimelineCompletionCardItem,
} from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { Spinner } from '~/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { TimelineForkCard } from '~/components/timeline-fork-card'
import { useJobDetailStream } from '~/lib/sse'
import { getJobTimelineFn } from '~/lib/server-fns'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '\u2014'
  const secs = Math.floor(ms / 1_000)
  const mins = Math.floor(secs / 60)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
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

// ── Item Renderers ───────────────────────────────────────────────────────

function ActivityRow({ item }: { item: TimelineActivityItem }) {
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums mt-0.5">
        {formatTime(item.createdAt)}
      </span>
      <Badge variant={roleVariant(item.role)} size="sm">
        {item.role}
      </Badge>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground line-clamp-2">
        {truncate(item.text, 200)}
      </span>
    </div>
  )
}

function ToolSummaryRow({ item }: { item: TimelineToolSummaryItem }) {
  const hasLongInput = (item.toolInput?.length ?? 0) > 100

  return (
    <Collapsible>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1.5">
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums mt-0.5">
          {formatTime(item.createdAt)}
        </span>
        <Badge variant="info" size="sm">
          {item.tool}
        </Badge>
        {item.toolStatus && (
          <Badge variant={toolStatusVariant(item.toolStatus)} size="sm">
            {item.toolStatus}
          </Badge>
        )}
        <div className="min-w-0 flex-1">
          {hasLongInput ? (
            <>
              <CollapsibleTrigger className="text-left text-xs text-muted-foreground hover:text-foreground">
                <span className="line-clamp-1">
                  {truncate(item.toolInput ?? '', 100)}
                </span>
                <span className="text-xs text-primary ml-1">[expand]</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="min-w-0 max-w-full overflow-hidden">
                <div className="mt-1 max-w-full rounded-md border bg-muted/50 p-2">
                  <pre className="whitespace-pre-wrap break-words text-xs text-foreground/90 font-mono [overflow-wrap:anywhere]">
                    {item.toolInput}
                  </pre>
                </div>
              </CollapsibleContent>
            </>
          ) : (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {truncate(item.toolInput ?? '', 100)}
            </span>
          )}
          {item.patchFiles && item.patchFiles.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {item.patchFiles.map((f) => (
                <Badge key={f} variant="outline" size="sm">
                  {f.split('/').pop() ?? f}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Collapsible>
  )
}

function CompletionRow({ item }: { item: TimelineCompletionCardItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 opacity-70">
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatTime(item.createdAt)}
      </span>
      <Badge variant="success" size="sm">
        done
      </Badge>
      <span className="text-xs text-muted-foreground truncate">
        {item.title || 'Session completed'}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatDurationMs(item.durationMs)}
      </span>
      {item.tokenTotal > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTokens(item.tokenTotal)} tokens
        </span>
      )}
    </div>
  )
}

// ── Timeline Item Switcher ───────────────────────────────────────────────

function TimelineItemRenderer({
  item,
  jobId,
}: {
  item: TimelineItem
  jobId: string
}) {
  switch (item.kind) {
    case 'activity':
      return <ActivityRow item={item} />
    case 'tool-summary':
      return <ToolSummaryRow item={item} />
    case 'fork-card':
      return <TimelineForkCard item={item} jobId={jobId} />
    case 'completion-card':
      return <CompletionRow item={item} />
    default:
      return null
  }
}

// ── Main Component ───────────────────────────────────────────────────────

interface TimelineStreamProps {
  jobId: string
  isActive: boolean
}

export function TimelineStream({ jobId, isActive }: TimelineStreamProps) {
  const queryClient = useQueryClient()
  const [extraPages, setExtraPages] = useState<TimelineItem[][]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Initial timeline load
  const { data, isLoading, error } = useQuery({
    queryKey: ['job-timeline', jobId],
    queryFn: () => getJobTimelineFn({ data: { jobId, limit: 100 } }),
    refetchInterval: isActive ? 5000 : false,
  })

  // Reset pagination state when base data changes
  useEffect(() => {
    if (data) {
      setHasMore(data.hasMore)
      setNextCursor(data.nextCursor)
      // Clear extra pages when the base query refreshes
      setExtraPages([])
    }
  }, [data])

  // Live updates via SSE polling — invalidate timeline on new events
  const { events } = useJobDetailStream(
    jobId,
    data?.nextCursor ?? '0',
    isActive,
    3000,
  )

  useEffect(() => {
    if (events.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['job-timeline', jobId] })
    }
  }, [events.length, jobId, queryClient])

  // Load more handler
  async function loadMore() {
    if (!hasMore || !nextCursor) return
    setLoadingMore(true)
    try {
      const result = await getJobTimelineFn({
        data: { jobId, cursor: nextCursor, limit: 100 },
      })
      if (result) {
        setExtraPages((prev) => [...prev, result.items])
        setHasMore(result.hasMore)
        setNextCursor(result.nextCursor)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // Loading state
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

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive">
          Failed to load timeline: {error.message}
        </CardContent>
      </Card>
    )
  }

  // Merge base items with extra pages
  const baseItems = data?.items ?? []
  const allItems = [...baseItems, ...extraPages.flat()]

  // Empty state
  if (allItems.length === 0) {
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
        <CardContent className="min-w-0 max-w-full overflow-hidden py-3">
          <ScrollArea className="max-w-full" scrollbarGutter>
            {/* Vertical line connector via left border on container */}
            <div className="relative min-w-0 max-w-full space-y-0.5 border-l-2 border-border/40 pl-4">
              {allItems.map((item, idx) => (
                <div key={`${item.kind}-${'partId' in item ? item.partId : item.sessionId}-${idx}`}>
                  <TimelineItemRenderer item={item} jobId={jobId} />
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Load more */}
          {hasMore && (
            <>
              <Separator className="my-2" />
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Spinner className="size-3.5" />
                      Loading...
                    </>
                  ) : (
                    'Load more activity'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
