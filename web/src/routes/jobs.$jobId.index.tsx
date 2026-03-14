import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { JobDetail } from '~/components/job-detail'
import { Button } from '~/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '~/components/ui/empty'
import { getJobDetailFn } from '~/lib/server-fns'
import { Route as JobLayoutRoute } from './jobs.$jobId'

export const Route = createFileRoute('/jobs/$jobId/')({
  component: JobDetailIndexPage,
})

function JobDetailIndexPage() {
  const { jobId } = Route.useParams()
  const loaderData = JobLayoutRoute.useLoaderData()

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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="sm">
            &larr; Dashboard
          </Button>
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Job {snapshot.job.id}
        </h1>
      </div>

      <JobDetail snapshot={snapshot} />
    </div>
  )
}
