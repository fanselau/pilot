import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsList, TabsTab, TabsPanel } from '~/components/ui/tabs'
import { Skeleton } from '~/components/ui/skeleton'
import { JobList } from '~/components/job-list'
import { getJobsListFn } from '~/lib/server-fns'

export const Route = createFileRoute('/')({
  loader: () => getJobsListFn(),
  component: Home,
})

function Home() {
  const loaderData = Route.useLoaderData()

  // Auto-refresh every 5 seconds via React Query
  const { data, isLoading } = useQuery({
    queryKey: ['jobs-list'],
    queryFn: () => getJobsListFn(),
    initialData: loaderData,
    refetchInterval: 5000,
  })

  if (isLoading && !data) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="mt-2 h-5 w-48" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const { active, queued, recent } = data ?? loaderData

  const activeCount = active.length
  const queuedCount = queued.length
  const recentCount = recent.length

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pilot Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Autonomous AI development pipeline
          </p>
        </div>

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTab value="active">
              Active{activeCount > 0 ? ` (${activeCount})` : ''}
            </TabsTab>
            <TabsTab value="queued">
              Queued{queuedCount > 0 ? ` (${queuedCount})` : ''}
            </TabsTab>
            <TabsTab value="recent">
              Recent{recentCount > 0 ? ` (${recentCount})` : ''}
            </TabsTab>
          </TabsList>

          <TabsPanel value="active">
            <JobList data={{ active, queued: [], recent: [] }} />
          </TabsPanel>

          <TabsPanel value="queued">
            <JobList data={{ active: [], queued, recent: [] }} />
          </TabsPanel>

          <TabsPanel value="recent">
            <JobList data={{ active: [], queued: [], recent }} />
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  )
}
