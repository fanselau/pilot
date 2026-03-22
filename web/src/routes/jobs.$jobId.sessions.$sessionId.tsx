import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { SessionSummary, BranchLifecycleItem } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { StatusBadge } from '~/components/ui/status-badge'
import { SessionActivity } from '~/components/session-activity'
import { BranchLifecycleBlock } from '~/components/branch-lifecycle-block'
import { getSessionChildrenFn } from '~/lib/server-fns'

export const Route = createFileRoute('/jobs/$jobId/sessions/$sessionId')({
  component: SessionDrillIn,
})

function sessionToBranchItem(session: SessionSummary, parentId: string): BranchLifecycleItem {
  return {
    kind: 'fork-card',
    sessionId: session.sessionId,
    parentSessionId: parentId,
    title: session.title,
    createdAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: session.status,
    messageCount: session.messageCount,
    tokenTotal: session.tokenTotal,
    models: session.models,
    latestMessagePreview: session.latestMessagePreview,
    childCount: session.childCount,
    durationMs: session.durationMs,
  }
}

function SessionDrillIn() {
  const { jobId, sessionId } = Route.useParams()

  // Load children (sub-sub-agents) for this session
  const { data: children, isLoading: childrenLoading } = useQuery({
    queryKey: ['session-children', sessionId],
    queryFn: () => getSessionChildrenFn({ data: sessionId }),
  })

  // Derive session status from children data (if session has completed children, it's likely done)
  const sessionStatus = children && children.length > 0
    ? (children.every((c) => c.status === 'done') ? 'done' : 'active')
    : undefined

  return (
    <div className="flex h-full flex-col overflow-hidden max-w-full">
      {/* Compact breadcrumb header — matches job detail header style */}
      <div className="flex shrink-0 items-center gap-3 border-b px-3 sm:px-4 py-2 min-w-0">
        <Link to="/jobs/$jobId" params={{ jobId }}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            &larr; Back to Job
          </Button>
        </Link>
        <span className="font-mono text-sm font-semibold min-w-0 truncate">
          Session {sessionId.slice(0, 8)}
        </span>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto overflow-x-hidden p-3 sm:p-4 space-y-4 max-w-full">
        {/* Session info card */}
        <div className="rounded-xl border bg-card p-3 sm:p-4 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sub-Agent Session
            </p>
            <Badge variant="outline" size="sm" className="font-mono truncate max-w-[200px]">
              {sessionId.slice(0, 8)}
            </Badge>
            {sessionStatus && (
              <StatusBadge status={sessionStatus === 'done' ? 'completed' : 'running'} size="sm" />
            )}
          </div>
          {children && children.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{children.length} child session{children.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Session Activity */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Activity
          </h3>
          <SessionActivity key={sessionId} sessionId={sessionId} />
        </div>

        {/* Child sessions — rendered via BranchLifecycleBlock (inline collapsible) */}
        {childrenLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : children && children.length > 0 ? (
          <div className="space-y-2 max-w-full overflow-hidden">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Child Sessions ({children.length})
            </h3>
            <div className="space-y-2 max-w-full overflow-hidden">
              {children.map((child) => (
                <BranchLifecycleBlock
                  key={child.sessionId}
                  item={sessionToBranchItem(child, sessionId)}
                  jobId={jobId}
                  depth={1}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
