/**
 * Formatting utilities for tokens, cost, duration, and status colors.
 *
 * Client-safe — no server dependencies. Used across dashboard components
 * for consistent display of numeric and status data.
 */

/** Format token count: 1234 → "1.2k", 1234567 → "1.2M" */
export function formatTokens(n: number | null | undefined): string {
  if (n == null || n === 0) return '—'
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** Format cost in USD: 0.0234 → "$0.02", 1.5 → "$1.50" */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || usd === 0) return '—'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

/** Compact duration: ms → "12s", "3m", "1h 12m" */
export function formatCompactDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const secs = Math.floor(ms / 1_000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

/** Format percentage: 0.85 → "85%", null → "—" */
export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Math.round(n * 100)}%`
}

/** Semantic text color class for job/step status */
export function statusColor(status: string): string {
  switch (status) {
    case 'running': case 'active': case 'working': return 'text-sky-400'
    case 'pending': case 'queued': return 'text-amber-400'
    case 'completed': case 'done': case 'pass': case 'passed': case 'succeeded': return 'text-emerald-400'
    case 'failed': case 'fail': case 'crashed': return 'text-rose-400'
    case 'cancelled': case 'skipped': return 'text-zinc-400'
    case 'gaps_found': case 'partial': case 'doubting': return 'text-orange-400'
    case 'hung-on-prompt': case 'hung-on-tool': return 'text-amber-400'
    default: return 'text-zinc-400'
  }
}

/** Semantic background color class for status */
export function statusBgColor(status: string): string {
  switch (status) {
    case 'running': case 'active': case 'working': return 'bg-sky-500/10'
    case 'pending': case 'queued': return 'bg-amber-500/10'
    case 'completed': case 'done': case 'pass': case 'passed': return 'bg-emerald-500/10'
    case 'failed': case 'fail': case 'crashed': return 'bg-rose-500/10'
    case 'gaps_found': case 'partial': return 'bg-orange-500/10'
    default: return 'bg-zinc-500/10'
  }
}
