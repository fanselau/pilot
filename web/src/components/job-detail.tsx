/**
 * Job detail component — merged chronological timeline view.
 *
 * Presents proactive actions and a step-first timeline stream as
 * the primary execution story.
 */

import type { JobDetailSnapshot } from '@pilot/core/types.js'
import { parseSqliteTimestamp } from '~/lib/time-utils'
import { Badge } from '~/components/ui/badge'

// ── Shared helpers ───────────────────────────────────────────────────────

export function statusVariant(status: string) {
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

export function verdictVariant(verdict: string | null) {
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

export function formatDurationMs(ms: number | null): string {
  if (ms == null) return '\u2014'
  const secs = Math.floor(ms / 1_000)
  const mins = Math.floor(secs / 60)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

export function formatTime(iso: string | null): string {
  if (!iso) return '\u2014'
  const ms = parseSqliteTimestamp(iso)
  if (ms === null) return '\u2014'
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortProject(project: string): string {
  return project.split('/').pop() ?? project
}

// ── Job Header (simplified — actions now live in JobInfoPanel) ───────────

export function JobHeader({ job }: { job: JobDetailSnapshot['job'] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <span className="font-mono text-sm font-semibold">{job.id}</span>
      <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
      {job.verdict && (
        <Badge variant={verdictVariant(job.verdict)}>{job.verdict}</Badge>
      )}
      <Badge variant="outline">{job.scope}</Badge>
    </div>
  )
}

// NOTE: JobDetail component removed — TimelineStream was unused.
// The route uses SplitPaneDetail → StepContentPane directly.
