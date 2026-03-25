'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import { Tabs, TabsList, TabsTab, TabsPanel } from '~/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '~/components/ui/table'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '~/components/ui/select'
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from '~/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '~/components/ui/alert-dialog'
import { Input } from '~/components/ui/input'
import { toastManager } from '~/components/ui/toast'
import {
  updateModelMappingFn,
  addProviderModeFn,
  removeProviderModeFn,
} from '~/lib/server-fns'
import type { ModelTableData } from '~/hooks/use-settings'
import type { ModelProfile } from '@pilot/core/types.js'

// ── Constants ─────────────────────────────────────────────────────────────

const AVAILABLE_MODELS = [
  'anthropic/claude-opus-4-6',
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5.4',
] as const

const PROFILES: ModelProfile[] = ['quality', 'balanced', 'budget']

// ── Helpers ───────────────────────────────────────────────────────────────

function agentDisplayName(key: string): string {
  const stripped = key.replace(/^gsd-/, '')
  return stripped
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function scopeDisplayName(key: string): string {
  const stripped = key.replace(/^_top:/, '')
  const capitalized = stripped.charAt(0).toUpperCase() + stripped.slice(1)
  return `${capitalized} (top-level)`
}

// ── ModelCell — inline editing ────────────────────────────────────────────

function ModelCell({
  entry,
  onSave,
}: {
  entry: { model: string; variant?: string } | undefined
  onSave: (model: string, variant?: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editModel, setEditModel] = useState(entry?.model ?? '')
  const [editVariant, setEditVariant] = useState(entry?.variant ?? '')

  const displayModel = entry?.model ?? '—'
  const displayVariant = entry?.variant
  const isOpenAI = editModel.startsWith('openai/')

  const handleOpen = useCallback(() => {
    setEditModel(entry?.model ?? '')
    setEditVariant(entry?.variant ?? '')
    setEditing(true)
  }, [entry?.model, entry?.variant])

  const handleSave = async () => {
    setSaving(true)
    try {
      const variant = isOpenAI && editVariant ? editVariant : undefined
      await onSave(editModel, variant)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="group flex w-full items-start gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs">{displayModel}</div>
          {displayVariant && (
            <Badge variant="outline" size="sm" className="mt-0.5">
              {displayVariant}
            </Badge>
          )}
        </div>
        <PencilIcon className="mt-0.5 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40" />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-1">
      <Select
        value={editModel}
        onValueChange={(val) => {
          const model = val ?? ''
          setEditModel(model)
          if (!model.startsWith('openai/')) {
            setEditVariant('')
          } else if (!editVariant) {
            setEditVariant('medium')
          }
        }}
        disabled={saving}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_MODELS.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isOpenAI && (
        <Select
          value={editVariant || 'medium'}
          onValueChange={(val) => setEditVariant(val ?? '')}
          disabled={saving}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">high</SelectItem>
            <SelectItem value="medium">medium</SelectItem>
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-1">
        <Button size="xs" onClick={() => void handleSave()} disabled={saving} type="button">
          {saving ? '…' : 'Save'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={saving}
          type="button"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── AddModeDialog ─────────────────────────────────────────────────────────

function AddModeDialog({
  modes,
  onAdd,
}: {
  modes: string[]
  onAdd: (name: string, copyFrom?: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd(name.trim(), copyFrom || undefined)
      setName('')
      setCopyFrom('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <PlusIcon className="h-4 w-4" />
        Add Custom Mode
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Custom Provider Mode</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. my-custom-mode"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Copy from (optional)</label>
                <Select value={copyFrom} onValueChange={(val) => setCopyFrom(val ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="(start empty)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">(start empty)</SelectItem>
                    {modes.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={saving || !name.trim()}
              type="button"
            >
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}

// ── SectionModels ─────────────────────────────────────────────────────────

export type SectionModelsProps = {
  modelTable: ModelTableData | undefined
  refetchModels: () => void
}

export function SectionModels({ modelTable, refetchModels }: SectionModelsProps) {
  const queryClient = useQueryClient()
  const modes = modelTable?.modes ?? []
  const customModes = modelTable?.customModes ?? []
  const table = modelTable?.table ?? {}

  const [activeMode, setActiveMode] = useState<string>(modes[0] ?? 'claude-only')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const currentMode = activeMode
  const isCustomMode = customModes.includes(currentMode)
  const modeTable = table[currentMode] ?? {}
  const agentKeys = Object.keys(modeTable).filter((k) => !k.startsWith('_top:'))
  const scopeKeys = Object.keys(modeTable).filter((k) => k.startsWith('_top:'))

  const invalidateAndRefetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['settings-models'] })
    refetchModels()
  }, [queryClient, refetchModels])

  const handleSaveModel = useCallback(
    async (agentKey: string, profile: ModelProfile, model: string, variant?: string) => {
      try {
        await updateModelMappingFn({
          data: { providerMode: currentMode, agent: agentKey, profile, model, variant },
        })
        await invalidateAndRefetch()
      } catch {
        toastManager.add({ title: 'Failed to update model', type: 'error' })
      }
    },
    [currentMode, invalidateAndRefetch],
  )

  const handleAddMode = useCallback(
    async (name: string, copyFrom?: string) => {
      try {
        const result = await addProviderModeFn({ data: { name, copyFrom } })
        if (!result.ok) {
          toastManager.add({
            title: 'Failed to add mode',
            description: result.error,
            type: 'error',
          })
          return
        }
        await invalidateAndRefetch()
        setActiveMode(name)
        toastManager.add({ title: `Mode "${name}" created`, type: 'success' })
      } catch {
        toastManager.add({ title: 'Failed to add mode', type: 'error' })
      }
    },
    [invalidateAndRefetch],
  )

  const handleDeleteMode = useCallback(async () => {
    if (!isCustomMode) return
    try {
      const result = await removeProviderModeFn({ data: { name: currentMode } })
      if (!result.ok) {
        toastManager.add({
          title: 'Failed to delete mode',
          description: result.error,
          type: 'error',
        })
        return
      }
      await invalidateAndRefetch()
      const fallback = modes.find((m) => !customModes.includes(m)) ?? modes[0]
      setActiveMode(fallback ?? 'claude-only')
      setDeleteDialogOpen(false)
      toastManager.add({ title: `Mode "${currentMode}" deleted`, type: 'success' })
    } catch {
      toastManager.add({ title: 'Failed to delete mode', type: 'error' })
    }
  }, [isCustomMode, currentMode, invalidateAndRefetch, modes, customModes])

  if (!modelTable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
        </CardHeader>
        <CardPanel className="pt-0">
          <p className="text-sm text-muted-foreground">Loading model configuration…</p>
        </CardPanel>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Models</CardTitle>
      </CardHeader>
      <CardPanel className="pt-0">
        <Tabs
          value={currentMode}
          onValueChange={(val) => {
            if (val) setActiveMode(val)
          }}
        >
          {/* Scrollable tab bar */}
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList>
              {modes.map((mode) => (
                <TabsTab key={mode} value={mode}>
                  {mode}
                </TabsTab>
              ))}
            </TabsList>
          </div>

          {/* Action buttons row */}
          <div className="mt-3 flex items-center justify-end gap-2">
            <AddModeDialog modes={modes} onAdd={handleAddMode} />
            {isCustomMode && (
              <>
                <Button
                  size="sm"
                  variant="destructive-outline"
                  type="button"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-1.5"
                >
                  <Trash2Icon className="h-4 w-4" />
                  Delete Mode
                </Button>
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogPopup>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{currentMode}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove the custom provider mode and all its model
                        assignments. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setDeleteDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        type="button"
                        onClick={() => void handleDeleteMode()}
                      >
                        Delete
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogPopup>
                </AlertDialog>
              </>
            )}
          </div>

          {/* Tab panels */}
          {modes.map((mode) => (
            <TabsPanel key={mode} value={mode}>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-36">Agent Role</TableHead>
                      {PROFILES.map((p) => (
                        <TableHead key={p} className="capitalize">
                          {p}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Agent rows */}
                    {agentKeys.map((agentKey) => (
                      <TableRow key={agentKey}>
                        <TableCell className="text-sm font-medium">
                          {agentDisplayName(agentKey)}
                        </TableCell>
                        {PROFILES.map((profile) => (
                          <TableCell key={profile} className="min-w-48 align-top">
                            <ModelCell
                              entry={table[mode]?.[agentKey]?.[profile]}
                              onSave={(model, variant) =>
                                handleSaveModel(agentKey, profile, model, variant)
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {/* Scope section separator */}
                    {scopeKeys.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Scopes
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* Scope rows */}
                    {scopeKeys.map((scopeKey) => (
                      <TableRow key={scopeKey}>
                        <TableCell className="text-sm text-muted-foreground">
                          {scopeDisplayName(scopeKey)}
                        </TableCell>
                        {PROFILES.map((profile) => (
                          <TableCell key={profile} className="min-w-48 align-top">
                            <ModelCell
                              entry={table[mode]?.[scopeKey]?.[profile]}
                              onSave={(model, variant) =>
                                handleSaveModel(scopeKey, profile, model, variant)
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsPanel>
          ))}
        </Tabs>
      </CardPanel>
    </Card>
  )
}
