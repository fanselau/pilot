/**
 * Semantic status badges for jobs, steps, verdicts, and sources.
 *
 * Maps status/verdict/source strings to consistent color-coded badges
 * using the shared Badge component and format utilities.
 */

import { Badge } from '~/components/ui/badge'

/** StatusBadge — maps any job/step/session status to semantic color badge */
export function StatusBadge({ status, pulse, size = 'sm', className }: {
  status: string; pulse?: boolean; size?: 'sm' | 'default'; className?: string
}) {
  const variant = (() => {
    switch (status) {
      case 'running': case 'active': case 'working': return 'info' as const
      case 'pending': case 'queued': return 'warning' as const
      case 'completed': case 'done': case 'pass': case 'succeeded': return 'success' as const
      case 'failed': case 'fail': case 'crashed': return 'destructive' as const
      case 'gaps_found': case 'partial': case 'doubting': return 'warning' as const
      case 'hung-on-prompt': case 'hung-on-tool': return 'warning' as const
      default: return 'secondary' as const
    }
  })()
  return (
    <Badge variant={variant} size={size} className={`${pulse ? 'animate-pulse' : ''} ${className ?? ''}`}>
      {status}
    </Badge>
  )
}

/** VerdictBadge — shows judge verdict with semantic coloring */
export function VerdictBadge({ verdict, confidence, className }: {
  verdict: string | null; confidence?: number | null; className?: string
}) {
  if (!verdict) return null
  const variant = (() => {
    switch (verdict.toLowerCase()) {
      case 'pass': case 'passed': case 'succeeded': return 'success' as const
      case 'fail': case 'failed': return 'destructive' as const
      case 'partial': case 'gaps_found': case 'doubting': return 'warning' as const
      default: return 'outline' as const
    }
  })()
  return (
    <Badge variant={variant} size="sm" className={className}>
      {verdict}{confidence != null ? ` ${Math.round(confidence)}%` : ''}
    </Badge>
  )
}

/** SourceBadge — shows step source origin with distinctive coloring */
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const variant = (() => {
    switch (source) {
      case 'delegation': return 'info' as const
      case 'judge:gaps': return 'warning' as const
      case 'judge:hung': return 'destructive' as const
      case 'operator': return 'default' as const
      default: return 'outline' as const
    }
  })()
  return (
    <Badge variant={variant} size="sm" className={`text-[10px] ${className ?? ''}`}>
      {source}
    </Badge>
  )
}
