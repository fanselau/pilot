/**
 * Session-level overview tab for the dashboard.
 *
 * Shows temporal visibility across sessions: when each session was
 * active, how long it ran, message/token counts, and sub-agent counts.
 * Useful for understanding "what happened when" across a job's sessions.
 */

import { useState, useMemo } from 'react'
import type { SessionSummary } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '~/components/ui/table'
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipProvider,
} from '~/components/ui/tooltip'

// ── Helpers ──────────────────────────────────────────────────────────────

function sessionStatusVariant(status: string) {
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
  if (ms == null || ms <= 0) return '\u2014'
  const secs = Math.floor(ms / 1_000)
  const mins = Math.floor(secs / 60)
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return String(count)
}

function truncateTitle(title: string, max: number): string {
  if (title.length <= max) return title
  return title.slice(0, max).trimEnd() + '\u2026'
}

/** Compute idle time by comparing updatedAt - startedAt vs actual duration. */
function computeIdleLabel(session: SessionSummary): string {
  if (!session.durationMs) return '\u2014'
  // Simple heuristic: sessions that are "done" with a known duration
  // show duration. Active sessions show elapsed time since start.
  if (session.status === 'active') {
    const elapsed = Date.now() - session.startedAt
    const idleMs = elapsed - (session.durationMs ?? 0)
    if (idleMs > 60_000) {
      return `${Math.floor(idleMs / 60_000)}m idle`
    }
    return 'active'
  }
  return formatDurationMs(session.durationMs)
}

// ── Sorting ──────────────────────────────────────────────────────────────

type SessionSortField = 'status' | 'duration' | null
type SortDir = 'asc' | 'desc'

const SESSION_STATUS_ORDER: Record<string, number> = {
  active: 0,
  done: 1,
  unknown: 2,
}

function sortSessions(
  sessions: SessionSummary[],
  field: SessionSortField,
  dir: SortDir,
): SessionSummary[] {
  if (!field) return sessions
  return [...sessions].sort((a, b) => {
    let cmp = 0
    if (field === 'status') {
      cmp =
        (SESSION_STATUS_ORDER[a.status] ?? 99) -
        (SESSION_STATUS_ORDER[b.status] ?? 99)
    } else if (field === 'duration') {
      cmp = (a.durationMs ?? 0) - (b.durationMs ?? 0)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Sort header ──────────────────────────────────────────────────────────

function SortableHead({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string
  field: SessionSortField
  currentField: SessionSortField
  currentDir: SortDir
  onSort: (field: SessionSortField) => void
  className?: string
}) {
  const active = currentField === field
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ''}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="text-xs">{currentDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </TableHead>
  )
}

// ── Component ────────────────────────────────────────────────────────────

export interface SessionOverviewProps {
  /** All sessions (root + subagent) from loaded job detail snapshots */
  sessions: SessionSummary[]
}

export function SessionOverview({ sessions }: SessionOverviewProps) {
  const [sortField, setSortField] = useState<SessionSortField>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (field: SessionSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(
    () => sortSessions(sessions, sortField, sortDir),
    [sessions, sortField, sortDir],
  )

  if (sessions.length === 0) {
    return (
      <Empty className="py-8 md:py-8">
        <EmptyHeader>
          <EmptyTitle className="text-base">No sessions</EmptyTitle>
          <EmptyDescription>
            Session data will appear here when jobs have active sessions.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <SortableHead
              label="Status"
              field="status"
              currentField={sortField}
              currentDir={sortDir}
              onSort={handleSort}
              className="w-20"
            />
            <TableHead className="w-20">Role</TableHead>
            <TableHead className="w-24">Started</TableHead>
            <SortableHead
              label="Duration"
              field="duration"
              currentField={sortField}
              currentDir={sortDir}
              onSort={handleSort}
              className="w-24 text-right"
            />
            <TableHead className="w-20 text-right">Messages</TableHead>
            <TableHead className="w-20 text-right">Tokens</TableHead>
            <TableHead className="w-24">Models</TableHead>
            <TableHead className="w-16 text-right">Children</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((session) => {
            const titleDisplay = truncateTitle(session.title, 40)
            return (
              <TableRow key={session.sessionId}>
                <TableCell>
                  {session.title.length > 40 ? (
                    <Tooltip>
                      <TooltipTrigger className="cursor-default text-left text-sm font-medium">
                        {titleDisplay}
                      </TooltipTrigger>
                      <TooltipPopup className="max-w-xs">
                        {session.title}
                      </TooltipPopup>
                    </Tooltip>
                  ) : (
                    <span className="text-sm font-medium">{titleDisplay}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={sessionStatusVariant(session.status)}
                    size="sm"
                    className={session.status === 'active' ? 'animate-pulse' : ''}
                  >
                    {session.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={session.role === 'root' ? 'outline' : 'secondary'}
                    size="sm"
                  >
                    {session.role}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatTimestamp(session.startedAt)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {computeIdleLabel(session)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {session.messageCount}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatTokens(session.tokenTotal)}
                </TableCell>
                <TableCell>
                  {session.models.length > 0 ? (
                    session.models.length > 1 ? (
                      <Tooltip>
                        <TooltipTrigger className="cursor-default">
                          <Badge variant="outline" size="sm">
                            {session.models.length} models
                          </Badge>
                        </TooltipTrigger>
                        <TooltipPopup>
                          {session.models.join(', ')}
                        </TooltipPopup>
                      </Tooltip>
                    ) : (
                      <Badge variant="outline" size="sm">
                        {session.models[0]!.split('/').pop()}
                      </Badge>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">\u2014</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {session.childCount > 0 ? session.childCount : '\u2014'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}
