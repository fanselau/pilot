import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SessionPart } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { getSessionActivityFn } from '~/lib/server-fns'

// ── Helpers ──────────────────────────────────────────────────────────────

function partTypeVariant(type: string) {
  switch (type) {
    case 'text':
      return 'secondary' as const
    case 'tool':
      return 'info' as const
    case 'patch':
      return 'warning' as const
    case 'reasoning':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncatePreview(text: string | undefined, max: number): string {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

// ── Part Renderer ────────────────────────────────────────────────────────

function PartCard({ part }: { part: SessionPart }) {
  const hasExpandableContent =
    (part.text && part.text.length > 200) ||
    (part.toolOutput && part.toolOutput.length > 200)

  const preview = part.text ?? part.toolOutput ?? ''

  return (
    <Collapsible>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1.5">
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums mt-0.5">
          {formatTime(part.createdAt)}
        </span>
        <Badge variant={partTypeVariant(part.type)} size="sm">
          {part.type}
        </Badge>
        {part.role && (
          <Badge variant="outline" size="sm">
            {part.role}
          </Badge>
        )}
        {part.tool && (
          <Badge variant="info" size="sm">
            {part.tool}
          </Badge>
        )}
        <div className="min-w-0 flex-1">
          {hasExpandableContent ? (
            <>
              <CollapsibleTrigger className="text-left text-xs text-muted-foreground hover:text-foreground">
                <span className="line-clamp-2">
                  {truncatePreview(preview, 200)}
                </span>
                <span className="text-xs text-primary ml-1">[expand]</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90 font-mono bg-muted/50 p-2 rounded-md max-h-96 overflow-auto">
                  {preview}
                </pre>
              </CollapsibleContent>
            </>
          ) : (
            <span className="text-xs text-muted-foreground line-clamp-2">
              {truncatePreview(preview, 200)}
            </span>
          )}
          {part.toolInput && (
            <p className="mt-0.5 text-xs text-muted-foreground/70 line-clamp-1 font-mono">
              {truncatePreview(part.toolInput, 100)}
            </p>
          )}
          {part.patchFiles && part.patchFiles.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {part.patchFiles.map((f) => (
                <Badge key={f} variant="outline" size="sm">
                  {f.split('/').pop() ?? f}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {part.toolStatus && (
          <Badge
            variant={part.toolStatus === 'error' ? 'destructive' : 'success'}
            size="sm"
          >
            {part.toolStatus}
          </Badge>
        )}
      </div>
    </Collapsible>
  )
}

// ── Main Component ───────────────────────────────────────────────────────

interface SessionActivityProps {
  sessionId: string
}

export function SessionActivity({ sessionId }: SessionActivityProps) {
  // Load all parts in a single query — no pagination / Load More
  const { data, isLoading } = useQuery({
    queryKey: ['session-activity-full', sessionId],
    queryFn: () =>
      getSessionActivityFn({
        data: {
          sessionId,
          limit: 1000,
          includeToolDetails: true,
        },
      }),
  })

  // Reset query on sessionId change is handled automatically by the queryKey

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const allParts = data?.parts ?? []

  if (allParts.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No activity recorded for this session.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-3">
        <div className="divide-y divide-border/50">
          {allParts.map((part) => (
            <PartCard key={part.id} part={part} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
