'use client'

import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSeparator,
} from '~/components/ui/select'
import { Input } from '~/components/ui/input'
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

// ── SectionJobDefaults ────────────────────────────────────────────────────

export function SectionJobDefaults({
  config,
  formValues,
  setField,
  resetField,
  customModes = [],
}: SectionProps) {
  // defaults.modelProfile
  const profileKey = 'defaults.modelProfile'
  const profileSource = getSource(config, profileKey)
  const profileEnvVar = getEnvVar(config, profileKey)
  const profileValue = (getEffective(config, formValues, profileKey) as string) ?? 'balanced'
  const profileReadOnly = profileSource === 'env'
  const profileIsDefault = isDefaultVal(config, formValues, profileKey)

  // defaults.providerMode
  const providerKey = 'defaults.providerMode'
  const providerSource = getSource(config, providerKey)
  const providerEnvVar = getEnvVar(config, providerKey)
  const providerValue = (getEffective(config, formValues, providerKey) as string) ?? 'claude-only'
  const providerReadOnly = providerSource === 'env'
  const providerIsDefault = isDefaultVal(config, formValues, providerKey)

  // defaults.notifyTarget
  const notifyKey = 'defaults.notifyTarget'
  const notifySource = getSource(config, notifyKey)
  const notifyEnvVar = getEnvVar(config, notifyKey)
  const notifyValue = (getEffective(config, formValues, notifyKey) as string | null) ?? ''
  const notifyReadOnly = notifySource === 'env'
  const notifyIsDefault = isDefaultVal(config, formValues, notifyKey)

  // defaults.scope
  const scopeKey = 'defaults.scope'
  const scopeSource = getSource(config, scopeKey)
  const scopeEnvVar = getEnvVar(config, scopeKey)
  const scopeValue = (getEffective(config, formValues, scopeKey) as string | null) ?? ''
  const scopeReadOnly = scopeSource === 'env'
  const scopeIsDefault = isDefaultVal(config, formValues, scopeKey)

  const builtInModes = ['claude-only', 'openai-only', 'hybrid']
  const extraModes = customModes.filter((m) => !builtInModes.includes(m))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Defaults</CardTitle>
      </CardHeader>
      <CardPanel className="pt-0">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* defaults.modelProfile */}
          <SettingsField
            label="Model Profile"
            description="Default quality/cost profile for new jobs"
            source={profileSource}
            envVar={profileEnvVar}
            isDefault={profileIsDefault}
            onReset={() => resetField(profileKey)}
            readOnly={profileReadOnly}
          >
            <Select
              value={profileValue}
              onValueChange={(val) => setField(profileKey, val)}
              disabled={profileReadOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quality">quality — best results, highest cost</SelectItem>
                <SelectItem value="balanced">balanced — good results, moderate cost</SelectItem>
                <SelectItem value="budget">budget — faster, lower cost</SelectItem>
              </SelectContent>
            </Select>
          </SettingsField>

          {/* defaults.providerMode */}
          <SettingsField
            label="Provider Mode"
            description="Which AI providers to use for jobs"
            source={providerSource}
            envVar={providerEnvVar}
            isDefault={providerIsDefault}
            onReset={() => resetField(providerKey)}
            readOnly={providerReadOnly}
          >
            <Select
              value={providerValue}
              onValueChange={(val) => setField(providerKey, val)}
              disabled={providerReadOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-only">claude-only</SelectItem>
                <SelectItem value="openai-only">openai-only</SelectItem>
                <SelectItem value="hybrid">hybrid</SelectItem>
                {extraModes.length > 0 && (
                  <>
                    <SelectSeparator />
                    {extraModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </SettingsField>

          {/* defaults.notifyTarget */}
          <SettingsField
            label="Notify Target"
            description="Agent ID to notify on job completion"
            source={notifySource}
            envVar={notifyEnvVar}
            isDefault={notifyIsDefault}
            onReset={() => resetField(notifyKey)}
            readOnly={notifyReadOnly}
          >
            <Input
              value={notifyValue ?? ''}
              onChange={(e) => setField(notifyKey, e.target.value || null)}
              placeholder="e.g. main"
              disabled={notifyReadOnly}
            />
          </SettingsField>

          {/* defaults.scope */}
          <SettingsField
            label="Default Scope"
            description="Default GSD scope for new jobs"
            source={scopeSource}
            envVar={scopeEnvVar}
            isDefault={scopeIsDefault}
            onReset={() => resetField(scopeKey)}
            readOnly={scopeReadOnly}
          >
            <Select
              value={scopeValue ?? ''}
              onValueChange={(val) => setField(scopeKey, val || null)}
              disabled={scopeReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder="(none)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">(none)</SelectItem>
                <SelectItem value="quick">quick</SelectItem>
                <SelectItem value="phase">phase</SelectItem>
                <SelectItem value="debug">debug</SelectItem>
                <SelectItem value="fast">fast</SelectItem>
              </SelectContent>
            </Select>
          </SettingsField>
        </div>
      </CardPanel>
    </Card>
  )
}
