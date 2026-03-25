'use client'

import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { SettingsField, type SectionProps } from './source-badge'
import type { ConfigSource } from '@pilot/core/types.js'

// ── helpers ───────────────────────────────────────────────────────────────

function getSource(
  config: SectionProps['config'],
  key: string,
): ConfigSource {
  return (config[key]?.source ?? 'default') as ConfigSource
}

function getEnvVar(config: SectionProps['config'], key: string): string | undefined {
  return config[key]?.envVar
}

function getEffective(
  config: SectionProps['config'],
  formValues: Record<string, unknown>,
  key: string,
): unknown {
  if (key in formValues) return formValues[key]
  return config[key]?.value ?? null
}

function isDefaultVal(
  config: SectionProps['config'],
  formValues: Record<string, unknown>,
  key: string,
): boolean {
  const isDirty = key in formValues
  const source = config[key]?.source ?? 'default'
  return (source === 'default' || source === 'auto-detect') && !isDirty
}

// ── SectionGeneral ────────────────────────────────────────────────────────

export function SectionGeneral({ config, formValues, setField, resetField }: SectionProps) {
  const key = 'projectDir'
  const source = getSource(config, key)
  const envVar = getEnvVar(config, key)
  const value = getEffective(config, formValues, key)
  const readOnly = source === 'env'
  const isDefault = isDefaultVal(config, formValues, key)

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
      </CardHeader>
      <CardPanel className="pt-0">
        <SettingsField
          label="Project Directory"
          description="Base directory for resolving project shorthand names"
          source={source}
          envVar={envVar}
          isDefault={isDefault}
          onReset={() => resetField(key)}
          readOnly={readOnly}
        >
          <Input
            value={(value as string) ?? ''}
            onChange={(e) => setField(key, e.target.value)}
            placeholder="~/dev"
            disabled={readOnly}
          />
        </SettingsField>
      </CardPanel>
    </Card>
  )
}
