/**
 * Floating "Follow latest" bar for live job activity.
 *
 * Appears sticky at the bottom of the content pane when:
 * - The job is active (isActive=true)
 * - Follow mode is OFF (user scrolled away)
 *
 * Uses sticky bottom positioning so it remains visible as the user reads
 * older content. Clicking re-engages follow mode.
 */

interface FollowModeBarProps {
  visible: boolean
  onFollow: () => void
}

export function FollowModeBar({ visible, onFollow }: FollowModeBarProps) {
  if (!visible) return null
  return (
    <div className="sticky bottom-2 z-40 flex justify-center pointer-events-none">
      <button
        onClick={onFollow}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 active:scale-95"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M6 2v7M3 6l3 3 3-3" />
        </svg>
        Follow latest
      </button>
    </div>
  )
}
