/**
 * Centralized action registry for the Pilot web UI.
 *
 * Every proactive operation (retry, cancel, force-quit, unblock, navigate)
 * is defined here with availability predicates and disabled reasons.
 * This prevents one-off handlers from growing across the UI.
 */

import type { QueryClient } from '@tanstack/react-query'
import {
  retryJobFn,
  cancelJobFn,
  forceQuitJobFn,
  unblockProjectFn,
} from '~/lib/server-fns'

// ── Types ────────────────────────────────────────────────────────────────

export interface ActionDefinition {
  id: string
  label: string
  description: string
  group: 'job' | 'project' | 'navigation'
  /** Keyboard shortcut hint (display only, not bound here) */
  shortcut?: string
  /** Returns true if action is available, or a string explaining why not */
  available: (ctx: ActionContext) => true | string
  /** Execute the action. Returns void or a promise. */
  execute: (ctx: ActionContext) => void | Promise<void>
}

export interface ActionContext {
  /** Currently selected/viewed job, if any */
  job?: { id: string; status: string; project: string } | null
  /** Currently selected/viewed project path, if any */
  projectPath?: string | null
  /** Navigation function (from TanStack Router useNavigate) */
  navigate: (to: string) => void
  /** TanStack Query client for cache invalidation */
  queryClient: QueryClient
}

export interface ResolvedAction {
  definition: ActionDefinition
  enabled: boolean
  disabledReason: string | null
}

// ── Action Registry ──────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['running', 'pending'])

export const ACTION_REGISTRY: ActionDefinition[] = [
  // ── Job Actions ──────────────────────────────────────────────────────
  {
    id: 'retry-job',
    label: 'Retry Job',
    description: 'Re-queue a failed job for another attempt',
    group: 'job',
    available: (ctx) => {
      if (!ctx.job) return 'No job selected'
      if (ctx.job.status !== 'failed') return 'Job is not in failed state'
      return true
    },
    execute: async (ctx) => {
      if (!ctx.job) return
      await retryJobFn({ data: { jobId: ctx.job.id } })
      await ctx.queryClient.invalidateQueries()
    },
  },
  {
    id: 'cancel-job',
    label: 'Cancel Job',
    description: 'Cancel an active (running or pending) job',
    group: 'job',
    available: (ctx) => {
      if (!ctx.job) return 'No job selected'
      if (!ACTIVE_STATUSES.has(ctx.job.status)) return 'Job is not active'
      return true
    },
    execute: async (ctx) => {
      if (!ctx.job) return
      await cancelJobFn({ data: { jobId: ctx.job.id } })
      await ctx.queryClient.invalidateQueries()
    },
  },
  {
    id: 'force-quit-job',
    label: 'Force Quit Job',
    description: 'Forcefully terminate a running job',
    group: 'job',
    shortcut: '⌘⇧K',
    available: (ctx) => {
      if (!ctx.job) return 'No job selected'
      if (ctx.job.status !== 'running') return 'Job is not running'
      return true
    },
    execute: async (ctx) => {
      if (!ctx.job) return
      await forceQuitJobFn({ data: { jobId: ctx.job.id } })
      await ctx.queryClient.invalidateQueries()
    },
  },

  // ── Project Actions ──────────────────────────────────────────────────
  {
    id: 'unblock-project',
    label: 'Unblock Project',
    description: 'Clear blocked status on the project',
    group: 'project',
    available: (ctx) => {
      const path = ctx.projectPath ?? ctx.job?.project ?? null
      if (!path) return 'No project in context'
      return true
    },
    execute: async (ctx) => {
      const path = ctx.projectPath ?? ctx.job?.project ?? null
      if (!path) return
      await unblockProjectFn({ data: { projectPath: path } })
      await ctx.queryClient.invalidateQueries()
    },
  },

  // ── Navigation Actions ───────────────────────────────────────────────
  {
    id: 'view-job-detail',
    label: 'View Job Detail',
    description: 'Open the detail page for the current job',
    group: 'navigation',
    available: (ctx) => {
      if (!ctx.job) return 'No job selected'
      return true
    },
    execute: (ctx) => {
      if (!ctx.job) return
      ctx.navigate(`/jobs/${ctx.job.id}`)
    },
  },
  {
    id: 'back-to-dashboard',
    label: 'Back to Dashboard',
    description: 'Return to the main jobs dashboard',
    group: 'navigation',
    shortcut: '⌘/',
    available: () => true,
    execute: (ctx) => {
      ctx.navigate('/')
    },
  },
  {
    id: 'refresh',
    label: 'Refresh',
    description: 'Refresh all data from the server',
    group: 'navigation',
    shortcut: '⌘R',
    available: () => true,
    execute: async (ctx) => {
      await ctx.queryClient.invalidateQueries()
    },
  },
]

// ── Resolver ─────────────────────────────────────────────────────────────

/**
 * Evaluate every registered action's availability against the given context.
 * Returns a ResolvedAction[] with enabled/disabled state and reason.
 */
export function resolveActions(ctx: ActionContext): ResolvedAction[] {
  return ACTION_REGISTRY.map((definition) => {
    const result = definition.available(ctx)
    if (result === true) {
      return { definition, enabled: true, disabledReason: null }
    }
    return { definition, enabled: false, disabledReason: result }
  })
}
