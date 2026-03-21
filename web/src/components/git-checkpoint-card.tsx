/**
 * GitCheckpointCard — compact left-pane card showing git checkpoint
 * state: base/head commit SHAs with copy buttons and dirty indicator.
 *
 * Pure presentational — receives props directly (no data fetching).
 */

import { CopyButton } from '~/components/ui/copy-button'
import { Badge } from '~/components/ui/badge'

// ── Component ─────────────────────────────────────────────────────────────

interface GitCheckpointCardProps {
  gitBaseCommit: string | null
  gitHeadCommit: string | null
  startedDirty?: boolean
}

export function GitCheckpointCard({
  gitBaseCommit,
  gitHeadCommit,
  startedDirty,
}: GitCheckpointCardProps) {
  // Nothing to show if no git info
  if (!gitBaseCommit && !gitHeadCommit) return null

  const shortBase = gitBaseCommit?.slice(0, 7) ?? null
  const shortHead = gitHeadCommit?.slice(0, 7) ?? null
  const sameCommit = gitBaseCommit && gitHeadCommit && gitBaseCommit === gitHeadCommit

  // Derive diff status
  const diffStatus = (() => {
    if (startedDirty) return 'dirty'
    if (sameCommit) return 'no-op'
    if (gitBaseCommit && gitHeadCommit) return 'changed'
    return null
  })()

  return (
    <div className="border-b p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Git
        </p>
        {startedDirty && (
          <Badge variant="warning" size="sm" className="text-[9px]">
            started dirty
          </Badge>
        )}
        {diffStatus && diffStatus !== 'dirty' && (
          <Badge
            variant={diffStatus === 'changed' ? 'info' : 'secondary'}
            size="sm"
            className="text-[9px]"
          >
            {diffStatus}
          </Badge>
        )}
      </div>

      {/* Base commit */}
      {shortBase && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground w-10 shrink-0">base</span>
          <code className="font-mono text-[11px] text-foreground">{shortBase}</code>
          <CopyButton text={gitBaseCommit!} label="Copy base commit" />
        </div>
      )}

      {/* Head commit — only if different from base */}
      {shortHead && !sameCommit && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground w-10 shrink-0">head</span>
          <code className="font-mono text-[11px] text-foreground">{shortHead}</code>
          <CopyButton text={gitHeadCommit!} label="Copy head commit" />
        </div>
      )}
    </div>
  )
}
