'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '~/components/ui/table'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
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
import { getProjectsListFn, blockProjectFn, unblockProjectFn } from '~/lib/server-fns'
import type { ProjectWithStats } from '@pilot/core/types.js'

// ── Helpers ───────────────────────────────────────────────────────────────

function displayPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  return parts.slice(-2).join('/')
}

// ── ProjectRow ────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  onRefresh,
}: {
  project: ProjectWithStats
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [saving, setSaving] = useState(false)

  const isBlocked = project.status === 'blocked'

  const handleBlock = async () => {
    if (!blockReason.trim()) return
    setSaving(true)
    try {
      await blockProjectFn({ data: { projectPath: project.path, reason: blockReason.trim() } })
      toastManager.add({ title: 'Project blocked', type: 'success' })
      setBlockDialogOpen(false)
      setBlockReason('')
      onRefresh()
    } catch {
      toastManager.add({ title: 'Failed to block project', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleUnblock = async () => {
    setSaving(true)
    try {
      await unblockProjectFn({ data: { projectPath: project.path } })
      toastManager.add({ title: 'Project unblocked', type: 'success' })
      setUnblockDialogOpen(false)
      onRefresh()
    } catch {
      toastManager.add({ title: 'Failed to unblock project', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Main row */}
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <TableCell>
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-mono text-xs" title={project.path}>
              {displayPath(project.path)}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-sm">{project.owner ?? '—'}</TableCell>
        <TableCell>
          {isBlocked ? (
            <Badge variant="destructive">blocked</Badge>
          ) : (
            <Badge variant="success">active</Badge>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {project.defaultCategories?.join(', ') ?? '—'}
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="border-t bg-muted/30 px-4 py-3">
              {/* Blocked reason */}
              {isBlocked && project.blockedReason && (
                <div className="mb-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Blocked reason:</span>{' '}
                  {project.blockedReason}
                </div>
              )}

              {/* Job stats */}
              <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span>{project.activeJobCount} active</span>
                <span>{project.completedJobCount} completed</span>
                <span>{project.failedJobCount} failed</span>
              </div>

              {/* Actions */}
              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {isBlocked ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => setUnblockDialogOpen(true)}
                      disabled={saving}
                    >
                      Unblock
                    </Button>
                    <AlertDialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
                      <AlertDialogPopup>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Unblock project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will allow new jobs to be queued for{' '}
                            <code className="text-xs">{displayPath(project.path)}</code>.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => setUnblockDialogOpen(false)}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleUnblock()}
                            disabled={saving}
                          >
                            {saving ? 'Unblocking…' : 'Unblock'}
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogPopup>
                    </AlertDialog>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="destructive-outline"
                      type="button"
                      onClick={() => setBlockDialogOpen(true)}
                      disabled={saving}
                    >
                      Block
                    </Button>
                    <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
                      <DialogPopup showCloseButton={false}>
                        <DialogHeader>
                          <DialogTitle>Block Project</DialogTitle>
                        </DialogHeader>
                        <DialogPanel>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Reason</label>
                            <Input
                              value={blockReason}
                              onChange={(e) => setBlockReason(e.target.value)}
                              placeholder="Why is this project being blocked?"
                            />
                          </div>
                        </DialogPanel>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => {
                              setBlockDialogOpen(false)
                              setBlockReason('')
                            }}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            type="button"
                            onClick={() => void handleBlock()}
                            disabled={saving || !blockReason.trim()}
                          >
                            {saving ? 'Blocking…' : 'Block'}
                          </Button>
                        </DialogFooter>
                      </DialogPopup>
                    </Dialog>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── SectionProjects ───────────────────────────────────────────────────────

export function SectionProjects() {
  const queryClient = useQueryClient()

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['settings-projects'],
    queryFn: () => getProjectsListFn(),
    staleTime: 30_000,
  })

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings-projects'] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardPanel className="pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No projects registered.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use <code className="rounded bg-muted px-1 py-0.5 font-mono">pilot setup &lt;dir&gt;</code>{' '}
              to register a project.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">Project Path</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Categories</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <ProjectRow
                    key={project.path}
                    project={project}
                    onRefresh={handleRefresh}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardPanel>
    </Card>
  )
}
