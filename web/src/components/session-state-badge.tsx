/**
 * Rich session state badge with specific indicators for each state.
 *
 * Shows 5 distinct states: working, hung-on-prompt, hung-on-tool, crashed, done.
 * For hung-on-prompt, also shows the pending question text inline.
 * Polls session state via server function for active sessions.
 */

import { useQuery } from '@tanstack/react-query'
import { Badge } from '~/components/ui/badge'
import { getSessionStateFn } from '~/lib/server-fns'

export function SessionStateBadge({ sessionId, isActive, className }: {
  sessionId: string; isActive?: boolean; className?: string
}) {
  const { data: stateResult } = useQuery({
    queryKey: ['session-state', sessionId],
    queryFn: () => getSessionStateFn({ data: sessionId }),
    enabled: !!isActive,
    refetchInterval: isActive ? 3000 : false,
  })

  if (!stateResult) {
    // Fallback for non-active sessions or before first fetch
    return (
      <Badge variant={isActive ? 'info' : 'success'} size="sm" className={className}>
        {isActive ? 'active' : 'done'}
      </Badge>
    )
  }

  const { state, pendingToolName, pendingToolContent } = stateResult

  switch (state) {
    case 'working':
      return (
        <Badge variant="info" size="sm" className={`animate-pulse ${className ?? ''}`}>
          working
        </Badge>
      )
    case 'hung-on-prompt':
      return (
        <div className={`flex flex-col gap-0.5 ${className ?? ''}`}>
          <Badge variant="warning" size="sm">
            hung — awaiting input
          </Badge>
          {pendingToolContent && (
            <p className="text-[10px] text-amber-400/80 line-clamp-2 leading-tight">
              {pendingToolContent.slice(0, 120)}
            </p>
          )}
        </div>
      )
    case 'hung-on-tool':
      return (
        <Badge variant="warning" size="sm" className={className}>
          hung — {pendingToolName ?? 'tool'}
        </Badge>
      )
    case 'crashed':
      return (
        <Badge variant="destructive" size="sm" className={className}>
          crashed
        </Badge>
      )
    case 'done':
      return (
        <Badge variant="success" size="sm" className={className}>
          done
        </Badge>
      )
  }
}
