import { Link } from '@tanstack/react-router'
import type { BranchLifecycleItem } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import {
  deriveBranchIdentity,
  selectBranchPreview,
  getBranchDrillInPath,
} from '~/components/branch-lifecycle-block.helpers'

function statusVariant(status: BranchLifecycleItem['status']) {
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
  if (ms == null) return '-'
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
  return `${text.slice(0, max).trimEnd()}...`
}

interface BranchLifecycleBlockProps {
  item: BranchLifecycleItem
  jobId: string
}

export function BranchLifecycleBlock({ item, jobId }: BranchLifecycleBlockProps) {
  const identity = deriveBranchIdentity(item.title)
  const preview = selectBranchPreview(item)
  const branchPurpose = identity.purpose

  return (
    <Card className="min-w-0 max-w-full overflow-hidden border-l-4 border-l-primary/40 bg-muted/25">
      <CardContent className="space-y-2.5 py-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="outline" size="sm">
                branch
              </Badge>
              <span className="text-sm font-medium truncate">{identity.label}</span>
              <Badge variant={statusVariant(item.status)} size="sm">
                {item.status}
              </Badge>
              {identity.role && (
                <Badge variant="secondary" size="sm">
                  {identity.role}
                </Badge>
              )}
            </div>

            {branchPurpose && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {truncate(branchPurpose, 220)}
              </p>
            )}

            {preview && (
              <p className="text-sm text-foreground/90 line-clamp-3">
                {truncate(preview, 280)}
              </p>
            )}

            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums">started {formatTime(item.createdAt)}</span>
              {item.completedAt != null && (
                <span className="tabular-nums">done {formatTime(item.completedAt)}</span>
              )}
              <span className="tabular-nums">{formatDurationMs(item.durationMs)}</span>
              <span className="tabular-nums">{item.messageCount} msgs</span>
              {item.tokenTotal > 0 && (
                <span className="tabular-nums">{formatTokens(item.tokenTotal)} tokens</span>
              )}
              {item.childCount > 0 && (
                <span className="tabular-nums">{item.childCount} children</span>
              )}
            </div>
          </div>

          <div className="self-start sm:shrink-0">
            <Link
              to="/jobs/$jobId/sessions/$sessionId"
              params={{ jobId, sessionId: item.sessionId }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                title={getBranchDrillInPath(jobId, item.sessionId)}
              >
                Open branch
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
