/**
 * Aggregated tool call chips for a step section.
 *
 * Counts tool calls by tool name from StepTimelineItem[] and renders
 * compact badge chips showing the top tools and their counts.
 * e.g. "bash ×12  read ×34  edit ×8"
 */

import { Badge } from '~/components/ui/badge'
import type { StepTimelineItem } from '@pilot/core/types.js'

/** Aggregate tool calls from timeline items and render compact chips */
export function ToolSummaryChips({ items, className }: {
  items: StepTimelineItem[]; className?: string
}) {
  // Count tool calls by tool name
  const toolCounts = new Map<string, number>()
  for (const item of items) {
    if (item.kind === 'tool-summary' && item.tool) {
      toolCounts.set(item.tool, (toolCounts.get(item.tool) ?? 0) + 1)
    }
  }
  if (toolCounts.size === 0) return null

  // Sort by count descending, show top 6
  const sorted = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  return (
    <div className={`flex flex-wrap gap-1 max-w-full overflow-hidden ${className ?? ''}`}>
      {sorted.map(([tool, count]) => (
        <Badge key={tool} variant="outline" size="sm" className="text-[10px] font-mono gap-0.5 py-0">
          {tool} <span className="text-muted-foreground">×{count}</span>
        </Badge>
      ))}
      {toolCounts.size > 6 && (
        <Badge variant="outline" size="sm" className="text-[10px] text-muted-foreground py-0">
          +{toolCounts.size - 6} more
        </Badge>
      )}
    </div>
  )
}
