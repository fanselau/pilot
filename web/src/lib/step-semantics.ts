/**
 * Shared semantic label helpers for step timeline UI components.
 *
 * All UI surfaces (StepContentPane, StepTimelineSidebar, TimelineStream, etc.)
 * should import from this module to ensure consistent labeling across views.
 *
 * Uses pre-computed semanticLabel from core if available; falls back to
 * derivation for backward compatibility with older data.
 */

import type { StepTimelineGroup } from '@pilot/core/types.js'

/**
 * Format a human-readable label for a step group.
 * Uses pre-computed semanticLabel if available, falls back to derivation.
 *
 * Returns labels like: "Delegation", "Execution", "Judge", "Gap Closure",
 * "Planning", "Quick Task", "Recovery", "Retry", "Verification", "Unattributed"
 */
export function formatStepLabel(group: StepTimelineGroup): string {
  // Use pre-computed label from core if available
  if (group.semanticLabel) return group.semanticLabel

  // Fallback derivation (same logic as core, for safety)
  if (group.command === 'delegation') return 'Delegation'
  if (group.command === 'unattributed') return 'Unattributed'
  if (group.source === 'judge:gaps') return 'Gap Closure'
  if (group.source === 'judge:hung') return 'Recovery'
  if (group.source === 'judge:failed') return 'Retry'
  if (group.source === 'operator') return 'Manual'
  if (group.source === 'delegation' && group.command.includes('plan')) return 'Planning'
  if (group.source === 'delegation' && group.command.includes('execute')) return 'Execution'
  if (group.source === 'delegation' && (group.command.includes('judge') || group.command.includes('verify'))) return 'Judge'
  if (group.source === 'delegation' && group.command === 'quick') return 'Quick Task'
  return group.command.charAt(0).toUpperCase() + group.command.slice(1)
}

/**
 * Format a compact description for a step group header.
 * Combines the semantic label with step index and optional reason context.
 *
 * Returns strings like: "Execution #1", "Gap Closure #3", "Delegation", "Judge"
 */
export function formatStepDescription(group: StepTimelineGroup, reason?: string | null): string {
  const label = formatStepLabel(group)

  // Delegation and unattributed don't need indices
  if (group.command === 'delegation' || group.command === 'unattributed') return label

  // Add step index for numbered steps
  const indexStr = group.stepIndex !== null && group.stepIndex >= 0
    ? ` #${group.stepIndex}`
    : ''

  const reasonStr = reason ? ` — ${reason}` : ''
  return `${label}${indexStr}${reasonStr}`
}

/**
 * Return a CSS-friendly semantic class for a step type.
 * Used for visual differentiation (borders, accents, icons).
 *
 * Returns classes like: "step-execution", "step-planning", "step-gap-closure",
 * "step-delegation", "step-unattributed", "step-judge", "step-recovery", etc.
 */
export function stepSemanticClass(group: StepTimelineGroup): string {
  if (group.command === 'delegation') return 'step-delegation'
  if (group.command === 'unattributed') return 'step-unattributed'

  const source = group.source
  if (source === 'judge:gaps') return 'step-gap-closure'
  if (source === 'judge:hung') return 'step-recovery'
  if (source === 'judge:failed') return 'step-retry'
  if (source === 'operator') return 'step-manual'

  if (group.command.includes('plan')) return 'step-planning'
  if (group.command.includes('execute')) return 'step-execution'
  if (group.command.includes('judge') || group.command.includes('verify')) return 'step-judge'
  if (group.command === 'quick') return 'step-quick'

  return 'step-default'
}

/**
 * Whether a step group represents a continuation/gap-closure path
 * rather than the original planned execution flow.
 *
 * Returns true for judge:gaps, judge:hung, and judge:failed sources —
 * i.e., steps that exist because the original path needed repair.
 */
export function isContinuationStep(group: StepTimelineGroup): boolean {
  return group.source === 'judge:gaps'
    || group.source === 'judge:hung'
    || group.source === 'judge:failed'
}

/**
 * Format a delegation step index for display.
 * Delegation steps use negative indices (-100, -99, ...).
 *
 * Returns 'D' for a single delegation session, 'D1', 'D2', etc. for multiple.
 */
export function formatDelegationIndex(stepIndex: number, delegationCount: number): string {
  if (delegationCount <= 1) return 'D'
  // -100 → D1, -99 → D2, etc.
  const pos = stepIndex + 101
  return `D${pos}`
}
