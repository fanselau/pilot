/**
 * Inline fork card for sub-agent spawn points in the merged timeline.
 *
 * Rendered at the temporal position where a sub-agent was spawned.
 * Visually distinct from regular activity items with a left border
 * accent and muted background.
 */

import { Link } from '@tanstack/react-router'
import type { TimelineForkCardItem } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'

// ── Helpers ──────────────────────────────────────────────────────────────

function forkStatusVariant(status: string) {
  switch (status) {
    case 'active':
      return 'info' as const
    case 'done':
      return 'success' as const
    default:
      return 'secondary' as const
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

// ── Component ────────────────────────────────────────────────────────────

interface TimelineForkCardProps {
  item: TimelineForkCardItem
  jobId: string
}

export function TimelineForkCard({ item, jobId }: TimelineForkCardProps) {
  return (
    <Card className="border-l-4 border-l-primary/40 bg-muted/30">
      <CardContent className="py-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: identity + meta */}
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Title row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatTime(item.createdAt)}
              </span>
              <Badge variant="outline" size="sm">
                fork
              </Badge>
              <span className="text-sm font-medium truncate">
                {item.title || 'Sub-agent'}
              </span>
              <Badge variant={forkStatusVariant(item.status)} size="sm">
                {item.status}
              </Badge>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{formatDurationMs(item.durationMs)}</span>
              <span>{item.messageCount} msgs</span>
              {item.tokenTotal > 0 && (
                <span>{formatTokens(item.tokenTotal)} tokens</span>
              )}
              {item.childCount > 0 && (
                <span>{item.childCount} children</span>
              )}
            </div>

            {/* Model badges */}
            {item.models.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.models.map((model) => (
                  <Badge key={model} variant="outline" size="sm">
                    {model.split('/').pop() ?? model}
                  </Badge>
                ))}
              </div>
            )}

            {/* Latest message preview */}
            {item.latestMessagePreview && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {truncate(item.latestMessagePreview, 150)}
              </p>
            )}
          </div>

          {/* Right: drill-in link */}
          <div className="shrink-0">
            <Link
              to="/jobs/$jobId/sessions/$sessionId"
              params={{ jobId, sessionId: item.sessionId }}
            >
              <Button variant="ghost" size="sm" className="text-xs">
                View details &rarr;
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
