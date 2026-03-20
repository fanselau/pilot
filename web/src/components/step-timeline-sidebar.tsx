/**
 * Step timeline sidebar — left pane of the split-pane job detail.
 *
 * Displays compact job metadata (status, scope, description, duration),
 * model badges showing actual models used (derived from session data),
 * and a keyboard-navigable clickable list of all step groups.
 *
 * Sidebar is navigation-only: clicking a step triggers scrollIntoView
 * in the content pane. The highlighted step is driven by scroll-spy,
 * not user selection.
 */

import { useRef } from 'react'
import type { JobDetailSnapshot, StepTimelineGroup } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { parseSqliteTimestamp } from '~/lib/time-utils'

// ── Status helpers ────────────────────────────────────────────────────────

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
    default:
      return 'secondary' as const
  }
}

function stepStatusVariant(status: string) {
  switch (status) {
    case 'running':
      return 'info' as const
    case 'completed':
    case 'done':
      return 'success' as const
    case 'failed':
      return 'destructive' as const
    case 'pending':
      return 'warning' as const
    default:
      return 'outline' as const
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

function shortProject(project: string): string {
  return project.split('/').pop() ?? project
}

/**
 * Format a delegation step index for display.
 * Delegation steps use negative indices (-100, -99, ...).
 * Shows "D1", "D2", etc. based on position.
 */
function formatDelegationIndex(stepIndex: number, delegationCount: number): string {
  if (delegationCount <= 1) return 'D'
  // -100 → D1, -99 → D2, etc.
  const pos = stepIndex + 101
  return `D${pos}`
}

// ── Component ─────────────────────────────────────────────────────────────

interface StepTimelineSidebarProps {
  snapshot: JobDetailSnapshot
  groups: StepTimelineGroup[]
  /** Scroll-spy driven: which step is currently visible in the content pane. */
  highlightedStep: number | null
  /** Triggered when user clicks a step; parent scrolls the content pane. */
  onClickStep: (idx: number) => void
}

export function StepTimelineSidebar({
  snapshot,
  groups,
  highlightedStep,
  onClickStep,
}: StepTimelineSidebarProps) {
  const { job } = snapshot
  const listRef = useRef<HTMLDivElement>(null)

  const now = Date.now()
  const duration = job.durationMs
    ? formatDurationMs(job.durationMs)
    : job.startedAt
      ? formatDurationMs(now - (parseSqliteTimestamp(job.startedAt) ?? now))
      : '\u2014'

  // Use observedModels from job snapshot (populated by job-detail-query)
  const observedModels: string[] = job.observedModels ?? []
  const hasObservedModels = observedModels.length > 0

  // Only indexed steps (exclude unattributed null-index groups)
  const stepGroups = groups.filter((g) => g.stepIndex !== null)
  const delegationGroups = stepGroups.filter((g) => g.command === 'delegation')
  const delegationCount = delegationGroups.length

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    if (stepGroups.length === 0) return

    const currentPos = highlightedStep !== null
      ? stepGroups.findIndex((g) => g.stepIndex === highlightedStep)
      : -1

    if (currentPos === -1) {
      const group =
        e.key === 'ArrowDown' ? stepGroups[0] : stepGroups[stepGroups.length - 1]
      if (group.stepIndex != null) onClickStep(group.stepIndex)
      return
    }

    const nextPos =
      e.key === 'ArrowDown'
        ? Math.min(currentPos + 1, stepGroups.length - 1)
        : Math.max(currentPos - 1, 0)

    const nextGroup = stepGroups[nextPos]
    if (nextGroup.stepIndex != null) onClickStep(nextGroup.stepIndex)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact job header */}
      <div className="flex-shrink-0 border-b p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statusVariant(job.status)} size="sm">
            {job.status}
          </Badge>
          <Badge variant="outline" size="sm">
            {job.scope}
          </Badge>
          {job.verdict && (
            <Badge variant={verdictVariant(job.verdict)} size="sm">
              {job.verdict}
            </Badge>
          )}
        </div>
        <p className="text-xs font-mono leading-tight line-clamp-2 text-muted-foreground">
          {job.description}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-medium">{shortProject(job.project)}</span>
          <span className="font-mono">{duration}</span>
          {job.currentStep != null && <span>Step {job.currentStep}</span>}
        </div>
      </div>

      {/* Model badges — derived from root + subagent sessions */}
      <div className="flex-shrink-0 border-b p-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Models
        </p>
        <div className="flex flex-wrap gap-1">
          {hasObservedModels
            ? observedModels.map((model: string) => (
                <Badge
                  key={model}
                  variant="outline"
                  size="sm"
                  className="max-w-[200px] truncate font-mono text-[10px]"
                >
                  {model}
                </Badge>
              ))
            : (
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  {job.modelProfile}
                </Badge>
              )}
        </div>
      </div>

      {/* Step timeline — keyboard navigable */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Step timeline — use arrow keys to navigate"
      >
        {stepGroups.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No steps yet.</p>
        ) : (
          <div className="py-1">
            {stepGroups.map((group) => {
              const isDelegation = group.command === 'delegation'
              const isHighlighted = highlightedStep === group.stepIndex
              return (
                <button
                  key={`step-${group.stepIndex}`}
                  className={[
                    'w-full text-left px-3 py-2 flex items-start gap-2 transition-colors hover:bg-accent/30',
                    isHighlighted
                      ? 'border-l-2 border-primary bg-accent/50'
                      : 'border-l-2 border-transparent',
                  ].join(' ')}
                  onClick={() => {
                    if (group.stepIndex != null) onClickStep(group.stepIndex)
                  }}
                >
                  <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                    {isDelegation
                      ? formatDelegationIndex(group.stepIndex!, delegationCount)
                      : group.stepIndex}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-xs font-mono leading-tight">
                      {isDelegation ? 'Delegation' : (group.command || '(no command)')}
                    </p>
                    <Badge variant={stepStatusVariant(group.status)} size="sm">
                      {group.status}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
