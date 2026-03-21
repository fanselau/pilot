/**
 * Inline SVG data visualization primitives.
 *
 * Lightweight sparkline-style components for token breakdowns,
 * duration bars, and cost magnitude indicators. No chart library —
 * pure SVG for minimal bundle size and maximum flexibility.
 */

/** TokenBar — horizontal stacked bar showing input/output/reasoning token proportions */
export function TokenBar({ input, output, reasoning, className }: {
  input: number; output: number; reasoning?: number; className?: string
}) {
  const total = input + output + (reasoning ?? 0)
  if (total === 0) return null
  const w = 80
  const h = 6
  const inputW = (input / total) * w
  const outputW = (output / total) * w
  return (
    <svg width={w} height={h} className={className} aria-label={`Tokens: ${input} in, ${output} out`}>
      <rect x={0} y={0} width={inputW} height={h} rx={1} className="fill-sky-400/70" />
      <rect x={inputW} y={0} width={outputW} height={h} rx={1} className="fill-emerald-400/70" />
      {reasoning ? <rect x={inputW + outputW} y={0} width={(reasoning / total) * w} height={h} rx={1} className="fill-violet-400/70" /> : null}
    </svg>
  )
}

/** DurationBar — single horizontal bar showing duration relative to max */
export function DurationBar({ ms, maxMs, className }: {
  ms: number; maxMs: number; className?: string
}) {
  if (maxMs === 0) return null
  const pct = Math.min(ms / maxMs, 1)
  return (
    <svg width={60} height={4} className={className}>
      <rect x={0} y={0} width={60} height={4} rx={2} className="fill-zinc-800" />
      <rect x={0} y={0} width={pct * 60} height={4} rx={2} className="fill-sky-400/60" />
    </svg>
  )
}

/** CostDot — tiny colored dot indicating cost magnitude */
export function CostDot({ usd }: { usd: number | null }) {
  if (usd == null || usd === 0) return null
  const color = usd > 1 ? 'bg-rose-400' : usd > 0.1 ? 'bg-amber-400' : 'bg-emerald-400'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
}
