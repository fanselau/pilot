import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Tabs, TabsList, TabsTab, TabsPanel } from '~/components/ui/tabs'
import { Skeleton } from '~/components/ui/skeleton'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { JobList } from '~/components/job-list'
import { SessionOverview } from '~/components/session-overview'
import { getJobsListFn, getJobDetailFn } from '~/lib/server-fns'
import { toastManager } from '~/components/ui/toast'
import type { SessionSummary } from '@pilot/core/types.js'

export const Route = createFileRoute('/')({
  loader: () => getJobsListFn(),
  component: Home,
})

function Home() {
  const loaderData = Route.useLoaderData()
  const queryClient = useQueryClient()

  // Auto-refresh every 5 seconds via React Query
  const { data, isLoading } = useQuery({
    queryKey: ['jobs-list'],
    queryFn: () => getJobsListFn(),
    initialData: loaderData,
    refetchInterval: 5000,
  })

  const { active, queued, recent } = data ?? loaderData

  // Collect job IDs for session data loading
  const sessionJobIds = useMemo(() => {
    const ids: string[] = []
    for (const job of active) ids.push(job.id)
    for (const job of recent.slice(0, 5)) ids.push(job.id) // limit to 5 recent
    return ids
  }, [active, recent])

  // Load job detail snapshots for session data (active + 5 recent)
  const sessionQueries = useQuery({
    queryKey: ['session-overview', sessionJobIds],
    queryFn: async () => {
      if (sessionJobIds.length === 0) return [] as SessionSummary[]
      const results = await Promise.allSettled(
        sessionJobIds.map((id) => getJobDetailFn({ data: id })),
      )
      const sessions: SessionSummary[] = []
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          sessions.push(...result.value.rootSessions)
          sessions.push(...result.value.subagents)
        }
      }
      return sessions
    },
    refetchInterval: 10_000, // slower refresh for session data
    enabled: sessionJobIds.length > 0,
  })

  const sessions = sessionQueries.data ?? []

  const activeCount = active.length
  const queuedCount = queued.length
  const recentCount = recent.length

  const handleRefresh = async () => {
    await queryClient.invalidateQueries()
    toastManager.add({
      title: 'Refreshed',
      description: 'All data refreshed from server',
      type: 'success',
    })
  }

  if (isLoading && !data) {
    return (
      <div className="p-4 sm:p-8">
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

  return (
    <div className="p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header with counts and refresh */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
            <div className="mt-2 flex items-center gap-3">
              {activeCount > 0 && (
                <Badge variant="info" size="sm">
                  {activeCount} active
                </Badge>
              )}
              {queuedCount > 0 && (
                <Badge variant="warning" size="sm">
                  {queuedCount} queued
                </Badge>
              )}
              <Badge variant="outline" size="sm">
                {recentCount} recent
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
          >
            Refresh
          </Button>
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
            <TabsTab value="sessions">
              Sessions{sessions.length > 0 ? ` (${sessions.length})` : ''}
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

          <TabsPanel value="sessions">
            <SessionOverview sessions={sessions} />
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  )
}
