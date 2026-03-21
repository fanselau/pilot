import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CommandPalette } from '~/components/command-palette'
import { getJobDetailFn } from '~/lib/server-fns'
import { useIsMobile } from '~/hooks/use-media-query'

export const Route = createFileRoute('/jobs/$jobId')({
  loader: ({ params }) => getJobDetailFn({ data: params.jobId }),
  component: JobLayout,
})

function JobLayout() {
  const loaderData = Route.useLoaderData()
  const { jobId } = Route.useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // Auto-refresh the detail view every 3 seconds for active jobs.
  // Use the callback form so the interval re-evaluates against the
  // latest cached data, not the stale initial loader snapshot.
  const { data: snapshot } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetailFn({ data: jobId }),
    initialData: loaderData,
    refetchInterval: (query) => {
      const data = query.state.data
      const active = data?.job.status === 'running' || data?.job.status === 'pending'
      return active ? 3000 : false
    },
  })

  return (
    <div className={`flex flex-col overflow-hidden ${isMobile ? 'h-dvh' : 'h-[calc(100dvh-3rem)]'}`}>
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
