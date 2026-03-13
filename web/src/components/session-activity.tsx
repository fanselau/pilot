import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SessionPart } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { Spinner } from '~/components/ui/spinner'
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
      <div className="flex items-start gap-2 py-1.5">
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
  initialLimit?: number
}

export function SessionActivity({
  sessionId,
  initialLimit = 20,
}: SessionActivityProps) {
  const [pages, setPages] = useState<SessionPart[][]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)

  // Initial load
  const { isLoading: initialLoading } = useQuery({
    queryKey: ['session-activity', sessionId, 'initial'],
    queryFn: async () => {
      const result = await getSessionActivityFn({
        data: {
          sessionId,
          limit: initialLimit,
          includeToolDetails: true,
        },
      })
      setPages([result.parts])
      setHasMore(result.hasMore)
      if (result.nextCursor) setCursor(result.nextCursor)
      return result
    },
  })

  // Load more handler
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadMore() {
    if (!hasMore || !cursor) return
    setLoadingMore(true)
    try {
      const result = await getSessionActivityFn({
        data: {
          sessionId,
          cursor,
          limit: initialLimit,
          includeToolDetails: true,
        },
      })
      setPages((prev) => [...prev, result.parts])
      setHasMore(result.hasMore)
      if (result.nextCursor) setCursor(result.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  if (initialLoading) {
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

  const allParts = pages.flat()

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
        {hasMore && (
          <>
            <Separator className="my-2" />
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Spinner className="size-3.5" />
                    Loading...
                  </>
                ) : (
                  'Load more activity'
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
