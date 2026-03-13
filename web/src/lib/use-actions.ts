/**
 * React hook computing available/disabled actions from current context.
 *
 * Wraps the centralized action registry with React Query integration
 * and provides a convenience executeAction helper.
 */

import { useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  resolveActions,
  type ActionContext,
  type ResolvedAction,
} from '~/lib/actions'

/** Partial context — queryClient is injected by the hook. */
export type ActionContextInput = Omit<ActionContext, 'queryClient'>

export interface UseActionsReturn {
  /** All resolved actions (enabled + disabled) */
  actions: ResolvedAction[]
  /** Only the actions that are currently available */
  enabledActions: ResolvedAction[]
  /** Execute an action by ID. No-ops if action not found or disabled. */
  executeAction: (actionId: string) => Promise<void>
}

/**
 * Compute resolved actions from current UI context.
 *
 * Usage:
 * ```tsx
 * const { actions, enabledActions, executeAction } = useActions({
 *   job: currentJob,
 *   projectPath: currentJob?.project,
 *   navigate: (to) => navigate({ to }),
 * })
 * ```
 */
export function useActions(ctx: ActionContextInput): UseActionsReturn {
  const queryClient = useQueryClient()

  const fullCtx: ActionContext = useMemo(
    () => ({ ...ctx, queryClient }),
    [ctx, queryClient],
  )

  const actions = useMemo(() => resolveActions(fullCtx), [fullCtx])

  const enabledActions = useMemo(
    () => actions.filter((a) => a.enabled),
    [actions],
  )

  const executeAction = useCallback(
    async (actionId: string) => {
      const resolved = actions.find((a) => a.definition.id === actionId)
      if (!resolved?.enabled) return
      await resolved.definition.execute(fullCtx)
    },
    [actions, fullCtx],
  )

  return { actions, enabledActions, executeAction }
}
