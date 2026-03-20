import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import { JobList } from '~/components/job-list'
import { toastManager } from '~/components/ui/toast'
import {
  getProjectDetailFn,
  getProjectJobsFn,
  unblockProjectFn,
  blockProjectFn,
  getGraceConfigFn,
} from '~/lib/server-fns'

export const Route = createFileRoute('/projects/$projectPath')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectPath } = Route.useParams()
  const decodedPath = decodeURIComponent(projectPath)
  const queryClient = useQueryClient()

  const { data: project } = useQuery({
    queryKey: ['project-detail', decodedPath],
    queryFn: () => getProjectDetailFn({ data: decodedPath }),
    refetchInterval: 10_000,
  })

  const { data: jobs } = useQuery({
    queryKey: ['project-jobs', decodedPath],
    queryFn: () => getProjectJobsFn({ data: { projectPath: decodedPath } }),
    refetchInterval: 10_000,
  })

  const { data: graceConfig } = useQuery({
    queryKey: ['grace-config'],
    queryFn: () => getGraceConfigFn(),
    staleTime: 60_000,
  })
  const queueGraceSeconds = graceConfig?.queueGraceSeconds ?? 0

  if (!project) {
    return (
      <div className="p-4 sm:p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Project not found</EmptyTitle>
            <EmptyDescription>{decodedPath}</EmptyDescription>
          </EmptyHeader>
          <Link to="/">
            <Button variant="outline">&larr; Dashboard</Button>
          </Link>
        </Empty>
      </div>
    )
  }

  const isBlocked = project.status === 'blocked'
  const shortName = decodedPath.split('/').pop() ?? decodedPath

  const handleUnblock = async () => {
    const result = await unblockProjectFn({ data: { projectPath: decodedPath } })
    if (result.ok) {
      toastManager.add({
        title: 'Unblocked',
        description: `${shortName} unblocked`,
        type: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['project-detail', decodedPath] })
    }
  }

  const handleBlock = async () => {
    const result = await blockProjectFn({
      data: { projectPath: decodedPath, reason: 'Manually blocked via web UI' },
    })
    if (result.ok) {
      toastManager.add({
        title: 'Blocked',
        description: `${shortName} blocked`,
        type: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['project-detail', decodedPath] })
    }
  }

  const jobList = jobs ?? []

  return (
    <div className="p-4 sm:p-8">
      <div className="mx-auto max-w-[1800px] space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  &larr; Dashboard
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">{shortName}</h1>
              <Badge variant={isBlocked ? 'destructive' : 'success'} size="sm">
                {project.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground font-mono">{decodedPath}</p>
          </div>
          <div className="flex gap-2">
            {isBlocked ? (
              <Button variant="default" size="sm" onClick={() => void handleUnblock()}>
                Unblock
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void handleBlock()}>
                Block
              </Button>
            )}
          </div>
        </div>

        {/* Project info cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Owner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{project.owner ?? '\u2014'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{project.activeJobCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{project.completedJobCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold text-destructive">{project.failedJobCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Blocked reason */}
        {isBlocked && project.blockedReason && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Blocked Reason</p>
            <p className="mt-1 text-sm text-muted-foreground">{project.blockedReason}</p>
          </div>
        )}

        {/* Categories */}
        {project.defaultCategories && project.defaultCategories.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Default Categories
            </h3>
            <div className="flex flex-wrap gap-1">
              {project.defaultCategories.map((cat: string) => (
                <Badge key={cat} variant="outline" size="sm">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Job history */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Job History
          </h3>
          <JobList
            data={{
              active: jobList.filter((j) => j.status === 'running'),
              queued: jobList.filter((j) => j.status === 'pending'),
              recent: jobList.filter((j) => !['running', 'pending'].includes(j.status)),
            }}
            queueGraceSeconds={queueGraceSeconds}
          />
        </div>
      </div>
    </div>
  )
}
