import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '~/components/ui/badge'
import { Skeleton } from '~/components/ui/skeleton'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb'
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
    <div className="space-y-6">
      {/* Breadcrumb navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>
              Dashboard
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link to="/jobs/$jobId" params={{ jobId }} />}
            >
              Job {jobId}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              Session {sessionId.slice(0, 8)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Session Activity</h2>
        <Badge variant="outline" size="sm" className="font-mono">
          {sessionId.slice(0, 8)}
        </Badge>
      </div>

      <SessionActivity sessionId={sessionId} initialLimit={30} />

      {/* Sub-sub-agents (children of this session) */}
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
  )
}
