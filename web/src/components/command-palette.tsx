/**
 * Command palette accessible via Cmd+K / Ctrl+K.
 *
 * Displays contextual actions from the centralized action registry,
 * grouped by category, with disabled reasons shown inline.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CommandDialog,
  CommandDialogPopup,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandPanel,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  CommandFooter,
} from '~/components/ui/command'
import { Kbd } from '~/components/ui/kbd'
import { useActions, type ActionContextInput } from '~/lib/use-actions'
import type { ResolvedAction } from '~/lib/actions'

// ── Group metadata ───────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  job: 'Job Actions',
  project: 'Project Actions',
  navigation: 'Navigation',
}

const GROUP_ORDER = ['job', 'project', 'navigation'] as const

// ── Helpers ──────────────────────────────────────────────────────────────

function matchesQuery(action: ResolvedAction, query: string): boolean {
  if (!query) return true
  const lower = query.toLowerCase()
  return (
    action.definition.label.toLowerCase().includes(lower) ||
    action.definition.description.toLowerCase().includes(lower)
  )
}

// ── Component ────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  ctx: ActionContextInput
}

export function CommandPalette({ ctx }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { actions, executeAction } = useActions(ctx)

  // ── Keyboard shortcut: Cmd+K / Ctrl+K ─────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Reset query when dialog opens
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  // ── Filter actions by search query ────────────────────────────────
  const filteredActions = useMemo(
    () => actions.filter((a) => matchesQuery(a, query)),
    [actions, query],
  )

  // ── Group filtered actions ────────────────────────────────────────
  const groupedActions = useMemo(() => {
    const groups = new Map<string, ResolvedAction[]>()
    for (const action of filteredActions) {
      const group = action.definition.group
      const existing = groups.get(group) ?? []
      existing.push(action)
      groups.set(group, existing)
    }
    return groups
  }, [filteredActions])

  // ── Handle item selection ─────────────────────────────────────────
  const handleSelect = useCallback(
    async (actionId: string) => {
      setOpen(false)
      await executeAction(actionId)
    },
    [executeAction],
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <Command>
          <CommandInput
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <CommandPanel>
            <CommandList>
              {filteredActions.length === 0 && (
                <CommandEmpty>No actions found.</CommandEmpty>
              )}
              {GROUP_ORDER.map((groupKey, groupIndex) => {
                const groupActions = groupedActions.get(groupKey)
                if (!groupActions?.length) return null
                return (
                  <div key={groupKey}>
                    {groupIndex > 0 &&
                      groupedActions.has(GROUP_ORDER[groupIndex - 1]!) && (
                        <CommandSeparator />
                      )}
                    <CommandGroup>
                      <CommandGroupLabel>
                        {GROUP_LABELS[groupKey]}
                      </CommandGroupLabel>
                      {groupActions.map((resolved) => (
                        <CommandItem
                          key={resolved.definition.id}
                          value={resolved.definition.id}
                          disabled={!resolved.enabled}
                          onClick={() => {
                            if (resolved.enabled) {
                              void handleSelect(resolved.definition.id)
                            }
                          }}
                        >
                          <div className="flex flex-1 items-center justify-between gap-2">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={
                                  resolved.enabled
                                    ? ''
                                    : 'text-muted-foreground'
                                }
                              >
                                {resolved.definition.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {resolved.enabled
                                  ? resolved.definition.description
                                  : resolved.disabledReason}
                              </span>
                            </div>
                            {resolved.definition.shortcut && (
                              <CommandShortcut>
                                {resolved.definition.shortcut}
                              </CommandShortcut>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </div>
                )
              })}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> select
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd> close
            </span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  )
}
