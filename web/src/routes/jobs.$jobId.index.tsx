import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { SplitPaneDetail } from '~/components/split-pane-detail'
import { Button } from '~/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '~/components/ui/empty'
import { getJobDetailFn, getFullJobTimelineFn } from '~/lib/server-fns'
import { Route as JobLayoutRoute } from './jobs.$jobId'
import { useJobDetailStream } from '~/lib/sse'
import { useIsMobile } from '~/hooks/use-media-query'
import { shortProject } from '~/components/job-detail'
import { StatusBadge } from '~/components/ui/status-badge'

export const Route = createFileRoute('/jobs/$jobId/')({
  loader: ({ params }) => getFullJobTimelineFn({ data: params.jobId }),
  component: JobDetailIndexPage,
})

function JobDetailIndexPage() {
  const { jobId } = Route.useParams()
  const layoutLoaderData = JobLayoutRoute.useLoaderData()
  const timelineLoaderData = Route.useLoaderData()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()

  // Use the callback form so the job-detail query self-regulates against
  // the latest cached data, not the stale initial loader snapshot.
  const { data: snapshot } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetailFn({ data: jobId }),
    initialData: layoutLoaderData,
    refetchInterval: (query) => {
      const data = query.state.data
      const active = data?.job.status === 'running' || data?.job.status === 'pending'
      return active ? 3000 : false
    },
  })

  // Derive isActive from the latest snapshot for all downstream consumers
  const isActive =
    snapshot?.job.status === 'running' ||
    snapshot?.job.status === 'pending'

  const { data: timelineData } = useQuery({
    queryKey: ['job-timeline-full', jobId],
    queryFn: () => getFullJobTimelineFn({ data: jobId }),
    initialData: timelineLoaderData ?? undefined,
    refetchInterval: isActive ? 5000 : false,
  })

  // SSE-driven live invalidation for running jobs
  const { events } = useJobDetailStream(jobId, '0', isActive, 3000)
  useEffect(() => {
    if (events.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['job-timeline-full', jobId] })
      void queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] })
    }
  }, [events.length, jobId, queryClient])

  if (!snapshot) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Job not found</EmptyTitle>
          <EmptyDescription>
            Job &quot;{jobId}&quot; doesn&apos;t exist or has no data.
          </EmptyDescription>
        </EmptyHeader>
        <Link to="/">
          <Button variant="outline">&larr; Back to Dashboard</Button>
        </Link>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Minimal content-first header — project + id + status */}
      <div className={`flex shrink-0 items-center border-b px-3 ${isMobile ? 'gap-1.5 py-1' : 'gap-2 py-1.5'}`}>
        <Link to="/">
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs">
            &larr;
          </Button>
        </Link>
        <span className="text-xs font-mono text-muted-foreground truncate">
          {shortProject(snapshot.job.project)}
        </span>
        <span className="text-xs font-mono font-medium truncate">
          #{snapshot.job.id}
        </span>
        <StatusBadge status={snapshot.job.status} pulse={isActive} size="sm" />
      </div>

      {/* Split-pane detail */}
      <SplitPaneDetail
        snapshot={snapshot}
        groups={timelineData?.groups ?? []}
        isActive={isActive}
      />
    </div>
  )
}
