import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CommandPalette } from '~/components/command-palette'
import { getJobDetailFn } from '~/lib/server-fns'

export const Route = createFileRoute('/jobs/$jobId')({
  loader: ({ params }) => getJobDetailFn({ data: params.jobId }),
  component: JobLayout,
})

function JobLayout() {
  const loaderData = Route.useLoaderData()
  const { jobId } = Route.useParams()
  const navigate = useNavigate()

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

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      <Outlet />

      {/* Command palette with job context */}
      <CommandPalette
        ctx={
          snapshot
            ? {
                job: {
                  id: snapshot.job.id,
                  status: snapshot.job.status,
                  project: snapshot.job.project,
                },
                projectPath: snapshot.job.project,
                navigate: (to) => navigate({ to }),
              }
            : {
                job: null,
                projectPath: null,
                navigate: (to) => navigate({ to }),
              }
        }
      />
    </div>
  )
}
