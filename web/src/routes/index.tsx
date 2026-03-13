import { createFileRoute } from '@tanstack/react-router'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { getJobsListFn } from '~/lib/server-fns'

export const Route = createFileRoute('/')({
  loader: () => getJobsListFn(),
  component: Home,
})

function Home() {
  const { active, queued, recent } = Route.useLoaderData()

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Pilot Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Autonomous AI development pipeline
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{active.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Queued
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{queued.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{recent.length}</div>
            </CardContent>
          </Card>
        </div>

        {active.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Running</h2>
            {active.map((job) => (
              <Card key={job.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{job.id}</span>
                      <Badge variant="default">running</Badge>
                      <Badge variant="outline">{job.scope}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {job.description}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {job.project.split('/').pop()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {queued.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Pending</h2>
            {queued.map((job) => (
              <Card key={job.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{job.id}</span>
                      <Badge variant="secondary">pending</Badge>
                      <Badge variant="outline">{job.scope}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {job.description}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {job.project.split('/').pop()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Recent</h2>
            {recent.slice(0, 10).map((job) => (
              <Card key={job.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{job.id}</span>
                      <Badge
                        variant={
                          job.status === 'completed'
                            ? 'default'
                            : job.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {job.status}
                      </Badge>
                      <Badge variant="outline">{job.scope}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {job.description}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {job.project.split('/').pop()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
