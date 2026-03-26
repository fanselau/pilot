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
import {
  Route, FolderPlus, Map, Hammer, Scale, Forward, Eye,
  MapPin, Wrench, ShieldCheck, Zap, User, HelpCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Semantic Session Type Model ───────────────────────────────────────────

export type SemanticSessionType =
  | 'delegation'
  | 'add-phase'
  | 'planning'
  | 'execution'
  | 'ui-review'
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
  /** CSS class for pastel background at depth 0 (step header) */
  bgClass: string
  /** CSS class for darker background at depth 1+ (subsession header) */
  subBgClass: string
  /** CSS class for border accent */
  borderClass: string
  /** Is this a gap-loop variant? */
  isGap: boolean
}

export const SEMANTIC_TYPE_CONFIG: Record<SemanticSessionType, SemanticTypeConfig> = {
  'delegation':               { label: 'Delegation',               icon: Route,        bgClass: 'bg-slate-50/50 dark:bg-slate-900/20',    subBgClass: 'bg-slate-100/40 dark:bg-slate-900/40',    borderClass: 'border-slate-300/40 dark:border-slate-600/30', isGap: false },
  'add-phase':                { label: 'Add Phase',                icon: FolderPlus,   bgClass: 'bg-violet-50/50 dark:bg-violet-900/20',  subBgClass: 'bg-violet-100/40 dark:bg-violet-900/40',  borderClass: 'border-violet-300/40 dark:border-violet-600/30', isGap: false },
  'planning':                 { label: 'Planning',                 icon: Map,          bgClass: 'bg-blue-50/50 dark:bg-blue-900/20',      subBgClass: 'bg-blue-100/40 dark:bg-blue-900/40',      borderClass: 'border-blue-300/40 dark:border-blue-600/30', isGap: false },
  'execution':                { label: 'Execution',                icon: Hammer,       bgClass: 'bg-emerald-50/50 dark:bg-emerald-900/20',subBgClass: 'bg-emerald-100/40 dark:bg-emerald-900/40',borderClass: 'border-emerald-300/40 dark:border-emerald-600/30', isGap: false },
  'ui-review':                { label: 'UI Review',                icon: Eye,          bgClass: 'bg-sky-50/50 dark:bg-sky-900/20',        subBgClass: 'bg-sky-100/40 dark:bg-sky-900/40',        borderClass: 'border-sky-300/40 dark:border-sky-600/30', isGap: false },
  'judge':                    { label: 'Judge',                    icon: Scale,        bgClass: 'bg-amber-50/50 dark:bg-amber-900/20',    subBgClass: 'bg-amber-100/40 dark:bg-amber-900/40',    borderClass: 'border-amber-300/40 dark:border-amber-600/30', isGap: false },
  'continuation-delegation':  { label: 'Continuation Delegation',  icon: Forward,      bgClass: 'bg-orange-50/50 dark:bg-orange-900/20',  subBgClass: 'bg-orange-100/40 dark:bg-orange-900/40',  borderClass: 'border-orange-300/40 dark:border-orange-600/30', isGap: false },
  'gap-planning':             { label: 'Gap Planning',             icon: MapPin,       bgClass: 'bg-blue-50/30 dark:bg-blue-900/10',      subBgClass: 'bg-blue-100/30 dark:bg-blue-900/30',      borderClass: 'border-blue-300/30 dark:border-blue-600/20', isGap: true },
  'gap-execution':            { label: 'Gap Execution',            icon: Wrench,       bgClass: 'bg-emerald-50/30 dark:bg-emerald-900/10',subBgClass: 'bg-emerald-100/30 dark:bg-emerald-900/30',borderClass: 'border-emerald-300/30 dark:border-emerald-600/20', isGap: true },
  'gap-judge':                { label: 'Gap Judge',                icon: ShieldCheck,  bgClass: 'bg-amber-50/30 dark:bg-amber-900/10',    subBgClass: 'bg-amber-100/30 dark:bg-amber-900/30',    borderClass: 'border-amber-300/30 dark:border-amber-600/20', isGap: true },
  'recovery':                 { label: 'Recovery',                 icon: Wrench,       bgClass: 'bg-rose-50/30 dark:bg-rose-900/10',      subBgClass: 'bg-rose-100/30 dark:bg-rose-900/30',      borderClass: 'border-rose-300/30 dark:border-rose-600/20', isGap: false },
  'fast-task':                { label: 'Fast Task',                icon: Zap,          bgClass: 'bg-cyan-50/50 dark:bg-cyan-900/20',      subBgClass: 'bg-cyan-100/40 dark:bg-cyan-900/40',      borderClass: 'border-cyan-300/40 dark:border-cyan-600/30', isGap: false },
  'quick-task':               { label: 'Quick Task',               icon: Zap,          bgClass: 'bg-cyan-50/50 dark:bg-cyan-900/20',      subBgClass: 'bg-cyan-100/40 dark:bg-cyan-900/40',      borderClass: 'border-cyan-300/40 dark:border-cyan-600/30', isGap: false },
  'manual':                   { label: 'Manual',                   icon: User,         bgClass: 'bg-gray-50/50 dark:bg-gray-900/20',      subBgClass: 'bg-gray-100/40 dark:bg-gray-900/40',      borderClass: 'border-gray-300/40 dark:border-gray-600/30', isGap: false },
  'unattributed':             { label: 'Unattributed',             icon: HelpCircle,   bgClass: 'bg-gray-50/30 dark:bg-gray-900/10',      subBgClass: 'bg-gray-100/30 dark:bg-gray-900/30',      borderClass: 'border-gray-300/30 dark:border-gray-600/20', isGap: false },
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
  if (group.command === 'ui-review') return 'ui-review'
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
 * Resolve a SemanticSessionType from a raw branch/session title string.
 *
 * Unlike resolveSemanticType (which requires a full StepTimelineGroup),
 * this function operates on a plain title string — used by branch headers
 * where only the session title is available. Always returns a non-null type;
 * defaults to 'execution' for unrecognized titles.
 */
export function resolveSemanticHint(title: string): SemanticSessionType {
  const lower = title.toLowerCase()
  if (lower.includes('plan-phase') || lower.includes('planning')) return 'planning'
  if (lower.includes('ui-review')) return 'ui-review'
  if (lower.includes('execute-phase') || lower.includes('execution')) return 'execution'
  if (lower.includes('judge') || lower.includes('verify') || lower.includes('verification')) return 'judge'
  // redelegate/continuation MUST come before generic delegate — 'redelegate' contains 'delegate'
  if (lower.includes('redelegate') || lower.includes('continuation')) return 'continuation-delegation'
  if (lower.includes('delegation') || lower.includes('delegate')) return 'delegation'
  if (lower.includes('add-phase')) return 'add-phase'
  if (lower.includes('gap')) return 'gap-execution'  // generic gap fallback
  if (lower.includes('fast')) return 'fast-task'
  if (lower.includes('quick')) return 'quick-task'
  if (lower.includes('recovery')) return 'recovery'
  return 'execution'  // safe default — most branches are execution sub-agents
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
  if (group.command === 'ui-review') return 'step-ui-review'
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
  /** First model observed in subsessions, null if not available. */
  model: string | null
  /** Subsession counts: active/done/total. Null if no subsessions. */
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
    else if (group.command === 'ui-review') stage = 'Design QA'
    else if (group.command.includes('execute')) stage = 'Execution'
    else if (group.command.includes('judge') || group.command.includes('verify')) stage = 'Verification'
    else if (group.command === 'fast') stage = 'Fast Task'
    else if (group.command === 'quick') stage = 'Quick Task'
  }

  // Verdict — first 40 chars of verdictReason for compact header display
  const verdict = group.verdictReason
    ? group.verdictReason.slice(0, 40)
    : null

  // Model — extracted from the first subsession that has model data
  let model: string | null = null
  const subsections = (group.sections ?? []).filter((s) => s.depth > 0)
  for (const section of subsections) {
    if (section.models.length > 0) {
      model = section.models[0]
      break
    }
  }

  // Status counters — subsession sections only
  const statusCounters = subsections.length > 0
    ? {
        active: subsections.filter((s) => s.status === 'active').length,
        done: subsections.filter((s) => s.status === 'done').length,
        total: subsections.length,
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

// ── Branch Identity Resolution ────────────────────────────────────────────

export interface BranchIdentity {
  label: string
  role: string | null
  purpose: string | null
  semanticHint: string
}

/** Derive a human-readable identity from a session title. */
export function deriveBranchIdentity(title: string): BranchIdentity {
  const normalized = title.trim()
  if (!normalized) {
    return { label: 'Sub-agent', role: null, purpose: null, semanticHint: resolveSemanticHint('') }
  }

  const semanticHint = resolveSemanticHint(normalized)

  // pilot-delegate-* / pilot-redelegate-*
  const pilotMatch = normalized.match(/^pilot-(redelegate|delegate)-/)
  if (pilotMatch) {
    const agentRole = `pilot-${pilotMatch[1]}`
    return { label: agentRole, role: agentRole, purpose: normalized, semanticHint }
  }

  // GSD runner command titles
  const gsdMatch = normalized.match(/-((?:add|plan|execute|verify|ui)-phase|ui-review|judge|debugger|fast|quick|new-project|new-milestone|audit-milestone)-/)
  if (gsdMatch) {
    return { label: gsdMatch[1], role: gsdMatch[1], purpose: normalized, semanticHint }
  }

  // "Task: role — purpose"
  if (normalized.toLowerCase().startsWith('task:')) {
    const payload = normalized.slice(5).trim()
    const emIdx = payload.indexOf(' — ')
    const hyIdx = payload.indexOf(' - ')
    const splitIdx = [emIdx, hyIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1
    const role = (splitIdx >= 0 ? payload.slice(0, splitIdx) : payload).trim() || null
    const purpose = splitIdx >= 0 ? payload.slice(splitIdx + 3).trim() || null : null
    return { label: normalized, role, purpose, semanticHint }
  }

  // "role: purpose" (colon within first 28 chars)
  const colonIdx = normalized.indexOf(':')
  if (colonIdx > 0 && colonIdx < 28) {
    const maybeRole = normalized.slice(0, colonIdx).trim()
    const maybePurpose = normalized.slice(colonIdx + 1).trim()
    if (maybeRole && maybePurpose) {
      return { label: normalized, role: maybeRole, purpose: maybePurpose, semanticHint }
    }
  }

  return { label: normalized, role: null, purpose: null, semanticHint }
}
