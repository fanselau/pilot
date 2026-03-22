import { useState, useMemo, useEffect } from 'react'
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
import { VerdictBadge } from '~/components/ui/status-badge'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Format grace countdown seconds as human-readable string: "1m 42s" or "42s" */
function formatGraceCountdown(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  return `${seconds}s`
}

/** Grace period badge with amber warning variant, animated pulse dot, and tooltip. */
function GraceBadge({ seconds }: { seconds: number }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="cursor-default">
          <Badge variant="warning" size="sm" className="gap-1 font-mono">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse opacity-75 shrink-0" />
            Grace: {formatGraceCountdown(seconds)}
          </Badge>
        </TooltipTrigger>
        <TooltipPopup className="max-w-xs text-xs">
          This job is in its grace period. It will launch automatically after the timer expires.
        </TooltipPopup>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Parse judgeVerdict JSON string into verdict + confidence. */
function parseJudgeVerdict(raw: string | null): { verdict: string | null; confidence: number | null } {
  if (!raw) return { verdict: null, confidence: null }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      verdict: typeof parsed.verdict === 'string' ? parsed.verdict : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    }
  } catch {
    return { verdict: null, confidence: null }
  }
}

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
    // Review states — warning/info, NOT destructive (not failures)
    case 'completed_pending_review':
      return 'warning' as const
    case 'review_hold':
      return 'info' as const
    default:
      return 'secondary' as const
  }
}

/** Human-readable label for job status strings. */
function statusLabel(status: string): string {
  switch (status) {
    case 'completed_pending_review': return 'review pending'
    case 'review_hold': return 'review hold'
    default: return status
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

function getGraceSecondsRemaining(job: Job, queueGraceSeconds: number): number | null {
  if (job.status !== 'pending') return null
  if (job.skipGracePeriod) return null
  if (queueGraceSeconds <= 0) return null

  const createdMs = Date.parse(job.createdAt)
  if (isNaN(createdMs)) return null

  const graceExpiryMs = createdMs + queueGraceSeconds * 1000
  const remaining = Math.ceil((graceExpiryMs - Date.now()) / 1000)
  return remaining > 0 ? remaining : null
}

// ── Sorting ──────────────────────────────────────────────────────────────

type SortField = 'status' | 'duration' | null
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  review_hold: 1,           // active pause — near top with running
  pending: 2,
  paused: 3,
  completed_pending_review: 4, // done but needs review
  failed: 5,
  cancelled: 6,
  completed: 7,
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

type ActivityPreviewEntry = { latestActivity: string | null; activityCount: number; stepCount: number }

function JobCard({ job, queueGraceSeconds = 0, queuePosition, activityPreview }: { job: Job; queueGraceSeconds?: number; queuePosition?: number; activityPreview?: ActivityPreviewEntry }) {
  const graceSeconds = getGraceSecondsRemaining(job, queueGraceSeconds)
  const { verdict, confidence } = parseJudgeVerdict(job.judgeVerdict)
  const isRunning = job.status === 'running'
  const isCompleted = job.status === 'completed' || job.status === 'failed'
  return (
    <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="block group">
      <Card className="transition-all duration-200 group-hover:bg-accent/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold">{job.id}</span>
              {isRunning && (
                <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              )}
              {graceSeconds != null ? (
                <GraceBadge seconds={graceSeconds} />
              ) : (
                <Badge variant={statusVariant(job.status)} size="sm">
                  {statusLabel(job.status)}
                </Badge>
              )}
              {queuePosition != null && (
                <Badge variant="outline" size="sm" className="text-[10px] font-mono">
                  #{queuePosition}
                </Badge>
              )}
              {isRunning && job.currentStep > 0 && (
                <Badge variant="outline" size="sm" className="text-[10px] font-mono">
                  #{job.currentStep}
                </Badge>
              )}
              {isCompleted && verdict && (
                <VerdictBadge verdict={verdict} confidence={confidence} />
              )}
              <Badge variant={scopeVariant(job.scope)} size="sm">
                {job.scope}
              </Badge>
              <Badge variant="outline" size="sm">
                {job.modelProfile}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm text-muted-foreground line-clamp-1">
                {truncate(job.description, 80)}
              </p>
              {job.categories?.slice(0, 3).map((cat) => (
                <Badge key={cat} variant="outline" size="sm" className="text-[10px]">
                  {cat}
                </Badge>
              ))}
              {job.dependsOn && (
                <Badge variant="outline" size="sm" className="text-[10px] font-mono">
                  → {job.dependsOn}
                </Badge>
              )}
            </div>
            {activityPreview?.latestActivity && (
              <p className="text-xs text-muted-foreground/70 font-mono line-clamp-1 mt-0.5">
                {activityPreview.latestActivity.length > 80
                  ? activityPreview.latestActivity.slice(0, 80) + '\u2026'
                  : activityPreview.latestActivity}
              </p>
            )}
            {activityPreview && activityPreview.stepCount > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <Badge variant="outline" size="sm" className="text-[10px]">
                  {activityPreview.stepCount} steps
                </Badge>
                {activityPreview.activityCount > 0 && (
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    {activityPreview.activityCount} items
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="ml-4 flex shrink-0 flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">
              {shortProject(job.project)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {isRunning
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

function JobTable({ jobs, queueGraceSeconds = 0, queuePositionMap, activityPreviews }: { jobs: Job[]; queueGraceSeconds?: number; queuePositionMap?: Map<string, number>; activityPreviews?: ActivityPreviewMap }) {
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
              className="w-28"
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
            const isCompleted = job.status === 'completed' || job.status === 'failed'
            const graceSeconds = getGraceSecondsRemaining(job, queueGraceSeconds)
            const queuePos = queuePositionMap?.get(job.id)
            const { verdict, confidence } = parseJudgeVerdict(job.judgeVerdict)
            const activityPreview = activityPreviews?.[job.id]
            return (
              <TableRow
                key={job.id}
                className={[
                  'cursor-pointer transition-colors duration-150 hover:bg-white/[0.03]',
                  isRunning ? 'border-l-2 border-sky-400' : '',
                ].join(' ')}
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
                  <div className="flex items-center gap-1 flex-wrap">
                    {graceSeconds != null ? (
                      <GraceBadge seconds={graceSeconds} />
                    ) : (
                      <Badge
                        variant={statusVariant(job.status)}
                        size="sm"
                        className={isRunning ? 'animate-pulse' : ''}
                      >
                        {statusLabel(job.status)}
                      </Badge>
                    )}
                    {queuePos != null && (
                      <Badge variant="outline" size="sm" className="text-[10px] font-mono text-muted-foreground">
                        #{queuePos}
                      </Badge>
                    )}
                    {isRunning && job.currentStep > 0 && (
                      <Badge variant="outline" size="sm" className="text-[10px] font-mono">
                        #{job.currentStep}
                      </Badge>
                    )}
                    {activityPreview && activityPreview.stepCount > 0 && (
                      <Badge variant="outline" size="sm" className="text-[10px] font-mono text-muted-foreground">
                        {activityPreview.stepCount}s
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={scopeVariant(job.scope)} size="sm">
                    {job.scope}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {shortProject(job.project)}
                </TableCell>
                <TableCell className="max-w-[300px]">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {job.description.length > 60 ? (
                      <Tooltip>
                        <TooltipTrigger className="cursor-default text-left text-sm text-muted-foreground truncate">
                          {desc}
                        </TooltipTrigger>
                        <TooltipPopup className="max-w-xs">
                          {job.description}
                        </TooltipPopup>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground truncate">{desc}</span>
                    )}
                    {job.categories?.slice(0, 3).map((cat) => (
                      <Badge key={cat} variant="outline" size="sm" className="text-[10px]">
                        {cat}
                      </Badge>
                    ))}
                    {job.dependsOn && (
                      <Tooltip>
                        <TooltipTrigger className="cursor-default">
                          <Badge variant="outline" size="sm" className="text-[10px] font-mono">
                            → {job.dependsOn}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipPopup>Depends on job {job.dependsOn}</TooltipPopup>
                      </Tooltip>
                    )}
                    {isCompleted && verdict && (
                      <VerdictBadge verdict={verdict} confidence={confidence} />
                    )}
                  </div>
                  {activityPreview?.latestActivity && (
                    <p className="text-[10px] text-muted-foreground/60 font-mono line-clamp-1 mt-0.5">
                      {activityPreview.latestActivity.length > 100
                        ? activityPreview.latestActivity.slice(0, 100) + '\u2026'
                        : activityPreview.latestActivity}
                    </p>
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
  queueGraceSeconds = 0,
  queuePositionMap,
  activityPreviews,
}: {
  jobs: Job[]
  emptyMessage: string
  isMobile: boolean
  queueGraceSeconds?: number
  queuePositionMap?: Map<string, number>
  activityPreviews?: ActivityPreviewMap
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
          <JobCard key={job.id} job={job} queueGraceSeconds={queueGraceSeconds} queuePosition={queuePositionMap?.get(job.id)} activityPreview={activityPreviews?.[job.id]} />
        ))}
      </div>
    )
  }

  return <JobTable jobs={jobs} queueGraceSeconds={queueGraceSeconds} queuePositionMap={queuePositionMap} activityPreviews={activityPreviews} />
}

// ── Main Export ───────────────────────────────────────────────────────────

export interface JobListData {
  active: Job[]
  queued: Job[]
  recent: Job[]
}

export type ActivityPreviewMap = Record<string, { latestActivity: string | null; activityCount: number; stepCount: number }>

/**
 * Renders a single job list section (active OR queued OR recent).
 * Pass only the relevant section in the data prop — the component
 * will render whichever array is non-empty.
 */
export function JobList({ data, queueGraceSeconds = 0, activityPreviews }: { data: JobListData; queueGraceSeconds?: number; activityPreviews?: ActivityPreviewMap }) {
  const isMobile = useIsMobile()

  // Build queue position map: queued array order = queue order
  const queuePositionMap = useMemo(() => {
    const map = new Map<string, number>()
    data.queued.forEach((job, i) => map.set(job.id, i + 1))
    return map
  }, [data.queued])

  // Auto-refresh every second when any pending job has a grace countdown
  const [, setTick] = useState(0)
  const hasGraceCountdown = useMemo(() => {
    if (queueGraceSeconds <= 0) return false
    return [...data.active, ...data.queued].some(
      (job) => getGraceSecondsRemaining(job, queueGraceSeconds) != null,
    )
  }, [data.active, data.queued, queueGraceSeconds])

  useEffect(() => {
    if (!hasGraceCountdown) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [hasGraceCountdown])

  return (
    <div className="space-y-2">
      {data.active.length > 0 && (
        <JobSection jobs={data.active} emptyMessage="No active jobs" isMobile={isMobile} queueGraceSeconds={queueGraceSeconds} activityPreviews={activityPreviews} />
      )}
      {data.queued.length > 0 && (
        <JobSection jobs={data.queued} emptyMessage="No queued jobs" isMobile={isMobile} queueGraceSeconds={queueGraceSeconds} queuePositionMap={queuePositionMap} activityPreviews={activityPreviews} />
      )}
      {data.recent.length > 0 && (
        <JobSection jobs={data.recent} emptyMessage="No recent jobs" isMobile={isMobile} queueGraceSeconds={queueGraceSeconds} activityPreviews={activityPreviews} />
      )}
      {data.active.length === 0 && data.queued.length === 0 && data.recent.length === 0 && (
        <JobSection jobs={[]} emptyMessage="No jobs" isMobile={isMobile} queueGraceSeconds={queueGraceSeconds} />
      )}
    </div>
  )
}
