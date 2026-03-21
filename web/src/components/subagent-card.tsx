import { Link } from '@tanstack/react-router'
import type { SessionSummary } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { SessionStateBadge } from '~/components/session-state-badge'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '\u2014'
  const secs = Math.floor(ms / 1_000)
  const mins = Math.floor(secs / 60)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

// ── Component ────────────────────────────────────────────────────────────

interface SubagentCardProps {
  session: SessionSummary
  jobId: string
}

export function SubagentCard({ session, jobId }: SubagentCardProps) {
  return (
    <Link
      to="/jobs/$jobId/sessions/$sessionId"
      params={{ jobId, sessionId: session.sessionId }}
      className="block group"
    >
      <Card className="min-w-0 max-w-full overflow-hidden transition-colors group-hover:bg-accent/50">
        <CardContent className="py-3 min-w-0 max-w-full overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {session.title || 'Untitled session'}
                </span>
                <SessionStateBadge
                  sessionId={session.sessionId}
                  isActive={session.status === 'active'}
                />
              </div>
              {session.latestMessagePreview && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {truncate(session.latestMessagePreview, 120)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
              <span>{formatDurationMs(session.durationMs)}</span>
              <span>{session.messageCount} msgs</span>
              {session.tokenTotal > 0 && (
                <span>{formatTokens(session.tokenTotal)} tokens</span>
              )}
              {session.childCount > 0 && (
                <span>{session.childCount} children</span>
              )}
            </div>
          </div>
          {session.models.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {session.models.map((model) => (
                <Badge key={model} variant="outline" size="sm">
                  {model.split('/').pop() ?? model}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
