import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  JobDetailSnapshot,
  JobStepSummary,
  SessionSummary,
  ActivityPreviewItem,
} from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { SubagentCard } from '~/components/subagent-card'
import { SessionActivity } from '~/components/session-activity'
import { useJobDetailStream } from '~/lib/sse'

// ── Shared helpers ───────────────────────────────────────────────────────

function statusVariant(status: string) {
  switch (status) {
    case 'running':
    case 'active':
      return 'info' as const
    case 'pending':
      return 'warning' as const
    case 'completed':
    case 'done':
      return 'success' as const
    case 'failed':
      return 'destructive' as const
    case 'cancelled':
    case 'skipped':
      return 'secondary' as const
    case 'paused':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

function verdictVariant(verdict: string | null) {
  if (!verdict) return 'outline' as const
  switch (verdict.toLowerCase()) {
    case 'succeeded':
    case 'pass':
      return 'success' as const
    case 'failed':
    case 'fail':
      return 'destructive' as const
    case 'doubting':
    case 'inconclusive':
      return 'warning' as const
    default:
      return 'outline' as const
  }
}

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '\u2014'
  const secs = Math.floor(ms / 1_000)
  const mins = Math.floor(secs / 60)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

function formatTime(iso: string | null): string {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEpochTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function shortProject(project: string): string {
  return project.split('/').pop() ?? project
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Job Header ───────────────────────────────────────────────────────────

function JobHeader({ job }: { job: JobDetailSnapshot['job'] }) {
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(job.status)
  const duration = job.durationMs
    ? formatDurationMs(job.durationMs)
    : job.startedAt
      ? formatDurationMs(Date.now() - new Date(job.startedAt).getTime())
      : '\u2014'

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-mono">{job.id}</CardTitle>
          <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
          {job.verdict && (
            <Badge variant={verdictVariant(job.verdict)}>{job.verdict}</Badge>
          )}
          <Badge variant="outline">{job.scope}</Badge>
          <Badge variant="outline">{job.modelProfile}</Badge>
          <Badge variant="outline">{job.providerMode}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{job.description}</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Project: </span>
            <span className="font-medium">{shortProject(job.project)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Duration: </span>
            <span className="font-mono">{duration}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Step: </span>
            <span className="font-mono">{job.currentStep}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Created: </span>
            <span>{formatTime(job.createdAt)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Started: </span>
            <span>{formatTime(job.startedAt)}</span>
          </div>
          {isTerminal && (
            <div>
              <span className="text-muted-foreground">Completed: </span>
              <span>{formatTime(job.completedAt)}</span>
            </div>
          )}
        </div>
        {job.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <span className="font-medium">Error: </span>
            {job.error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Step Timeline ────────────────────────────────────────────────────────

function StepTimeline({ steps }: { steps: JobStepSummary[] }) {
  if (steps.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Steps
      </h3>
      <Card>
        <CardContent className="py-2">
          <div className="divide-y divide-border/50">
            {steps.map((step) => (
              <div
                key={step.stepIndex}
                className="flex items-center gap-3 py-2"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground w-6 text-right">
                  {step.stepIndex}
                </span>
                <Badge variant={statusVariant(step.status)} size="sm">
                  {step.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{step.command}</span>
                  {step.args && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {truncate(step.args, 60)}
                    </span>
                  )}
                  {step.verdictReason && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {step.verdictReason}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDurationMs(step.durationMs)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Root Sessions ────────────────────────────────────────────────────────

function RootSessionList({
  sessions,
  jobId,
}: {
  sessions: SessionSummary[]
  jobId: string
}) {
  if (sessions.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Root Sessions
      </h3>
      <div className="space-y-2">
        {sessions.map((session) => (
          <Collapsible key={session.sessionId}>
            <Card>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {session.title || 'Root session'}
                      </span>
                      <Badge
                        variant={statusVariant(session.status)}
                        size="sm"
                      >
                        {session.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {session.messageCount} msgs
                      </span>
                      {session.tokenTotal > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {formatTokens(session.tokenTotal)} tokens
                        </span>
                      )}
                    </div>
                    {session.latestMessagePreview && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {truncate(session.latestMessagePreview, 120)}
                      </p>
                    )}
                    {session.models.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {session.models.map((model) => (
                          <Badge key={model} variant="outline" size="sm">
                            {model.split('/').pop() ?? model}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                    <span>{formatDurationMs(session.durationMs)}</span>
                    {session.childCount > 0 && (
                      <span>{session.childCount} children</span>
                    )}
                  </div>
                </div>

                <CollapsibleTrigger className="mt-2 text-xs text-primary hover:underline">
                  Show activity
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Separator className="my-2" />
                  <SessionActivity sessionId={session.sessionId} />
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  )
}

// ── Subagent Section ─────────────────────────────────────────────────────

function SubagentSection({
  subagents,
  jobId,
}: {
  subagents: SessionSummary[]
  jobId: string
}) {
  if (subagents.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Sub-agents ({subagents.length})
      </h3>
      <div className="space-y-2">
        {subagents.map((agent) => (
          <SubagentCard
            key={agent.sessionId}
            session={agent}
            jobId={jobId}
          />
        ))}
      </div>
    </div>
  )
}

// ── Activity Preview ─────────────────────────────────────────────────────

function ActivityPreview({ items }: { items: ActivityPreviewItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Recent Activity
      </h3>
      <Card>
        <CardContent className="py-2">
          <div className="divide-y divide-border/50">
            {items.map((item) => (
              <div key={item.partId} className="flex items-start gap-2 py-1.5">
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums mt-0.5">
                  {formatEpochTime(item.createdAt)}
                </span>
                <Badge
                  variant={
                    item.type === 'tool'
                      ? 'info'
                      : item.type === 'patch'
                        ? 'warning'
                        : 'secondary'
                  }
                  size="sm"
                >
                  {item.type}
                </Badge>
                {item.tool && (
                  <Badge variant="info" size="sm">
                    {item.tool}
                  </Badge>
                )}
                <span className="min-w-0 flex-1 text-xs text-muted-foreground line-clamp-2">
                  {truncate(item.preview, 150)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────

interface JobDetailProps {
  snapshot: JobDetailSnapshot
}

export function JobDetail({ snapshot }: JobDetailProps) {
  const queryClient = useQueryClient()
  const { job, steps, rootSessions, subagents, activityPreview, cursor } =
    snapshot

  const isActive = job.status === 'running' || job.status === 'pending'

  // Live updates via SSE-style polling
  const { events } = useJobDetailStream(job.id, cursor, isActive, 3000)

  // Invalidate job detail cache when new events arrive
  useEffect(() => {
    if (events.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['job-detail', job.id] })
    }
  }, [events.length, job.id, queryClient])

  return (
    <div className="space-y-6">
      <JobHeader job={job} />
      <StepTimeline steps={steps} />
      <RootSessionList sessions={rootSessions} jobId={job.id} />
      <SubagentSection subagents={subagents} jobId={job.id} />
      <ActivityPreview items={activityPreview} />
    </div>
  )
}
