'use client'

import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipPopup, TooltipProvider } from '~/components/ui/tooltip'
import type { ConfigSource } from '@pilot/core/types.js'

// ── SectionProps (shared type used by all section components) ─────────────

export type SectionProps = {
  config: Record<string, { value: unknown; source: ConfigSource; envVar?: string }>
  formValues: Record<string, unknown>
  setField: (key: string, value: unknown) => void
  resetField: (key: string) => void
  systemInfo?: { totalRamMb: number; totalRamGb: number }
  defaults?: { modelProfile?: string; providerMode?: string; scope?: string | null }
  customModes?: string[]
}

// ── SourceBadge ───────────────────────────────────────────────────────────

/**
 * SourceBadge — shows where a config value comes from.
 * - 'env'         → blue Badge with tooltip showing env var name
 * - 'config'      → neutral Badge "config"
 * - 'default'     → muted outline Badge "default"
 * - 'auto-detect' → muted outline Badge "auto"
 */
export function SourceBadge({ source, envVar }: { source: ConfigSource; envVar?: string }) {
  const badge =
    source === 'env' ? (
      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">env</Badge>
    ) : source === 'config' ? (
      <Badge>config</Badge>
    ) : source === 'auto-detect' ? (
      <Badge variant="outline" className="text-muted-foreground">
        auto
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        default
      </Badge>
    )

  if (source === 'env' && envVar) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="cursor-default">{badge}</TooltipTrigger>
          <TooltipPopup className="text-xs">Set via {envVar}</TooltipPopup>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}

// ── ResetButton ───────────────────────────────────────────────────────────

/**
 * ResetButton — small icon button with ↺ icon.
 * Only visible when visible=true (opacity transition).
 */
export function ResetButton({ onReset, visible }: { onReset: () => void; visible: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      type="button"
      onClick={onReset}
      title="Reset to default"
      className={cn(
        'shrink-0 transition-opacity',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <RotateCcw className="h-3 w-3" />
    </Button>
  )
}

// ── SettingsField ─────────────────────────────────────────────────────────

export interface SettingsFieldProps {
  label: string
  description?: string
  source: ConfigSource
  envVar?: string
  /** True when value is at default (hides reset button) */
  isDefault: boolean
  onReset: () => void
  /** True when field is env-sourced (read-only) */
  readOnly: boolean
  children: ReactNode
}

/**
 * SettingsField — wraps each form field with a label row.
 * Label row: left side has label + description, right side has SourceBadge + ResetButton.
 * When readOnly, children are visually dimmed and pointer events disabled.
 */
export function SettingsField({
  label,
  description,
  source,
  envVar,
  isDefault,
  onReset,
  readOnly,
  children,
}: SettingsFieldProps) {
  return (
    <div className="space-y-2">
      {/* Label row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium leading-none">{label}</span>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SourceBadge source={source} envVar={envVar} />
          <ResetButton onReset={onReset} visible={!isDefault && !readOnly} />
        </div>
      </div>
      {/* Field content — dimmed + pointer-events disabled when read-only */}
      <div className={cn(readOnly && 'cursor-not-allowed opacity-60 [&_*]:pointer-events-none')}>
        {children}
      </div>
    </div>
  )
}
