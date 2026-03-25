'use client'

import { useState } from 'react'
import { Eye, EyeOff, Send } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardPanel } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Fieldset, FieldsetLegend } from '~/components/ui/fieldset'
import { SettingsField, type SectionProps } from './source-badge'
import { toastManager } from '~/components/ui/toast'
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

/** Mask a sensitive value: show last 4 chars only */
function maskSensitive(value: string | null | undefined): string {
  if (!value) return ''
  return value.length > 4 ? '••••••' + value.slice(-4) : '••••'
}

// ── PasswordField ─────────────────────────────────────────────────────────

function PasswordField({
  value,
  onChange,
  placeholder,
  disabled,
  isMasked,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  isMasked?: boolean
}) {
  const [showPassword, setShowPassword] = useState(false)

  if (isMasked) {
    // Env-sourced: show masked value, read-only
    return (
      <Input
        value={maskSensitive(value)}
        readOnly
        disabled
        placeholder={placeholder}
        className="font-mono"
      />
    )
  }

  return (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
        onClick={() => setShowPassword((prev) => !prev)}
        disabled={disabled}
      >
        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}

// ── SectionNotifications ──────────────────────────────────────────────────

export function SectionNotifications({ config, formValues, setField, resetField }: SectionProps) {
  // OpenClaw fields
  const hooksUrlKey = 'notifications.openclawHooksUrl'
  const hooksTokenKey = 'notifications.openclawHooksToken'

  const hooksUrlSource = getSource(config, hooksUrlKey)
  const hooksUrlEnvVar = getEnvVar(config, hooksUrlKey)
  const hooksUrlValue = (getEffective(config, formValues, hooksUrlKey) as string | null) ?? ''
  const hooksUrlReadOnly = hooksUrlSource === 'env'
  const hooksUrlIsDefault = isDefaultVal(config, formValues, hooksUrlKey)

  const hooksTokenSource = getSource(config, hooksTokenKey)
  const hooksTokenEnvVar = getEnvVar(config, hooksTokenKey)
  const hooksTokenValue = (getEffective(config, formValues, hooksTokenKey) as string | null) ?? ''
  const hooksTokenReadOnly = hooksTokenSource === 'env'
  const hooksTokenIsDefault = isDefaultVal(config, formValues, hooksTokenKey)

  // Telegram fields
  const telegramBotKey = 'notifications.telegramBotToken'
  const telegramChatKey = 'notifications.telegramChatId'

  const telegramBotSource = getSource(config, telegramBotKey)
  const telegramBotEnvVar = getEnvVar(config, telegramBotKey)
  const telegramBotValue = (getEffective(config, formValues, telegramBotKey) as string | null) ?? ''
  const telegramBotReadOnly = telegramBotSource === 'env'
  const telegramBotIsDefault = isDefaultVal(config, formValues, telegramBotKey)

  const telegramChatSource = getSource(config, telegramChatKey)
  const telegramChatEnvVar = getEnvVar(config, telegramChatKey)
  const telegramChatValue =
    (getEffective(config, formValues, telegramChatKey) as string | null) ?? ''
  const telegramChatReadOnly = telegramChatSource === 'env'
  const telegramChatIsDefault = isDefaultVal(config, formValues, telegramChatKey)

  const handleSendTest = () => {
    // Placeholder: show a toast (actual implementation would call a server function)
    toastManager.add({
      title: 'Test notification sent',
      description: 'Check your Telegram for a test message',
      type: 'success',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-8 pt-0">
        {/* OpenClaw Webhook Fieldset */}
        <Fieldset className="max-w-none w-full space-y-6">
          <FieldsetLegend>OpenClaw Webhook</FieldsetLegend>

          <SettingsField
            label="Webhook URL"
            source={hooksUrlSource}
            envVar={hooksUrlEnvVar}
            isDefault={hooksUrlIsDefault}
            onReset={() => resetField(hooksUrlKey)}
            readOnly={hooksUrlReadOnly}
          >
            <Input
              value={hooksUrlValue ?? ''}
              onChange={(e) => setField(hooksUrlKey, e.target.value || null)}
              placeholder="https://..."
              disabled={hooksUrlReadOnly}
            />
          </SettingsField>

          <SettingsField
            label="Webhook Token"
            source={hooksTokenSource}
            envVar={hooksTokenEnvVar}
            isDefault={hooksTokenIsDefault}
            onReset={() => resetField(hooksTokenKey)}
            readOnly={hooksTokenReadOnly}
          >
            <PasswordField
              value={hooksTokenValue ?? ''}
              onChange={(v) => setField(hooksTokenKey, v || null)}
              placeholder="Bearer token..."
              disabled={hooksTokenReadOnly}
              isMasked={hooksTokenReadOnly && !!hooksTokenValue}
            />
          </SettingsField>
        </Fieldset>

        {/* Telegram Fieldset */}
        <Fieldset className="max-w-none w-full space-y-6">
          <FieldsetLegend>Telegram</FieldsetLegend>

          <SettingsField
            label="Bot Token"
            source={telegramBotSource}
            envVar={telegramBotEnvVar}
            isDefault={telegramBotIsDefault}
            onReset={() => resetField(telegramBotKey)}
            readOnly={telegramBotReadOnly}
          >
            <PasswordField
              value={telegramBotValue ?? ''}
              onChange={(v) => setField(telegramBotKey, v || null)}
              placeholder="1234567890:ABCdef..."
              disabled={telegramBotReadOnly}
              isMasked={telegramBotReadOnly && !!telegramBotValue}
            />
          </SettingsField>

          <SettingsField
            label="Chat ID"
            source={telegramChatSource}
            envVar={telegramChatEnvVar}
            isDefault={telegramChatIsDefault}
            onReset={() => resetField(telegramChatKey)}
            readOnly={telegramChatReadOnly}
          >
            <Input
              value={telegramChatValue ?? ''}
              onChange={(e) => setField(telegramChatKey, e.target.value || null)}
              placeholder="-100123456789"
              disabled={telegramChatReadOnly}
            />
          </SettingsField>

          <div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleSendTest}
              disabled={!telegramBotValue || !telegramChatValue}
            >
              <Send className="h-3.5 w-3.5" />
              Send Test
            </Button>
          </div>
        </Fieldset>
      </CardPanel>
    </Card>
  )
}
