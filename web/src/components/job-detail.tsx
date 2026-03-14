/**
 * Job detail component — merged chronological timeline view.
 *
 * Presents proactive actions and a step-first timeline stream as
 * the primary execution story.
 */

import { useNavigate } from '@tanstack/react-router'
import type { JobDetailSnapshot } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipProvider,
} from '~/components/ui/tooltip'
import { TimelineStream } from '~/components/timeline-stream'
import { useActions, type ActionContextInput } from '~/lib/use-actions'

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

function shortProject(project: string): string {
  return project.split('/').pop() ?? project
}

// ── Action button variant mapping ────────────────────────────────────────

const DESTRUCTIVE_ACTIONS = new Set(['cancel-job', 'force-quit-job'])

function actionButtonVariant(actionId: string) {
  if (DESTRUCTIVE_ACTIONS.has(actionId)) return 'destructive' as const
  return 'default' as const
}

// ── Job Header with Action Buttons ───────────────────────────────────────

function JobHeader({
  job,
  actionCtx,
}: {
  job: JobDetailSnapshot['job']
  actionCtx: ActionContextInput
}) {
  const { actions, executeAction } = useActions(actionCtx)
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(job.status)
  const now = Date.now()
  const duration = job.durationMs
    ? formatDurationMs(job.durationMs)
    : job.startedAt
      ? formatDurationMs(now - new Date(job.startedAt).getTime())
      : '\u2014'

  // Filter to only job-level actions (retry, cancel, force-quit)
  const jobActions = actions.filter(
    (a) => a.definition.group === 'job',
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="font-mono">{job.id}</CardTitle>
            <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
            {job.verdict && (
              <Badge variant={verdictVariant(job.verdict)}>
                {job.verdict}
              </Badge>
            )}
            <Badge variant="outline">{job.scope}</Badge>
            <Badge variant="outline">{job.modelProfile}</Badge>
            <Badge variant="outline">{job.providerMode}</Badge>
          </div>

          {/* Proactive action buttons */}
          {jobActions.length > 0 && (
            <TooltipProvider>
              <div className="flex items-center gap-2">
                {jobActions.map((resolved) => (
                  <Tooltip key={resolved.definition.id}>
                    <TooltipTrigger
                      render={
                        <Button
                          variant={actionButtonVariant(resolved.definition.id)}
                          size="sm"
                          disabled={!resolved.enabled}
                          onClick={() => {
                            if (resolved.enabled) {
                              void executeAction(resolved.definition.id)
                            }
                          }}
                        />
                      }
                    >
                      {resolved.definition.label}
                    </TooltipTrigger>
                    {!resolved.enabled && resolved.disabledReason && (
                      <TooltipPopup>{resolved.disabledReason}</TooltipPopup>
                    )}
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{job.description}</p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 md:grid-cols-3">
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

// ── Main Component ───────────────────────────────────────────────────────

interface JobDetailProps {
  snapshot: JobDetailSnapshot
}

export function JobDetail({ snapshot }: JobDetailProps) {
  const navigate = useNavigate()
  const { job } = snapshot

  const isActive = job.status === 'running' || job.status === 'pending'

  // Action context for proactive buttons
  const actionCtx: ActionContextInput = {
    job: { id: job.id, status: job.status, project: job.project },
    projectPath: job.project,
    navigate: (to) => navigate({ to }),
  }

  return (
    <div className="space-y-6">
      <JobHeader job={job} actionCtx={actionCtx} />
      <TimelineStream jobId={job.id} isActive={isActive} />
    </div>
  )
}
