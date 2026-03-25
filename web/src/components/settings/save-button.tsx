'use client'

import { Loader2, Save } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'

export interface SaveButtonProps {
  isDirty: boolean
  dirtyCount: number
  isSaving: boolean
  onSave: () => void
}

/**
 * SaveButton — floating save button that appears when the form is dirty.
 * Position: fixed bottom-6 right-6, z-50.
 * Shows dirty section count via Badge, spinner when saving.
 */
export function SaveButton({ isDirty, dirtyCount, isSaving, onSave }: SaveButtonProps) {
  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 transition-all duration-200',
        isDirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <Button onClick={onSave} disabled={isSaving} className="shadow-lg">
        {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
        Save Changes
        {dirtyCount > 0 && (
          <Badge variant="secondary" size="sm" className="ml-1">
            {dirtyCount}
          </Badge>
        )}
      </Button>
    </div>
  )
}
