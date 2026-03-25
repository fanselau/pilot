/**
 * useSettings hook — manages all settings page state.
 *
 * Fetches all settings data on mount, tracks dirty form state per field,
 * provides save function that writes only changed fields to ~/.pilot/config.json.
 */

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getFullConfigFn,
  getModelTableFn,
  getSkillsListFn,
  getSystemInfoFn,
  updateConfigFn,
} from '~/lib/server-fns'
import type { ConfigFileSchema, ConfigSource, ModelEntry, SkillEntry } from '@pilot/core/types.js'

// ── Types ────────────────────────────────────────────────────────────────

export type ConfigValueWithSource = {
  value: string | number | boolean | null
  source: ConfigSource
  envVar?: string
}

export type ConfigWithSources = Record<string, ConfigValueWithSource>

export type ModelTableData = {
  modes: string[]
  customModes: string[]
  table: Record<string, Record<string, Record<string, ModelEntry>>>
}

export type SkillsData = {
  skills: SkillEntry[]
  categories: readonly string[]
  categoryInfo: Record<string, string>
}

export type SystemInfoData = {
  totalRamMb: number
  totalRamGb: number
}

// ── Key-to-section mapping ────────────────────────────────────────────────

const KEY_TO_SECTION: Record<string, string> = {
  projectDir: 'general',
  'runner.maxParallel': 'runner',
  'runner.queueGraceSeconds': 'runner',
  'memory.sessionMaxMb': 'memory',
  'memory.reservedMb': 'memory',
  'memory.killThresholdMb': 'memory',
  'defaults.modelProfile': 'job-defaults',
  'defaults.providerMode': 'job-defaults',
  'defaults.notifyTarget': 'job-defaults',
  'defaults.scope': 'job-defaults',
  'notifications.openclawHooksUrl': 'notifications',
  'notifications.openclawHooksToken': 'notifications',
  'notifications.telegramBotToken': 'notifications',
  'notifications.telegramChatId': 'notifications',
  'logging.level': 'logging',
  'logging.noColor': 'logging',
}

// ── useSettings hook ──────────────────────────────────────────────────────

export function useSettings() {
  const queryClient = useQueryClient()

  // ── Data fetching ──────────────────────────────────────────────────────

  const configQuery = useQuery({
    queryKey: ['settings-config'],
    queryFn: () => getFullConfigFn(),
    staleTime: Infinity,
  })

  const modelTableQuery = useQuery({
    queryKey: ['settings-models'],
    queryFn: () => getModelTableFn(),
    staleTime: Infinity,
  })

  const skillsQuery = useQuery({
    queryKey: ['settings-skills'],
    queryFn: () => getSkillsListFn(),
    staleTime: Infinity,
  })

  const systemInfoQuery = useQuery({
    queryKey: ['settings-system-info'],
    queryFn: () => getSystemInfoFn(),
    staleTime: Infinity,
  })

  // ── Form state ─────────────────────────────────────────────────────────

  // formValues: key → current value (possibly unsaved)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})

  // dirtyFields: tracks which keys have been modified from original
  const [dirtyFields, setDirtyFields] = useState<Map<string, boolean>>(new Map())

  const [isSaving, setIsSaving] = useState(false)

  // Compute effective value for a key: formValues overrides config data
  const getEffectiveValue = useCallback(
    (key: string): unknown => {
      if (dirtyFields.has(key)) {
        return formValues[key]
      }
      return configQuery.data?.config[key]?.value ?? null
    },
    [dirtyFields, formValues, configQuery.data],
  )

  // Set a field value and mark it dirty
  const setField = useCallback((key: string, value: unknown) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
    setDirtyFields(prev => {
      const next = new Map(prev)
      next.set(key, true)
      return next
    })
  }, [])

  // Reset a field to its original value
  const resetField = useCallback((key: string) => {
    setFormValues(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDirtyFields(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  // ── Computed dirty state ───────────────────────────────────────────────

  const isDirty = dirtyFields.size > 0

  const dirtySections = useMemo((): Set<string> => {
    const sections = new Set<string>()
    for (const key of dirtyFields.keys()) {
      const section = KEY_TO_SECTION[key]
      if (section) sections.add(section)
    }
    return sections
  }, [dirtyFields])

  const dirtyCount = dirtySections.size

  // ── Save flow ──────────────────────────────────────────────────────────

  const save = useCallback(async (): Promise<{ ok: boolean; errors?: Record<string, string> }> => {
    if (!isDirty) return { ok: true }

    setIsSaving(true)

    try {
      // Build partial ConfigFileSchema from dirty fields
      const updates: Partial<ConfigFileSchema> = {}

      for (const [key] of dirtyFields) {
        const value = formValues[key]

        // Map flat keys to nested ConfigFileSchema structure
        if (key === 'projectDir') {
          updates.projectDir = value as string
        } else if (key === 'runner.maxParallel') {
          updates.runner = { ...updates.runner, maxParallel: value as number | null }
        } else if (key === 'runner.queueGraceSeconds') {
          updates.runner = { ...updates.runner, queueGraceSeconds: value as number }
        } else if (key === 'memory.sessionMaxMb') {
          updates.memory = { ...updates.memory, sessionMaxMb: value as number }
        } else if (key === 'memory.reservedMb') {
          updates.memory = { ...updates.memory, reservedMb: value as number }
        } else if (key === 'memory.killThresholdMb') {
          updates.memory = { ...updates.memory, killThresholdMb: value as number }
        } else if (key === 'defaults.modelProfile') {
          updates.defaults = { ...updates.defaults, modelProfile: value as 'quality' | 'balanced' | 'budget' }
        } else if (key === 'defaults.providerMode') {
          updates.defaults = { ...updates.defaults, providerMode: value as string }
        } else if (key === 'defaults.notifyTarget') {
          updates.defaults = { ...updates.defaults, notifyTarget: value as string | null }
        } else if (key === 'defaults.scope') {
          updates.defaults = { ...updates.defaults, scope: value as 'quick' | 'phase' | 'debug' | 'fast' | null }
        } else if (key === 'notifications.openclawHooksUrl') {
          updates.notifications = { ...updates.notifications, openclawHooksUrl: value as string | null }
        } else if (key === 'notifications.openclawHooksToken') {
          updates.notifications = { ...updates.notifications, openclawHooksToken: value as string | null }
        } else if (key === 'notifications.telegramBotToken') {
          updates.notifications = { ...updates.notifications, telegramBotToken: value as string | null }
        } else if (key === 'notifications.telegramChatId') {
          updates.notifications = { ...updates.notifications, telegramChatId: value as string | null }
        } else if (key === 'logging.level') {
          updates.logging = { ...updates.logging, level: value as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' }
        } else if (key === 'logging.noColor') {
          updates.logging = { ...updates.logging, noColor: value as boolean }
        }
      }

      const result = await updateConfigFn({ data: { updates } })

      if (!result.ok) {
        return { ok: false, errors: result.errors }
      }

      // Success: invalidate config query and clear dirty state
      await queryClient.invalidateQueries({ queryKey: ['settings-config'] })
      setDirtyFields(new Map())
      setFormValues({})

      return { ok: true }
    } finally {
      setIsSaving(false)
    }
  }, [isDirty, dirtyFields, formValues, queryClient])

  // ── Refetch ────────────────────────────────────────────────────────────

  const refetch = useCallback(() => {
    void configQuery.refetch()
    void modelTableQuery.refetch()
    void skillsQuery.refetch()
    void systemInfoQuery.refetch()
  }, [configQuery, modelTableQuery, skillsQuery, systemInfoQuery])

  // ── Return ─────────────────────────────────────────────────────────────

  return {
    // Data
    config: configQuery.data?.config as ConfigWithSources | undefined,
    modelTable: modelTableQuery.data as ModelTableData | undefined,
    skills: skillsQuery.data as SkillsData | undefined,
    systemInfo: systemInfoQuery.data as SystemInfoData | undefined,
    isLoading: configQuery.isLoading || modelTableQuery.isLoading || skillsQuery.isLoading || systemInfoQuery.isLoading,
    // Form state
    formValues,
    getEffectiveValue,
    setField,
    resetField,
    isDirty,
    dirtyCount,
    dirtySections,
    // Save
    save,
    isSaving,
    // Refetch
    refetch,
  }
}
