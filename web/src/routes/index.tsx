import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Tabs, TabsList, TabsTab, TabsPanel } from '~/components/ui/tabs'
import { Skeleton } from '~/components/ui/skeleton'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import { JobList } from '~/components/job-list'
import { SessionOverview } from '~/components/session-overview'
import { ProjectsList } from '~/components/projects-list'
import { getJobsListFn, getJobDetailFn, getProjectsListFn, getGraceConfigFn } from '~/lib/server-fns'
import { toastManager } from '~/components/ui/toast'
import type { SessionSummary } from '@pilot/core/types.js'

export const Route = createFileRoute('/')({
  loader: () => getJobsListFn(),
  component: Home,
})

function Home() {
  const loaderData = Route.useLoaderData()
  const queryClient = useQueryClient()

  // Adaptive polling: 3s when active jobs exist, 30s when idle
  const { data, isLoading } = useQuery({
    queryKey: ['jobs-list'],
    queryFn: () => getJobsListFn(),
    initialData: loaderData,
    refetchInterval: (query) => {
      const d = query.state.data
      if (d && (d.active.length > 0 || d.queued.length > 0)) return 3_000
      return 30_000
    },
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

  // Load projects list
  const projectsQuery = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => getProjectsListFn(),
    refetchInterval: 30_000,
  })
  const projects = projectsQuery.data ?? []

  // Load grace config for countdown badge
  const { data: graceConfig } = useQuery({
    queryKey: ['grace-config'],
    queryFn: () => getGraceConfigFn(),
    staleTime: 60_000, // config rarely changes
  })
  const queueGraceSeconds = graceConfig?.queueGraceSeconds ?? 0

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
        <div className="mx-auto max-w-[1800px] space-y-6">
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
      <div className="mx-auto max-w-[1800px] space-y-6">
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
            <TabsTab value="projects">
              Projects{projects.length > 0 ? ` (${projects.length})` : ''}
            </TabsTab>
          </TabsList>

          <TabsPanel value="active">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Running ({activeCount})
            </h2>
            {activeCount === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-base">All quiet</EmptyTitle>
                  <EmptyDescription>No jobs running or queued. Use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">pilot add</code> to queue a job.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <JobList data={{ active, queued: [], recent: [] }} queueGraceSeconds={queueGraceSeconds} />
            )}
          </TabsPanel>

          <TabsPanel value="queued">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Queued ({queuedCount})
            </h2>
            <JobList data={{ active: [], queued, recent: [] }} queueGraceSeconds={queueGraceSeconds} />
          </TabsPanel>

          <TabsPanel value="recent">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recent ({recentCount})
            </h2>
            <JobList data={{ active: [], queued: [], recent }} queueGraceSeconds={queueGraceSeconds} />
          </TabsPanel>

          <TabsPanel value="sessions">
            <SessionOverview sessions={sessions} />
          </TabsPanel>

          <TabsPanel value="projects">
            <ProjectsList projects={projects} />
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  )
}
