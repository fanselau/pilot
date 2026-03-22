/**
 * Shared semantic label helpers for step timeline UI components.
 *
 * All UI surfaces (StepContentPane, StepTimelineSidebar, TimelineStream, etc.)
 * should import from this module to ensure consistent labeling across views.
 *
 * Uses pre-computed semanticLabel from core if available; falls back to
 * derivation for backward compatibility with older data.
 */

import type { StepTimelineGroup, BranchLifecycleItem } from '@pilot/core/types.js'

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
  if (group.source === 'delegation' && group.command === 'fast') return 'Fast Task'
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
  if (group.command === 'fast') return 'step-fast'
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
 * Whether a step group represents a judge evaluation step.
 * True for steps where the judge runs to evaluate the work.
 *
 * Matches steps with 'judge' or 'verify' in their command,
 * or steps sourced from a judge: prefix (gap closure, retry, recovery).
 */
export function isJudgeStep(group: StepTimelineGroup): boolean {
  return group.command.includes('judge') || group.command.includes('verify')
    || group.source.startsWith('judge:')
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

/**
 * Structured fields for rich sticky headers — synthesized from a StepTimelineGroup.
 *
 * Provides all the high-signal context needed to differentiate headers visually
 * at each hierarchy level (step group vs branch/fork vs job).
 */
export interface SynthesizedHeaderFields {
  /** Human-readable label: "Execution", "Judge", "Gap Closure", etc. */
  label: string
  /** Stage context: "Planning", "Execution", "Verification", "Gap Closure", etc. */
  stage: string | null
  /** Short verdict summary from verdictReason (first 40 chars), null if not a judge step. */
  verdict: string | null
  /** First model observed in fork-card items, null if not available. */
  model: string | null
  /** Fork-card session counts: active/done/total. Null if no fork sessions. */
  statusCounters: { active: number; done: number; total: number } | null
  /** Why this step exists as a continuation: "gaps found", "hung recovery", etc. */
  continuationReason: string | null
  /** True when this step has a judge verdict/summary to deep-link to. */
  hasSummary: boolean
  /** True when step is currently running. */
  isActive: boolean
}

/**
 * Synthesize all display fields for a sticky step header from a StepTimelineGroup.
 *
 * Centralises all header field derivation in one place so step-content-pane,
 * timeline-stream, and any future surfaces can all use consistent data.
 */
export function synthesizeHeaderFields(group: StepTimelineGroup): SynthesizedHeaderFields {
  const label = formatStepLabel(group)

  // Stage context — more specific than the label, adds contextual nuance
  let stage: string | null = null
  if (group.command === 'delegation') {
    stage = 'Orchestration'
  } else if (group.source === 'judge:gaps') {
    stage = 'Gap Closure'
  } else if (group.source === 'judge:hung') {
    stage = 'Hung Recovery'
  } else if (group.source === 'judge:failed') {
    stage = 'Retry'
  } else if (group.source === 'operator') {
    stage = 'Manual'
  } else if (group.source === 'delegation') {
    if (group.command.includes('plan')) stage = 'Planning'
    else if (group.command.includes('execute')) stage = 'Execution'
    else if (group.command.includes('judge') || group.command.includes('verify')) stage = 'Verification'
    else if (group.command === 'fast') stage = 'Fast Task'
    else if (group.command === 'quick') stage = 'Quick Task'
  }

  // Verdict — first 40 chars of verdictReason for compact header display
  const verdict = group.verdictReason
    ? group.verdictReason.slice(0, 40)
    : null

  // Model — extracted from the first fork-card item that has model data
  let model: string | null = null
  for (const item of group.items) {
    if (item.kind === 'fork-card' && (item as BranchLifecycleItem).models.length > 0) {
      model = (item as BranchLifecycleItem).models[0]
      break
    }
  }

  // Status counters — fork-card (child session) items only
  const forkCards = group.items.filter((item): item is BranchLifecycleItem => item.kind === 'fork-card')
  const statusCounters = forkCards.length > 0
    ? {
        active: forkCards.filter((item) => item.status === 'active').length,
        done: forkCards.filter((item) => item.status === 'done').length,
        total: forkCards.length,
      }
    : null

  // Continuation reason — short explanation why this step exists
  let continuationReason: string | null = null
  if (group.source === 'judge:gaps') continuationReason = 'gaps found'
  else if (group.source === 'judge:hung') continuationReason = 'hung recovery'
  else if (group.source === 'judge:failed') continuationReason = 'failed retry'

  return {
    label,
    stage,
    verdict,
    model,
    statusCounters,
    continuationReason,
    hasSummary: isJudgeStep(group) && !!group.verdictReason,
    isActive: group.status === 'running',
  }
}
