'use client'

import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldDecrement,
  NumberFieldInput,
  NumberFieldIncrement,
} from '~/components/ui/number-field'
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

// ── SectionMemory ─────────────────────────────────────────────────────────

export function SectionMemory({
  config,
  formValues,
  setField,
  resetField,
  systemInfo,
}: SectionProps) {
  const sessionMaxKey = 'memory.sessionMaxMb'
  const reservedKey = 'memory.reservedMb'
  const killThresholdKey = 'memory.killThresholdMb'

  const sessionMaxSource = getSource(config, sessionMaxKey)
  const sessionMaxEnvVar = getEnvVar(config, sessionMaxKey)
  const sessionMaxValue = (getEffective(config, formValues, sessionMaxKey) as number) ?? 4096
  const sessionMaxReadOnly = sessionMaxSource === 'env'
  const sessionMaxIsDefault = isDefaultVal(config, formValues, sessionMaxKey)

  const reservedSource = getSource(config, reservedKey)
  const reservedEnvVar = getEnvVar(config, reservedKey)
  const reservedValue = (getEffective(config, formValues, reservedKey) as number) ?? 512
  const reservedReadOnly = reservedSource === 'env'
  const reservedIsDefault = isDefaultVal(config, formValues, reservedKey)

  const killThresholdSource = getSource(config, killThresholdKey)
  const killThresholdEnvVar = getEnvVar(config, killThresholdKey)
  const killThresholdValue = (getEffective(config, formValues, killThresholdKey) as number) ?? 256
  const killThresholdReadOnly = killThresholdSource === 'env'
  const killThresholdIsDefault = isDefaultVal(config, formValues, killThresholdKey)

  // Cross-field validation: warn if killThreshold >= sessionMax - reserved
  const availableToSession = sessionMaxValue - reservedValue
  const hasOomWarning = killThresholdValue >= availableToSession

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-4 pt-0">
        {/* Context bar — read-only system RAM info */}
        {systemInfo && (
          <>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">System RAM:</span>{' '}
              {systemInfo.totalRamGb}GB —{' '}
              <span className="font-medium text-foreground">Reserved:</span> {reservedValue}MB —{' '}
              <span className="font-medium text-foreground">Available to Pilot:</span>{' '}
              {systemInfo.totalRamMb - reservedValue}MB
            </div>
            <Separator />
          </>
        )}

        {/* 3-column grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SettingsField
            label="Session Cap"
            source={sessionMaxSource}
            envVar={sessionMaxEnvVar}
            isDefault={sessionMaxIsDefault}
            onReset={() => resetField(sessionMaxKey)}
            readOnly={sessionMaxReadOnly}
          >
            <div className="flex items-center gap-2">
              <NumberField
                value={sessionMaxValue}
                onValueChange={(val) => setField(sessionMaxKey, val)}
                min={256}
                step={256}
                disabled={sessionMaxReadOnly}
                className="flex-1"
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
              <span className="shrink-0 text-sm text-muted-foreground">MB</span>
            </div>
          </SettingsField>

          <SettingsField
            label="Reserved for OS"
            source={reservedSource}
            envVar={reservedEnvVar}
            isDefault={reservedIsDefault}
            onReset={() => resetField(reservedKey)}
            readOnly={reservedReadOnly}
          >
            <div className="flex items-center gap-2">
              <NumberField
                value={reservedValue}
                onValueChange={(val) => setField(reservedKey, val)}
                min={256}
                step={256}
                disabled={reservedReadOnly}
                className="flex-1"
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
              <span className="shrink-0 text-sm text-muted-foreground">MB</span>
            </div>
          </SettingsField>

          <SettingsField
            label="OOM Threshold"
            source={killThresholdSource}
            envVar={killThresholdEnvVar}
            isDefault={killThresholdIsDefault}
            onReset={() => resetField(killThresholdKey)}
            readOnly={killThresholdReadOnly}
          >
            <div className="flex items-center gap-2">
              <NumberField
                value={killThresholdValue}
                onValueChange={(val) => setField(killThresholdKey, val)}
                min={256}
                step={256}
                disabled={killThresholdReadOnly}
                className="flex-1"
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
              <span className="shrink-0 text-sm text-muted-foreground">MB</span>
            </div>
          </SettingsField>
        </div>

        {/* Cross-field validation warning */}
        {hasOomWarning && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            ⚠️ OOM Threshold ({killThresholdValue}MB) is ≥ available session memory (
            {availableToSession}MB). Consider lowering the threshold or increasing Session Cap.
          </p>
        )}
      </CardPanel>
    </Card>
  )
}
