import { Link } from '@tanstack/react-router'
import type { Job } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'

// ── Helpers ──────────────────────────────────────────────────────────────

function statusVariant(status: string) {
  switch (status) {
    case 'running':
      return 'info' as const
    case 'pending':
      return 'warning' as const
    case 'completed':
      return 'success' as const
    case 'failed':
      return 'destructive' as const
    case 'cancelled':
      return 'secondary' as const
    case 'paused':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

function scopeVariant(scope: string) {
  switch (scope) {
    case 'quick':
      return 'outline' as const
    case 'phase':
      return 'secondary' as const
    case 'milestone':
      return 'default' as const
    default:
      return 'outline' as const
  }
}

function shortProject(project: string): string {
  return project.split('/').pop() ?? project
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '\u2014'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const diffMs = end - start
  const mins = Math.floor(diffMs / 60_000)
  const secs = Math.floor((diffMs % 60_000) / 1_000)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

// ── Job Card ─────────────────────────────────────────────────────────────

function JobCard({ job }: { job: Job }) {
  return (
    <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="block group">
      <Card className="transition-colors group-hover:bg-accent/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold">{job.id}</span>
              <Badge variant={statusVariant(job.status)} size="sm">
                {job.status}
              </Badge>
              <Badge variant={scopeVariant(job.scope)} size="sm">
                {job.scope}
              </Badge>
              <Badge variant="outline" size="sm">
                {job.modelProfile}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {truncate(job.description, 80)}
            </p>
          </div>
          <div className="ml-4 flex shrink-0 flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">
              {shortProject(job.project)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {job.status === 'running'
                ? formatDuration(job.startedAt, null)
                : formatDuration(job.startedAt, job.completedAt)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// ── Section ──────────────────────────────────────────────────────────────

function JobSection({ jobs, emptyMessage }: { jobs: Job[]; emptyMessage: string }) {
  if (jobs.length === 0) {
    return (
      <Empty className="py-8 md:py-8">
        <EmptyHeader>
          <EmptyTitle className="text-base">{emptyMessage}</EmptyTitle>
          <EmptyDescription>Jobs will appear here when available.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────

export interface JobListData {
  active: Job[]
  queued: Job[]
  recent: Job[]
}

export function JobList({ data }: { data: JobListData }) {
  return (
    <div className="space-y-2">
      <JobSection jobs={data.active} emptyMessage="No active jobs" />
      <JobSection jobs={data.queued} emptyMessage="No queued jobs" />
      <JobSection jobs={data.recent} emptyMessage="No recent jobs" />
    </div>
  )
}
