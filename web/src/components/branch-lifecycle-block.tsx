import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { BranchLifecycleItem, SessionSummary } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { ChevronRightIcon } from 'lucide-react'
import { deriveBranchIdentity } from '~/components/branch-lifecycle-block.helpers'
import { SessionActivity } from '~/components/session-activity'
import { getSessionChildrenFn } from '~/lib/server-fns'

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

  // Active branches at depth < 2 expand by default; done branches and deep branches collapse
  const defaultOpen = item.status === 'active' && depth < 2
  const [isOpen, setIsOpen] = useState(defaultOpen)

  // Load children only when expanded and within depth limit
  const { data: children } = useQuery({
    queryKey: ['session-children', item.sessionId],
    queryFn: () => getSessionChildrenFn({ data: item.sessionId }),
    enabled: isOpen && depth < MAX_DEPTH,
  })

  // Sticky top position — each depth level layers 2.25rem below the parent header
  const stickyTop = `${(depth + 1) * 2.25}rem`

  return (
    <div className="border-l border-border/30 bg-muted/5">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Sticky header — always visible; stacks beneath parent step headers via zIndex */}
        <CollapsibleTrigger
          style={{ position: 'sticky', top: stickyTop, zIndex: 20 - depth }}
          className="w-full text-left bg-background/95 backdrop-blur border-b border-border/30 px-3 py-1.5 flex items-center gap-1.5 hover:bg-accent/10 transition-colors"
        >
          <ChevronRightIcon
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          />
          <Badge variant="outline" size="sm">
            {identity.label}
          </Badge>
          <Badge variant={statusVariant(item.status)} size="sm">
            {item.status}
          </Badge>
          {identity.role && (
            <Badge variant="secondary" size="sm">
              {identity.role}
            </Badge>
          )}
          {item.durationMs != null && (
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              {formatDurationMs(item.durationMs)}
            </span>
          )}
          {item.models.length > 0 && (
            <Badge
              variant="outline"
              size="sm"
              className="font-mono text-[10px] max-w-[100px] truncate"
            >
              {item.models[0].split('/').pop() ?? item.models[0]}
            </Badge>
          )}
        </CollapsibleTrigger>

        {/* Expanded content — renders directly in flow at parent width, no card chrome */}
        <CollapsibleContent>
          <div className="border-l border-border/30 bg-muted/5">
            <SessionActivity
              sessionId={item.sessionId}
              isActive={item.status === 'active'}
            />
            {/* Recursive child sessions — limited to MAX_DEPTH */}
            {depth < MAX_DEPTH && children?.map((child) => (
              <BranchLifecycleBlock
                key={child.sessionId}
                item={sessionToBranchItem(child, item.sessionId)}
                jobId={jobId}
                depth={depth + 1}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
