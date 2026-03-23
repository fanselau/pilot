import { useQuery } from '@tanstack/react-query'
import type { SessionPart, StepTimelineItem, TimelineActivityItem, TimelineToolSummaryItem } from '@pilot/core/types.js'
import { Skeleton } from '~/components/ui/skeleton'
import { TimelineItemRenderer } from '~/components/timeline-stream'
import { getSessionActivityFn } from '~/lib/server-fns'

// ── Conversion ───────────────────────────────────────────────────────────

// sessionId is passed from the parent component (all parts belong to the same session).
// Note: the "Show full" button in ActivityRow will not work for session-activity context —
// this is acceptable since child sessions don't have direct job-level message access.
function partToTimelineItem(part: SessionPart, sessionId: string): StepTimelineItem {
  if (part.type === 'text' || part.type === 'reasoning') {
    return {
      kind: 'activity',
      sessionId,
      partId: part.id,
      role: part.role,
      createdAt: part.createdAt,
      text: part.text ?? '',
    } satisfies TimelineActivityItem
  }
  return {
    kind: 'tool-summary',
    sessionId,
    partId: part.id,
    createdAt: part.createdAt,
    tool: part.tool ?? part.type,
    toolInput: part.toolInput,
    toolStatus: part.toolStatus,
    patchFiles: part.patchFiles,
  } satisfies TimelineToolSummaryItem
}

// ── Main Component ───────────────────────────────────────────────────────

interface SessionActivityProps {
  sessionId: string
  /** When true, polls for updates every 3s (for active sessions). */
  isActive?: boolean
}

export function SessionActivity({ sessionId, isActive = false }: SessionActivityProps) {
  // Load all parts in a single query — no pagination / Load More
  const { data, isLoading } = useQuery({
    queryKey: ['session-activity-full', sessionId],
    queryFn: () =>
      getSessionActivityFn({
        data: {
          sessionId,
          limit: 1000,
          includeToolDetails: true,
        },
      }),
    refetchInterval: isActive ? 3000 : false,
  })

  // Reset query on sessionId change is handled automatically by the queryKey

  if (isLoading) {
    return (
      <div className="py-4 px-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    )
  }

  const allParts = data?.parts ?? []

  if (allParts.length === 0) {
    return (
      <div className="py-6 px-3 text-center text-sm text-muted-foreground">
        No activity recorded for this session.
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden py-1 px-2 sm:px-3">
      <div className="space-y-0.5 max-w-full overflow-hidden">
        {allParts.map((part) => (
          <div key={part.id}>
            <TimelineItemRenderer item={partToTimelineItem(part, sessionId)} jobId="" />
          </div>
        ))}
      </div>
    </div>
  )
}
