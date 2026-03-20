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
    <Card className="border-border/80 bg-background/80">
      <CardHeader className="space-y-3 border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{preparation.display_name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {preparation.description ?? preparation.package_id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{preparation.package_version}</Badge>
            <Badge variant="outline">cfg {preparation.config_version}</Badge>
            <Badge variant="outline">{formatRuntimeStatus(preparation)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {disabled ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            {disabledReason ?? 'This settings surface is currently unavailable.'}
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Settings stay host-owned and save through the governed
          deactivate-update-reactivate lifecycle. Secret fields stay
          vault-mediated and never rehydrate into the form as plaintext.
        </p>

        {deferredGroups.map((group) => (
          <div key={group.id} className="space-y-4 rounded-md border border-border/80 p-4">
            <div>
              <h4 className="text-sm font-semibold">{group.label}</h4>
              <p className="text-xs text-muted-foreground">
                {group.fields.some((field) => field.secret)
                  ? 'Includes vault-backed secret controls.'
                  : 'Canonical non-secret configuration.'}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {group.fields.map((field) => (
                <label key={field.key} className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span>{field.label ?? field.key}</span>
                    {field.required ? (
                      <Badge variant="outline">Required</Badge>
                    ) : (
                      <Badge variant="outline">Optional</Badge>
                    )}
                    {field.secret ? <Badge variant="outline">Secret</Badge> : null}
                  </div>
                  {field.description ? (
                    <div className="text-xs text-muted-foreground">
                      {field.description}
                    </div>
                  ) : null}
                  {field.secret ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
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
                      className="h-4 w-4 rounded border border-border"
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

        <div className="flex justify-end">
          <Button onClick={submit} disabled={disabled || isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {result ? (
          <div className="space-y-4 rounded-md border border-border/80 bg-muted/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
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
              <div className="space-y-2">
                {result.validation.results.map((entry, index) => (
                  <div
                    key={`${entry.check}-${entry.field ?? 'general'}-${index}`}
                    className="rounded-md border border-border/60 p-3 text-sm"
                  >
                    <div className="font-medium">
                      {entry.field ? `${entry.field}: ` : ''}
                      {entry.check}
                    </div>
                    <div className="text-muted-foreground">
                      {entry.message ?? (entry.passed ? 'Passed' : 'Failed')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Validation completed without additional per-check output.
              </p>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
