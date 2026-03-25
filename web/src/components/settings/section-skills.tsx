'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TagIcon, Trash2Icon, ChevronDownIcon, ChevronRightIcon, LoaderIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Checkbox } from '~/components/ui/checkbox'
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
import { toastManager } from '~/components/ui/toast'
import {
  getSkillsListFn,
  installSkillFn,
  removeSkillFn,
  updateSkillTagsFn,
} from '~/lib/server-fns'
import type { SkillEntry } from '@pilot/core/types.js'

// ── InstallForm ───────────────────────────────────────────────────────────

function InstallForm({
  categories,
  onInstalled,
}: {
  categories: readonly string[]
  onInstalled: () => void
}) {
  const [repo, setRepo] = useState('')
  const [skill, setSkill] = useState('')
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  const handleInstall = async () => {
    if (!repo.trim() || !skill.trim()) return
    setInstalling(true)
    setError(null)
    try {
      const result = await installSkillFn({
        data: { repo: repo.trim(), skill: skill.trim(), categories: selectedCats },
      })
      if (!result.ok) {
        setError(result.error ?? 'Install failed')
        return
      }
      toastManager.add({ title: `Skill "${skill}" installed`, type: 'success' })
      setRepo('')
      setSkill('')
      setSelectedCats([])
      onInstalled()
    } catch (err) {
      setError(String(err))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="mb-6 rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-semibold">Install Skill</h3>
      <div className="flex flex-wrap gap-2">
        <Input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="e.g. github.com/org/skills"
          className="min-w-48 flex-1"
        />
        <Input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          placeholder="Skill name (e.g. frontend-design)"
          className="min-w-40 flex-1"
        />
        <Button
          type="button"
          onClick={() => void handleInstall()}
          disabled={installing || !repo.trim() || !skill.trim()}
          className="shrink-0"
        >
          {installing ? (
            <>
              <LoaderIcon className="h-4 w-4 animate-spin" />
              Installing…
            </>
          ) : (
            'Install'
          )}
        </Button>
      </div>

      {/* Category selection */}
      <div className="mt-3">
        <p className="mb-2 text-xs text-muted-foreground">Categories (optional):</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <label key={cat} className="flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={selectedCats.includes(cat)}
                onCheckedChange={() => toggleCat(cat)}
              />
              <span className="text-xs">{cat}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ── EditCategoriesDialog ──────────────────────────────────────────────────

function EditCategoriesDialog({
  skill,
  categories,
  onSaved,
}: {
  skill: SkillEntry
  categories: readonly string[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(skill.categories)
  const [saving, setSaving] = useState(false)

  const toggle = (cat: string) => {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSkillTagsFn({ data: { name: skill.name, categories: selected } })
      toastManager.add({ title: 'Categories updated', type: 'success' })
      setOpen(false)
      onSaved()
    } catch {
      toastManager.add({ title: 'Failed to update categories', type: 'error' })
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
        onClick={() => {
          setSelected(skill.categories)
          setOpen(true)
        }}
        className="gap-1.5"
      >
        <TagIcon className="h-3.5 w-3.5" />
        Edit Categories
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Edit Categories — {skill.name}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((cat) => (
                <label key={cat} className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={selected.includes(cat)}
                    onCheckedChange={() => toggle(cat)}
                  />
                  <span className="text-sm">{cat}</span>
                </label>
              ))}
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
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}

// ── RemoveSkillDialog ─────────────────────────────────────────────────────

function RemoveSkillDialog({
  skill,
  onRemoved,
}: {
  skill: SkillEntry
  onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await removeSkillFn({ data: { name: skill.name } })
      toastManager.add({ title: `Skill "${skill.name}" removed`, type: 'success' })
      setOpen(false)
      onRemoved()
    } catch {
      toastManager.add({ title: 'Failed to remove skill', type: 'error' })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive-outline"
        type="button"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Trash2Icon className="h-3.5 w-3.5" />
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{skill.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the skill from the registry. It will no longer be injected into
              agent contexts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}

// ── SkillRow ──────────────────────────────────────────────────────────────

function SkillRow({
  skill,
  categories,
  onChanged,
}: {
  skill: SkillEntry
  categories: readonly string[]
  onChanged: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{skill.name}</span>
          {skill.skill && skill.skill !== skill.name && (
            <Badge variant="outline" size="sm" className="font-mono">
              {skill.skill}
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{skill.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {skill.categories.length > 0 ? (
            skill.categories.map((cat) => (
              <Badge key={cat} variant="secondary" size="sm">
                {cat}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">(no categories)</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <EditCategoriesDialog skill={skill} categories={categories} onSaved={onChanged} />
        <RemoveSkillDialog skill={skill} onRemoved={onChanged} />
      </div>
    </div>
  )
}

// ── CategoriesReference ───────────────────────────────────────────────────

function CategoriesReference({
  categoryInfo,
}: {
  categoryInfo: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4 rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">Available Categories</span>
      </button>
      {expanded && (
        <div className="border-t p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(categoryInfo).map(([cat, desc]) => (
              <div key={cat} className="flex gap-2">
                <Badge variant="outline" size="sm" className="shrink-0">
                  {cat}
                </Badge>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SectionSkills ─────────────────────────────────────────────────────────

export function SectionSkills() {
  const queryClient = useQueryClient()

  const { data: skillsData, isLoading } = useQuery({
    queryKey: ['settings-skills'],
    queryFn: () => getSkillsListFn(),
    staleTime: 30_000,
  })

  const skills = skillsData?.skills ?? []
  const categories = skillsData?.categories ?? []
  const categoryInfo = skillsData?.categoryInfo ?? {}

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings-skills'] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardPanel className="pt-0">
        {/* Install form */}
        <InstallForm categories={categories} onInstalled={handleRefresh} />

        {/* Skills list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading skills…</p>
        ) : skills.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No skills installed.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one above or use{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">pilot skills add</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                categories={categories}
                onChanged={handleRefresh}
              />
            ))}
          </div>
        )}

        {/* Available categories reference */}
        <CategoriesReference categoryInfo={categoryInfo} />
      </CardPanel>
    </Card>
  )
}
