/**
 * AutoPilot brand components.
 *
 * All elements use `currentColor` so they automatically adapt to
 * light / dark themes via the parent's text colour.
 */

export function AutoPilotIcon({
  className,
  size = 20,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 16L14 6l2.4 2.4L10.2 16l6.2 7.6L14 26z" opacity={0.4} />
      <path d="M14 16l8-10 2.4 2.4L18.2 16l6.2 7.6L22 26z" />
    </svg>
  )
}

export function AutoPilotLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <AutoPilotIcon size={20} />
      <span className="text-lg tracking-tight">
        <span className="font-medium">Auto</span>
        <span className="font-bold">Pilot</span>
      </span>
    </span>
  )
}
