'use client'

import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '~/components/ui/select'
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

// ── SectionLogging ────────────────────────────────────────────────────────

export function SectionLogging({ config, formValues, setField, resetField }: SectionProps) {
  // logging.level
  const levelKey = 'logging.level'
  const levelSource = getSource(config, levelKey)
  const levelEnvVar = getEnvVar(config, levelKey)
  const levelValue = (getEffective(config, formValues, levelKey) as string) ?? 'INFO'
  const levelReadOnly = levelSource === 'env'
  const levelIsDefault = isDefaultVal(config, formValues, levelKey)

  // logging.noColor
  const noColorKey = 'logging.noColor'
  const noColorSource = getSource(config, noColorKey)
  const noColorEnvVar = getEnvVar(config, noColorKey)
  const noColorValue = (getEffective(config, formValues, noColorKey) as boolean) ?? false
  const noColorReadOnly = noColorSource === 'env'
  const noColorIsDefault = isDefaultVal(config, formValues, noColorKey)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logging</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-4 pt-0">
        {/* logging.level */}
        <SettingsField
          label="Log Level"
          source={levelSource}
          envVar={levelEnvVar}
          isDefault={levelIsDefault}
          onReset={() => resetField(levelKey)}
          readOnly={levelReadOnly}
        >
          <Select
            value={levelValue}
            onValueChange={(val) => setField(levelKey, val)}
            disabled={levelReadOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEBUG">DEBUG</SelectItem>
              <SelectItem value="INFO">INFO</SelectItem>
              <SelectItem value="WARN">WARN</SelectItem>
              <SelectItem value="ERROR">ERROR</SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>

        <Separator />

        {/* logging.noColor */}
        <SettingsField
          label="No Color"
          description="Disable ANSI color codes in log output"
          source={noColorSource}
          envVar={noColorEnvVar}
          isDefault={noColorIsDefault}
          onReset={() => resetField(noColorKey)}
          readOnly={noColorReadOnly}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Disable color output</span>
            <Switch
              checked={noColorValue}
              onCheckedChange={(checked) => setField(noColorKey, checked)}
              disabled={noColorReadOnly}
            />
          </div>
        </SettingsField>
      </CardPanel>
    </Card>
  )
}
