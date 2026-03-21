import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { SplitPaneDetail } from '~/components/split-pane-detail'
import { Button } from '~/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '~/components/ui/empty'
import { getJobDetailFn, getFullJobTimelineFn } from '~/lib/server-fns'
import { Route as JobLayoutRoute } from './jobs.$jobId'
import { useJobDetailStream } from '~/lib/sse'

export const Route = createFileRoute('/jobs/$jobId/')({
  loader: ({ params }) => getFullJobTimelineFn({ data: params.jobId }),
  component: JobDetailIndexPage,
})

function JobDetailIndexPage() {
  const { jobId } = Route.useParams()
  const layoutLoaderData = JobLayoutRoute.useLoaderData()
  const timelineLoaderData = Route.useLoaderData()
  const queryClient = useQueryClient()

  const isActive =
    layoutLoaderData?.job.status === 'running' ||
    layoutLoaderData?.job.status === 'pending'

  const { data: snapshot } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetailFn({ data: jobId }),
    initialData: layoutLoaderData,
    refetchInterval: isActive ? 3000 : false,
  })

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
      {/* Compact breadcrumb header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <Link to="/">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            &larr; Dashboard
          </Button>
        </Link>
        <span className="font-mono text-sm font-semibold">
          Job {snapshot.job.id}
        </span>
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
