import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { SessionActivity } from '~/components/session-activity'
import { SubagentCard } from '~/components/subagent-card'
import { getSessionChildrenFn } from '~/lib/server-fns'

export const Route = createFileRoute('/jobs/$jobId/sessions/$sessionId')({
  component: SessionDrillIn,
})

function SessionDrillIn() {
  const { jobId, sessionId } = Route.useParams()

  // Load children (sub-sub-agents) for this session
  const { data: children, isLoading: childrenLoading } = useQuery({
    queryKey: ['session-children', sessionId],
    queryFn: () => getSessionChildrenFn({ data: sessionId }),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact breadcrumb header — matches job detail header style */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <Link to="/jobs/$jobId" params={{ jobId }}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            &larr; Back to Job
          </Button>
        </Link>
        <span className="font-mono text-sm font-semibold">
          Session {sessionId.slice(0, 8)}
        </span>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Session info card */}
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Child Session
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" size="sm" className="font-mono">
              {sessionId.slice(0, 8)}
            </Badge>
          </div>
        </div>

        {/* Session Activity */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Activity
          </h3>
          <SessionActivity key={sessionId} sessionId={sessionId} />
        </div>

        {/* Child sessions */}
        {childrenLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : children && children.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Child Sessions ({children.length})
            </h3>
            <div className="space-y-2">
              {children.map((child) => (
                <SubagentCard
                  key={child.sessionId}
                  session={child}
                  jobId={jobId}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
