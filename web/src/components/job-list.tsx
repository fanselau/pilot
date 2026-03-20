import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import type { Job } from '@pilot/core/types.js'
import { formatDurationSafe, getDurationMsSafe } from '~/lib/time-utils'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '~/components/ui/table'
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipProvider,
} from '~/components/ui/tooltip'
import { useIsMobile } from '~/hooks/use-media-query'

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
  return formatDurationSafe(startedAt, completedAt)
}

// ── Sorting ──────────────────────────────────────────────────────────────

type SortField = 'status' | 'duration' | null
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  pending: 1,
  paused: 2,
  failed: 3,
  cancelled: 4,
  completed: 5,
}

function getDurationMs(job: Job): number {
  return getDurationMsSafe(job.startedAt, job.completedAt)
}

function sortJobs(jobs: Job[], field: SortField, dir: SortDir): Job[] {
  if (!field) return jobs
  return [...jobs].sort((a, b) => {
    let cmp = 0
    if (field === 'status') {
      cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    } else if (field === 'duration') {
      cmp = getDurationMs(a) - getDurationMs(b)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Sort header helper ───────────────────────────────────────────────────

function SortableHead({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string
  field: SortField
  currentField: SortField
  currentDir: SortDir
  onSort: (field: SortField) => void
  className?: string
}) {
  const active = currentField === field
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ''}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="text-xs">{currentDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </TableHead>
  )
}

// ── Job Card (mobile fallback) ───────────────────────────────────────────

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

// ── Job Table (desktop) ──────────────────────────────────────────────────

function JobTable({ jobs }: { jobs: Job[] }) {
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(
    () => sortJobs(jobs, sortField, sortDir),
    [jobs, sortField, sortDir],
  )

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <SortableHead
              label="Status"
              field="status"
              currentField={sortField}
              currentDir={sortDir}
              onSort={handleSort}
              className="w-24"
            />
            <TableHead className="w-20">Scope</TableHead>
            <TableHead className="w-28">Project</TableHead>
            <TableHead>Description</TableHead>
            <SortableHead
              label="Duration"
              field="duration"
              currentField={sortField}
              currentDir={sortDir}
              onSort={handleSort}
              className="w-24 text-right"
            />
            <TableHead className="w-24">Model</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((job) => {
            const desc = truncate(job.description, 60)
            const isRunning = job.status === 'running'
            return (
              <TableRow
                key={job.id}
                className="cursor-pointer"
              >
                <TableCell>
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: job.id }}
                    className="font-mono text-sm font-bold hover:underline"
                  >
                    {job.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={statusVariant(job.status)}
                    size="sm"
                    className={isRunning ? 'animate-pulse' : ''}
                  >
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={scopeVariant(job.scope)} size="sm">
                    {job.scope}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {shortProject(job.project)}
                </TableCell>
                <TableCell>
                  {job.description.length > 60 ? (
                    <Tooltip>
                      <TooltipTrigger className="cursor-default text-left text-sm text-muted-foreground">
                        {desc}
                      </TooltipTrigger>
                      <TooltipPopup className="max-w-xs">
                        {job.description}
                      </TooltipPopup>
                    </Tooltip>
                  ) : (
                    <span className="text-sm text-muted-foreground">{desc}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {isRunning
                    ? formatDuration(job.startedAt, null)
                    : formatDuration(job.startedAt, job.completedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" size="sm">
                    {job.modelProfile}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}

// ── Section (table or card depending on device) ──────────────────────────

function JobSection({
  jobs,
  emptyMessage,
  isMobile,
}: {
  jobs: Job[]
  emptyMessage: string
  isMobile: boolean
}) {
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

  if (isMobile) {
    return (
      <div className="space-y-2">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    )
  }

  return <JobTable jobs={jobs} />
}

// ── Main Export ───────────────────────────────────────────────────────────

export interface JobListData {
  active: Job[]
  queued: Job[]
  recent: Job[]
}

/**
 * Renders a single job list section (active OR queued OR recent).
 * Pass only the relevant section in the data prop — the component
 * will render whichever array is non-empty.
 */
export function JobList({ data }: { data: JobListData }) {
  const isMobile = useIsMobile()

  return (
    <div className="space-y-2">
      {data.active.length > 0 && (
        <JobSection jobs={data.active} emptyMessage="No active jobs" isMobile={isMobile} />
      )}
      {data.queued.length > 0 && (
        <JobSection jobs={data.queued} emptyMessage="No queued jobs" isMobile={isMobile} />
      )}
      {data.recent.length > 0 && (
        <JobSection jobs={data.recent} emptyMessage="No recent jobs" isMobile={isMobile} />
      )}
      {data.active.length === 0 && data.queued.length === 0 && data.recent.length === 0 && (
        <JobSection jobs={[]} emptyMessage="No jobs" isMobile={isMobile} />
      )}
    </div>
  )
}
