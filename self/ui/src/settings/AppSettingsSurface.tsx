'use client'

import * as React from 'react'
import type {
  AppSettingsPreparation,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
  AppSettingsSecretMutationOperation,
} from '@nous/shared'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '../components/index'
import { createAppSettingsDraft } from './settings-form-mapper'

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
}

const mutedTextXsStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-text-secondary)',
}

const stackXsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-xs)',
}

const rowWrapXsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-xs)',
}

const rowBetweenSmStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
}

const twoColumnGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--nous-space-md)',
  gridTemplateColumns: 'repeat(2, 1fr)',
}

const sectionCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md)',
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-md)',
}

const warningStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid rgba(245, 158, 11, 0.4)',
  background: 'rgba(245, 158, 11, 0.1)',
  padding: 'var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'rgb(254, 243, 199)',
}

const errorStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid rgba(239, 68, 68, 0.4)',
  background: 'rgba(239, 68, 68, 0.1)',
  padding: 'var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'rgb(254, 226, 226)',
}

const checkboxStyle: React.CSSProperties = {
  height: '16px',
  width: '16px',
  borderRadius: 'var(--nous-radius-sm)',
  border: '1px solid var(--nous-shell-column-border)',
}

export interface AppSettingsSurfaceProps {
  preparation: AppSettingsPreparation
  actorId: string
  onSave: (request: AppSettingsSaveRequest) => Promise<AppSettingsSaveResult>
  evidenceRefs?: string[]
  disabled?: boolean
  disabledReason?: string
  onSaved?: (result: AppSettingsSaveResult) => Promise<void> | void
}

function formatRuntimeStatus(preparation: AppSettingsPreparation): string {
  const runtime = preparation.runtime
  return `${runtime.status} · cfg ${runtime.config_version}`
}

export function AppSettingsSurface({
  preparation,
  actorId,
  onSave,
  evidenceRefs = [],
  disabled = false,
  disabledReason,
  onSaved,
}: AppSettingsSurfaceProps) {
  const draft = React.useMemo(
    () => createAppSettingsDraft(preparation),
    [preparation],
  )
  const deferredGroups = React.useDeferredValue(preparation.config_groups)
  const [config, setConfig] = React.useState<Record<string, unknown>>(draft.config)
  const [secrets, setSecrets] = React.useState(draft.secrets)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<AppSettingsSaveResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setConfig(draft.config)
    setSecrets(draft.secrets)
    setResult(null)
    setError(null)
  }, [draft.config, draft.secrets, preparation])

  const submit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const next = await onSave({
        project_id: preparation.project_id,
        package_id: preparation.package_id,
        actor_id: actorId,
        expected_config_version: preparation.config_version,
        config,
        secrets,
        evidence_refs: evidenceRefs,
      })
      setResult(next)
      await onSaved?.(next)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Settings save failed unexpectedly.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader style={{ gap: '12px', borderBottom: '1px solid var(--nous-shell-column-border)' }}>
        <div style={rowBetweenSmStyle}>
          <div style={stackXsStyle}>
            <CardTitle>{preparation.display_name}</CardTitle>
            <p style={mutedTextStyle}>
              {preparation.description ?? preparation.package_id}
            </p>
          </div>
          <div style={rowWrapXsStyle}>
            <Badge variant="outline">{preparation.package_version}</Badge>
            <Badge variant="outline">cfg {preparation.config_version}</Badge>
            <Badge variant="outline">{formatRuntimeStatus(preparation)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nous-space-xl)',
          paddingTop: 'var(--nous-space-xl)',
        }}
      >
        {disabled ? (
          <div style={warningStyle}>
            {disabledReason ?? 'This settings surface is currently unavailable.'}
          </div>
        ) : null}

        <p style={mutedTextStyle}>
          Settings stay host-owned and save through the governed
          deactivate-update-reactivate lifecycle. Secret fields stay
          vault-mediated and never rehydrate into the form as plaintext.
        </p>

        {deferredGroups.map((group) => (
          <div key={group.id} style={sectionCardStyle}>
            <div>
              <h4
                style={{
                  fontSize: 'var(--nous-font-size-sm)',
                  fontWeight: 'var(--nous-font-weight-semibold)',
                }}
              >
                {group.label}
              </h4>
              <p style={mutedTextXsStyle}>
                {group.fields.some((field) => field.secret)
                  ? 'Includes vault-backed secret controls.'
                  : 'Canonical non-secret configuration.'}
              </p>
            </div>
            <div style={twoColumnGridStyle}>
              {group.fields.map((field) => (
                <label
                  key={field.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--nous-space-xs)',
                    fontSize: 'var(--nous-font-size-sm)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--nous-space-xs)',
                    }}
                  >
                    <span>{field.label ?? field.key}</span>
                    {field.required ? (
                      <Badge variant="outline">Required</Badge>
                    ) : (
                      <Badge variant="outline">Optional</Badge>
                    )}
                    {field.secret ? <Badge variant="outline">Secret</Badge> : null}
                  </div>
                  {field.description ? (
                    <div style={mutedTextXsStyle}>
                      {field.description}
                    </div>
                  ) : null}
                  {field.secret ? (
                    <div style={stackXsStyle}>
                      <div style={mutedTextXsStyle}>
                        {field.secret_state?.configured
                          ? 'Configured in the vault.'
                          : 'Not configured yet.'}
                      </div>
                      <Select
                        value={secrets[field.key]?.operation ?? 'retain'}
                        onChange={(event) =>
                          setSecrets((current) => ({
                            ...current,
                            [field.key]: {
                              operation: event.target.value as AppSettingsSecretMutationOperation,
                            },
                          }))
                        }
                      >
                        <option value="retain">Retain</option>
                        <option value="replace">Replace</option>
                        <option value="clear">Clear</option>
                      </Select>
                      {secrets[field.key]?.operation === 'replace' ? (
                        <Input
                          type="password"
                          value={secrets[field.key]?.value ?? ''}
                          onChange={(event) =>
                            setSecrets((current) => ({
                              ...current,
                              [field.key]: {
                                operation: 'replace',
                                value: event.target.value,
                              },
                            }))
                          }
                        />
                      ) : null}
                    </div>
                  ) : field.type === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(config[field.key])}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          [field.key]: event.target.checked,
                        }))
                      }
                      style={checkboxStyle}
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      value={String(config[field.key] ?? '')}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    >
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={String(config[field.key] ?? '')}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          [field.key]: field.type === 'number'
                            ? event.target.value
                            : event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button onClick={submit} disabled={disabled || isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {result ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--nous-space-md)',
              borderRadius: 'var(--nous-radius-md)',
              border: '1px solid var(--nous-shell-column-border)',
              background: 'var(--nous-bg-hover)',
              padding: 'var(--nous-space-md)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 'var(--nous-space-xs)',
              }}
            >
              <Badge variant={result.status === 'failed' ? 'outline' : 'default'}>
                {result.status}
              </Badge>
              <Badge variant="outline">{result.apply_status}</Badge>
              <Badge variant="outline">{result.phase}</Badge>
              <Badge variant="outline">
                effective cfg {result.effective_config_version}
              </Badge>
            </div>
            {result.validation.results.length > 0 ? (
              <div style={stackXsStyle}>
                {result.validation.results.map((entry, index) => (
                  <div
                    key={`${entry.check}-${entry.field ?? 'general'}-${index}`}
                    style={{
                      borderRadius: 'var(--nous-radius-md)',
                      border: '1px solid var(--nous-shell-column-border)',
                      padding: 'var(--nous-space-sm)',
                      fontSize: 'var(--nous-font-size-sm)',
                    }}
                  >
                    <div style={{ fontWeight: 'var(--nous-font-weight-medium)' }}>
                      {entry.field ? `${entry.field}: ` : ''}
                      {entry.check}
                    </div>
                    <div style={{ color: 'var(--nous-text-secondary)' }}>
                      {entry.message ?? (entry.passed ? 'Passed' : 'Failed')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={mutedTextStyle}>
                Validation completed without additional per-check output.
              </p>
            )}
          </div>
        ) : null}

        {error ? (
          <div style={errorStyle}>
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
