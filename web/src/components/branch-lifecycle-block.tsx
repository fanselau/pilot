import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { BranchLifecycleItem, SessionSummary } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { ChevronRightIcon } from 'lucide-react'
import {
  deriveBranchIdentity,
  selectBranchPreview,
} from '~/components/branch-lifecycle-block.helpers'
import { SessionActivity } from '~/components/session-activity'
import { getSessionChildrenFn } from '~/lib/server-fns'
import { useIsMobile } from '~/hooks/use-media-query'

// ── Utilities ─────────────────────────────────────────────────────────────

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

// ── Adapter: SessionSummary → BranchLifecycleItem ─────────────────────────

function sessionToBranchItem(session: SessionSummary, parentId: string): BranchLifecycleItem {
  return {
    kind: 'fork-card',
    sessionId: session.sessionId,
    parentSessionId: parentId,
    title: session.title,
    createdAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: session.status,
    messageCount: session.messageCount,
    tokenTotal: session.tokenTotal,
    models: session.models,
    latestMessagePreview: session.latestMessagePreview,
    childCount: session.childCount,
    durationMs: session.durationMs,
  }
}

// ── Max nesting depth ─────────────────────────────────────────────────────

const MAX_DEPTH = 4

// ── Component ─────────────────────────────────────────────────────────────

interface BranchLifecycleBlockProps {
  item: BranchLifecycleItem
  jobId: string
  depth?: number
}

export function BranchLifecycleBlock({ item, jobId, depth = 0 }: BranchLifecycleBlockProps) {
  const identity = deriveBranchIdentity(item.title)
  const preview = selectBranchPreview(item)
  const branchPurpose = identity.purpose
  const isMobile = useIsMobile()

  // Active branches at depth < 2 expand by default; done branches and deep branches collapse
  const defaultOpen = item.status === 'active' && depth < 2
  const [isOpen, setIsOpen] = useState(defaultOpen)

  // Load children only when expanded and within depth limit
  const { data: children } = useQuery({
    queryKey: ['session-children', item.sessionId],
    queryFn: () => getSessionChildrenFn({ data: item.sessionId }),
    enabled: isOpen && depth < MAX_DEPTH,
  })

  const marginClass = isMobile ? 'ml-2' : 'ml-4'
  const paddingClass = depth > 2 ? 'py-1.5' : 'py-3'

  return (
    <div
      className={
        depth > 0
          ? `${marginClass} border-l-2 border-l-muted overflow-hidden max-w-full`
          : 'overflow-hidden max-w-full'
      }
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card
          className={`min-w-0 max-w-full overflow-hidden border-l-4 border-l-primary/40 ${
            isOpen ? 'bg-accent/10' : 'bg-muted/25'
          }`}
        >
          <CollapsibleTrigger className="w-full text-left hover:bg-accent/30 transition-colors">
            <CardContent className={`space-y-2.5 ${paddingClass}`}>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ChevronRightIcon
                      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    />
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
                    {item.models.length > 0 && (
                      <Badge variant="outline" size="sm" className="font-mono text-[10px] max-w-[120px] truncate">
                        {(item.models[0].split('/').pop() ?? item.models[0])}
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
              </div>
            </CardContent>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-3 pb-3 pt-1 space-y-2 overflow-hidden max-w-full">
              {/* Live session activity stream */}
              <SessionActivity
                sessionId={item.sessionId}
                isActive={item.status === 'active'}
              />

              {/* Nested child sessions — recursive, limited to MAX_DEPTH */}
              {depth < MAX_DEPTH && children && children.length > 0 && (
                <div className="space-y-2">
                  {children.map((child) => (
                    <BranchLifecycleBlock
                      key={child.sessionId}
                      item={sessionToBranchItem(child, item.sessionId)}
                      jobId={jobId}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}
