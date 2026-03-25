'use client'

import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldDecrement,
  NumberFieldInput,
  NumberFieldIncrement,
} from '~/components/ui/number-field'
import { Switch } from '~/components/ui/switch'
import { SettingsField, type SectionProps } from './source-badge'
import type { ConfigSource } from '@pilot/core/types.js'

// ── helpers ───────────────────────────────────────────────────────────────

function getSource(config: SectionProps['config'], key: string): ConfigSource {
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

// ── SectionRunner ─────────────────────────────────────────────────────────

export function SectionRunner({ config, formValues, setField, resetField }: SectionProps) {
  // runner.maxParallel — null means auto-detect
  const maxParallelKey = 'runner.maxParallel'
  const maxParallelSource = getSource(config, maxParallelKey)
  const maxParallelEnvVar = getEnvVar(config, maxParallelKey)
  const maxParallelValue = getEffective(config, formValues, maxParallelKey)
  const maxParallelReadOnly = maxParallelSource === 'env'
  const maxParallelIsDefault = isDefaultVal(config, formValues, maxParallelKey)
  const isAutoDetect = maxParallelValue === null

  // runner.queueGraceSeconds
  const graceKey = 'runner.queueGraceSeconds'
  const graceSource = getSource(config, graceKey)
  const graceEnvVar = getEnvVar(config, graceKey)
  const graceValue = getEffective(config, formValues, graceKey)
  const graceReadOnly = graceSource === 'env'
  const graceIsDefault = isDefaultVal(config, formValues, graceKey)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runner</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-6 pt-0">
        {/* runner.maxParallel */}
        <SettingsField
          label="Max Parallel Jobs"
          description="Maximum number of jobs to run simultaneously"
          source={maxParallelSource}
          envVar={maxParallelEnvVar}
          isDefault={maxParallelIsDefault}
          onReset={() => resetField(maxParallelKey)}
          readOnly={maxParallelReadOnly}
        >
          <div className="space-y-3">
            {/* Auto-detect switch */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Auto-detect (from RAM)</span>
              <Switch
                checked={isAutoDetect}
                onCheckedChange={(checked) => {
                  setField(maxParallelKey, checked ? null : 4)
                }}
                disabled={maxParallelReadOnly}
              />
            </div>
            {/* Manual number field — visible when not auto-detect */}
            {!isAutoDetect && (
              <NumberField
                value={(maxParallelValue as number) ?? 4}
                onValueChange={(val) => setField(maxParallelKey, val)}
                min={1}
                max={32}
                disabled={maxParallelReadOnly}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
            )}
          </div>
        </SettingsField>

        {/* runner.queueGraceSeconds */}
        <SettingsField
          label="Queue Grace Period"
          description="Minimum age before runner picks up a new job"
          source={graceSource}
          envVar={graceEnvVar}
          isDefault={graceIsDefault}
          onReset={() => resetField(graceKey)}
          readOnly={graceReadOnly}
        >
          <div className="flex items-center gap-2">
            <NumberField
              value={(graceValue as number) ?? 0}
              onValueChange={(val) => setField(graceKey, val)}
              min={0}
              max={3600}
              disabled={graceReadOnly}
              className="flex-1"
            >
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
            <span className="shrink-0 text-sm text-muted-foreground">s</span>
          </div>
        </SettingsField>
      </CardPanel>
    </Card>
  )
}
