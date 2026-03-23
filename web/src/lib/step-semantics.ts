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
import {
  Route, FolderPlus, Map, Hammer, Scale, Forward,
  MapPin, Wrench, ShieldCheck, Zap, User, HelpCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Semantic Session Type Model ───────────────────────────────────────────

export type SemanticSessionType =
  | 'delegation'
  | 'add-phase'
  | 'planning'
  | 'execution'
  | 'judge'
  | 'continuation-delegation'
  | 'gap-planning'
  | 'gap-execution'
  | 'gap-judge'
  | 'recovery'
  | 'fast-task'
  | 'quick-task'
  | 'manual'
  | 'unattributed'

export interface SemanticTypeConfig {
  label: string
  icon: LucideIcon
  /** CSS class for pastel background at depth 0 */
  bgClass: string
  /** CSS class for border accent */
  borderClass: string
  /** Is this a gap-loop variant? */
  isGap: boolean
}

export const SEMANTIC_TYPE_CONFIG: Record<SemanticSessionType, SemanticTypeConfig> = {
  'delegation':               { label: 'Delegation',               icon: Route,        bgClass: 'bg-slate-50/50 dark:bg-slate-900/20',    borderClass: 'border-slate-300/40 dark:border-slate-600/30', isGap: false },
  'add-phase':                { label: 'Add Phase',                icon: FolderPlus,   bgClass: 'bg-violet-50/50 dark:bg-violet-900/20',  borderClass: 'border-violet-300/40 dark:border-violet-600/30', isGap: false },
  'planning':                 { label: 'Planning',                 icon: Map,          bgClass: 'bg-blue-50/50 dark:bg-blue-900/20',      borderClass: 'border-blue-300/40 dark:border-blue-600/30', isGap: false },
  'execution':                { label: 'Execution',                icon: Hammer,       bgClass: 'bg-emerald-50/50 dark:bg-emerald-900/20',borderClass: 'border-emerald-300/40 dark:border-emerald-600/30', isGap: false },
  'judge':                    { label: 'Judge',                    icon: Scale,        bgClass: 'bg-amber-50/50 dark:bg-amber-900/20',    borderClass: 'border-amber-300/40 dark:border-amber-600/30', isGap: false },
  'continuation-delegation':  { label: 'Continuation Delegation',  icon: Forward,      bgClass: 'bg-orange-50/50 dark:bg-orange-900/20',  borderClass: 'border-orange-300/40 dark:border-orange-600/30', isGap: false },
  'gap-planning':             { label: 'Gap Planning',             icon: MapPin,       bgClass: 'bg-blue-50/30 dark:bg-blue-900/10',      borderClass: 'border-blue-300/30 dark:border-blue-600/20', isGap: true },
  'gap-execution':            { label: 'Gap Execution',            icon: Wrench,       bgClass: 'bg-emerald-50/30 dark:bg-emerald-900/10',borderClass: 'border-emerald-300/30 dark:border-emerald-600/20', isGap: true },
  'gap-judge':                { label: 'Gap Judge',                icon: ShieldCheck,  bgClass: 'bg-amber-50/30 dark:bg-amber-900/10',    borderClass: 'border-amber-300/30 dark:border-amber-600/20', isGap: true },
  'recovery':                 { label: 'Recovery',                 icon: Wrench,       bgClass: 'bg-rose-50/30 dark:bg-rose-900/10',      borderClass: 'border-rose-300/30 dark:border-rose-600/20', isGap: false },
  'fast-task':                { label: 'Fast Task',                icon: Zap,          bgClass: 'bg-cyan-50/50 dark:bg-cyan-900/20',      borderClass: 'border-cyan-300/40 dark:border-cyan-600/30', isGap: false },
  'quick-task':               { label: 'Quick Task',               icon: Zap,          bgClass: 'bg-cyan-50/50 dark:bg-cyan-900/20',      borderClass: 'border-cyan-300/40 dark:border-cyan-600/30', isGap: false },
  'manual':                   { label: 'Manual',                   icon: User,         bgClass: 'bg-gray-50/50 dark:bg-gray-900/20',      borderClass: 'border-gray-300/40 dark:border-gray-600/30', isGap: false },
  'unattributed':             { label: 'Unattributed',             icon: HelpCircle,   bgClass: 'bg-gray-50/30 dark:bg-gray-900/10',      borderClass: 'border-gray-300/30 dark:border-gray-600/20', isGap: false },
}

/**
 * Resolve the semantic session type for a step group.
 * This is the primary classification function — maps source + command
 * to one of the 14 canonical semantic types.
 */
export function resolveSemanticType(group: StepTimelineGroup): SemanticSessionType {
  if (group.command === 'unattributed') return 'unattributed'
  if (group.command === 'delegation') {
    // Check if this is a continuation delegation (after judge)
    if (group.source.startsWith('judge:')) return 'continuation-delegation'
    return 'delegation'
  }

  const isGap = group.source === 'judge:gaps'
  const isHung = group.source === 'judge:hung'
  const isFailed = group.source === 'judge:failed'

  if (isHung) return 'recovery'

  if (group.command.includes('plan') || group.command === 'add-phase') {
    if (group.command === 'add-phase') return 'add-phase'
    return isGap ? 'gap-planning' : (isFailed ? 'gap-planning' : 'planning')
  }
  if (group.command.includes('execute')) {
    return isGap ? 'gap-execution' : (isFailed ? 'gap-execution' : 'execution')
  }
  if (group.command.includes('judge') || group.command.includes('verify')) {
    return isGap ? 'gap-judge' : (isFailed ? 'gap-judge' : 'judge')
  }
  if (group.command === 'fast') return 'fast-task'
  if (group.command === 'quick') return 'quick-task'
  if (group.source === 'operator') return 'manual'

  return 'execution' // safe fallback
}

/**
 * Get the Lucide icon component for a step group based on its semantic type.
 */
export function getSemanticIcon(group: StepTimelineGroup): LucideIcon {
  const type = resolveSemanticType(group)
  return SEMANTIC_TYPE_CONFIG[type].icon
}

/**
 * Get the semantic color classes for a step group.
 */
export function getSemanticColors(group: StepTimelineGroup): { bgClass: string; borderClass: string } {
  const type = resolveSemanticType(group)
  const config = SEMANTIC_TYPE_CONFIG[type]
  return { bgClass: config.bgClass, borderClass: config.borderClass }
}

/**
 * Format a human-readable label for a step group.
 * Uses pre-computed semanticLabel if available, falls back to the semantic type model.
 *
 * Returns labels like: "Delegation", "Execution", "Judge", "Gap Planning",
 * "Gap Execution", "Gap Judge", "Recovery", "Planning", "Quick Task", "Unattributed"
 */
export function formatStepLabel(group: StepTimelineGroup): string {
  // Use pre-computed label from core if available
  if (group.semanticLabel) return group.semanticLabel

  // Fallback: resolve via the semantic type model
  const type = resolveSemanticType(group)
  return SEMANTIC_TYPE_CONFIG[type].label
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
  /** Human-readable label: "Execution", "Judge", "Gap Planning", etc. */
  label: string
  /** Resolved semantic session type key. */
  semanticType: SemanticSessionType
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
  /** True when this step is a gap-loop variant (gap-planning, gap-execution, gap-judge). */
  isGap: boolean
}

/**
 * Synthesize all display fields for a sticky step header from a StepTimelineGroup.
 *
 * Centralises all header field derivation in one place so step-content-pane,
 * timeline-stream, and any future surfaces can all use consistent data.
 */
export function synthesizeHeaderFields(group: StepTimelineGroup): SynthesizedHeaderFields {
  const label = formatStepLabel(group)
  const semanticType = resolveSemanticType(group)
  const isGap = SEMANTIC_TYPE_CONFIG[semanticType].isGap

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
    semanticType,
    stage,
    verdict,
    model,
    statusCounters,
    continuationReason,
    hasSummary: isJudgeStep(group) && !!group.verdictReason,
    isActive: group.status === 'running',
    isGap,
  }
}
