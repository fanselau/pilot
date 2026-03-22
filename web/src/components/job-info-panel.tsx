/**
 * JobInfoPanel — unified Info sheet for job detail.
 *
 * Consolidates all job context (status, timestamps, identity, observability,
 * verdict, git, recovery) and working actions into a single Sheet-based
 * secondary surface. Replaces the fragmented top-bar actions + meta tab.
 */

import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { JobDetailSnapshot } from '@pilot/core/types.js'
import { parseSqliteTimestamp } from '~/lib/time-utils'
import { formatDurationMs, shortProject } from '~/components/job-detail'
import { useActions, type ActionContextInput } from '~/lib/use-actions'
import { useIsMobile } from '~/hooks/use-media-query'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetPanel,
} from '~/components/ui/sheet'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { CopyButton } from '~/components/ui/copy-button'
import { StatusBadge, VerdictBadge } from '~/components/ui/status-badge'
import { ObservabilityCard } from '~/components/observability-card'
import { VerdictCard } from '~/components/verdict-card'
import { GitCheckpointCard } from '~/components/git-checkpoint-card'

// ── Types ─────────────────────────────────────────────────────────────────

interface JobInfoPanelProps {
  snapshot: JobDetailSnapshot
  isActive: boolean
  trigger: React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format a timestamp for local-timezone display using toLocaleString. */
function formatLocalTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = parseSqliteTimestamp(iso)
  if (ms === null) return '—'
  // new Date(utcMs).toLocaleString() renders in user's local timezone
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DESTRUCTIVE_ACTIONS = new Set(['cancel-job', 'force-quit-job'])

// ── Component ─────────────────────────────────────────────────────────────

export function JobInfoPanel({ snapshot, isActive, trigger }: JobInfoPanelProps) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { job } = snapshot

  // Action context for job-level actions
  const actionCtx: ActionContextInput = {
    job: { id: job.id, status: job.status, project: job.project },
    projectPath: job.project,
    navigate: (to) => navigate({ to }),
  }
  const { actions, executeAction } = useActions(actionCtx)
  const jobActions = actions.filter((a) => a.definition.group === 'job')

  // Live duration calculation for active jobs
  const now = Date.now()
  const duration = job.durationMs
    ? formatDurationMs(job.durationMs)
    : job.startedAt
      ? formatDurationMs(now - (parseSqliteTimestamp(job.startedAt) ?? now))
      : '—'

  const isTerminal = [
    'completed',
    'failed',
    'cancelled',
    'completed_pending_review',
    'review_hold',
  ].includes(job.status)

  const isUndoable = !!(
    job.gitBaseCommit &&
    job.gitHeadCommit &&
    job.gitBaseCommit !== job.gitHeadCommit
  )
  const isPendingReview =
    job.status === 'completed_pending_review' || job.status === 'review_hold'

  const hasGit = !!(job.gitBaseCommit || job.gitHeadCommit)
  const hasRecovery = isUndoable || isPendingReview

  return (
    <Sheet>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side={isMobile ? 'bottom' : 'right'}>
        <SheetHeader>
          <SheetTitle>Job Info</SheetTitle>
        </SheetHeader>

        <SheetPanel>
          {/* ── Status section ─────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-1.5 pb-3">
            <StatusBadge status={job.status} pulse={isActive} />
            {job.verdict && <VerdictBadge verdict={job.verdict} />}
            <Badge variant="outline" size="sm">
              {job.scope}
            </Badge>
            {isPendingReview && (
              <Badge variant="warning" size="sm">
                review pending
              </Badge>
            )}
          </div>

          <Separator />

          {/* ── Timestamps section ─────────────────────────────────────── */}
          <div className="space-y-1.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Timestamps
            </p>
            <div className="space-y-1">
              {job.createdAt && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-mono">{formatLocalTime(job.createdAt)}</span>
                </div>
              )}
              {job.startedAt && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-mono">{formatLocalTime(job.startedAt)}</span>
                </div>
              )}
              {isTerminal && job.completedAt && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-mono">{formatLocalTime(job.completedAt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono">{duration}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Identity section ───────────────────────────────────────── */}
          <div className="space-y-1.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Identity
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground w-14 shrink-0">Job ID</span>
                <code className="font-mono flex-1 truncate">{job.id}</code>
                <CopyButton text={job.id} label="Copy Job ID" />
              </div>
              <div className="flex items-start gap-1.5 text-xs">
                <span className="text-muted-foreground w-14 shrink-0">Project</span>
                <span
                  className="font-mono flex-1 truncate"
                  title={job.project}
                >
                  {shortProject(job.project)}
                </span>
                <CopyButton text={job.project} label="Copy project path" />
              </div>
              {job.description && (
                <p className="text-xs text-muted-foreground leading-snug pt-0.5">
                  {job.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1 pt-0.5">
                <Badge variant="outline" size="sm">
                  {job.scope}
                </Badge>
                <Badge variant="outline" size="sm">
                  {job.modelProfile}
                </Badge>
                <Badge variant="outline" size="sm">
                  {job.providerMode}
                </Badge>
              </div>
            </div>
          </div>

          {/* ── Observability card — edge-to-edge ──────────────────────── */}
          <div className="-mx-6">
            <ObservabilityCard jobId={job.id} isActive={isActive} />
          </div>

          {/* ── Verdict card — edge-to-edge ────────────────────────────── */}
          <div className="-mx-6">
            <VerdictCard jobId={job.id} />
          </div>

          {/* ── Git section — edge-to-edge ─────────────────────────────── */}
          {hasGit && (
            <div className="-mx-6">
              <GitCheckpointCard
                gitBaseCommit={job.gitBaseCommit ?? null}
                gitHeadCommit={job.gitHeadCommit ?? null}
                startedDirty={job.startedDirty}
              />
            </div>
          )}

          {/* ── Recovery / undo context ────────────────────────────────── */}
          {hasRecovery && (
            <>
              <Separator />
              <div className="space-y-1.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recovery
                </p>
                {isUndoable && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="info" size="sm">
                      Undoable
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Changes can be reverted to base commit
                    </span>
                  </div>
                )}
                {isPendingReview && (
                  <Badge variant="warning" size="sm">
                    Review Required
                  </Badge>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* ── Actions section ────────────────────────────────────────── */}
          <div className="space-y-2 pt-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Actions
            </p>
            <div className="space-y-1.5">
              {/* Copy job ID */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => void navigator.clipboard.writeText(job.id)}
              >
                Copy Job ID
              </Button>

              {/* Copy pilot info command */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() =>
                  void navigator.clipboard.writeText(`pilot info ${job.id}`)
                }
              >
                Copy: pilot info {job.id}
              </Button>

              {/* Job actions from registry (retry, cancel, force-quit) */}
              {jobActions.map((resolved) => (
                <div key={resolved.definition.id}>
                  <Button
                    variant={
                      DESTRUCTIVE_ACTIONS.has(resolved.definition.id)
                        ? 'destructive'
                        : 'outline'
                    }
                    size="sm"
                    className="w-full justify-start text-xs"
                    disabled={!resolved.enabled}
                    onClick={() => {
                      if (resolved.enabled)
                        void executeAction(resolved.definition.id)
                    }}
                  >
                    {resolved.definition.label}
                  </Button>
                  {!resolved.enabled && resolved.disabledReason && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {resolved.disabledReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </SheetPanel>
      </SheetContent>
    </Sheet>
  )
}
