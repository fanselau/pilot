import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import { JobDetail } from '~/components/job-detail'
import { getJobDetailFn } from '~/lib/server-fns'

export const Route = createFileRoute('/jobs/$jobId')({
  loader: ({ params }) => getJobDetailFn({ data: params.jobId }),
  component: JobDetailPage,
})

function JobDetailPage() {
  const loaderData = Route.useLoaderData()
  const { jobId } = Route.useParams()

  // Auto-refresh the detail view every 3 seconds for active jobs
  const isActive =
    loaderData?.job.status === 'running' ||
    loaderData?.job.status === 'pending'

  const { data: snapshot } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetailFn({ data: jobId }),
    initialData: loaderData,
    refetchInterval: isActive ? 3000 : false,
  })

  if (!snapshot) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-5xl">
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              &larr; Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Job {snapshot.job.id}
          </h1>
        </div>

        <JobDetail snapshot={snapshot} />
        <Outlet />
      </div>
    </div>
  )
}
