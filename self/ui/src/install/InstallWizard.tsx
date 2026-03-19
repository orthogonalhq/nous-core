'use client'

import * as React from 'react'
import type {
  AppInstallPreparation,
  AppInstallRequest,
  AppInstallResult,
  AppInstallStage,
} from '@nous/shared'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '../components/index'
import { createInstallWizardDraft } from './install-form-mapper'

const STAGES: AppInstallStage[] = [
  'permission_review',
  'configuration',
  'validation_activation',
]

export interface InstallWizardProps {
  preparation: AppInstallPreparation
  projectId: string
  actorId: string
  onInstall: (request: AppInstallRequest) => Promise<AppInstallResult>
  onResult?: (result: AppInstallResult) => Promise<void> | void
  evidenceRefs?: string[]
  disabled?: boolean
  disabledReason?: string
}

function renderPermissionSummary(preparation: AppInstallPreparation) {
  return [
    {
      label: 'Network',
      value:
        preparation.permissions.network.length > 0
          ? preparation.permissions.network.join(', ')
          : 'No external hosts requested',
    },
    {
      label: 'Credential Vault',
      value: preparation.permissions.credentials
        ? 'Vault-mediated secret storage required'
        : 'No credential vault access requested',
    },
    {
      label: 'Witness Level',
      value: preparation.permissions.witnessLevel,
    },
    {
      label: 'System Notifications',
      value: preparation.permissions.systemNotify ? 'Enabled' : 'Disabled',
    },
    {
      label: 'Memory Contribution',
      value: preparation.permissions.memoryContribute ? 'Enabled' : 'Disabled',
    },
  ]
}

function stageLabel(stage: AppInstallStage): string {
  switch (stage) {
    case 'permission_review':
      return '1. Permission Review'
    case 'configuration':
      return '2. Configuration'
    case 'validation_activation':
      return '3. Validation And Activation'
  }
}

export function InstallWizard({
  preparation,
  projectId,
  actorId,
  onInstall,
  onResult,
  evidenceRefs = [],
  disabled = false,
  disabledReason,
}: InstallWizardProps) {
  const draft = React.useMemo(
    () => createInstallWizardDraft(preparation),
    [preparation],
  )
  const deferredGroups = React.useDeferredValue(preparation.config_groups)
  const [stage, setStage] = React.useState<AppInstallStage>('permission_review')
  const [config, setConfig] = React.useState<Record<string, unknown>>(draft.config)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<AppInstallResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const secretRefs = React.useRef<Record<string, HTMLInputElement | null>>({})

  React.useEffect(() => {
    setConfig(draft.config)
    setStage('permission_review')
    setResult(null)
    setError(null)
    secretRefs.current = {}
  }, [draft.config, preparation])

  const submit = async () => {
    setIsSubmitting(true)
    setError(null)
    setStage('validation_activation')

    try {
      const secrets = Object.fromEntries(
        draft.secretFieldKeys
          .map((key) => [key, secretRefs.current[key]?.value?.trim() ?? ''] as const)
          .filter(([, value]) => value.length > 0),
      )

      const next = await onInstall({
        project_id: projectId as AppInstallRequest['project_id'],
        package_id: preparation.package_id,
        release_id: preparation.release_id,
        actor_id: actorId,
        permissions_approved: true,
        config,
        secrets,
        oauth: [],
        evidence_refs: evidenceRefs,
      })
      setResult(next)
      await onResult?.(next)
      if (next.status === 'failed') {
        window.setTimeout(() => {
          setStage('configuration')
        }, 0)
      }
      for (const key of draft.secretFieldKeys) {
        if (secretRefs.current[key]) {
          secretRefs.current[key]!.value = ''
        }
      }
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : 'Install failed unexpectedly.',
      )
      setStage('configuration')
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
            <Badge variant="outline">{preparation.app_id}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((entry) => (
            <Badge
              key={entry}
              variant={stage === entry ? 'default' : 'outline'}
            >
              {stageLabel(entry)}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {disabled ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            {disabledReason ?? 'This install surface is currently unavailable.'}
          </div>
        ) : null}

        {stage === 'permission_review' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review the runtime permissions requested by this app before any
              configuration or activation work begins.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {renderPermissionSummary(preparation).map((entry) => (
                <div
                  key={entry.label}
                  className="rounded-md border border-border/80 bg-muted/20 p-3"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {entry.label}
                  </div>
                  <div className="mt-1 text-sm">{entry.value}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => React.startTransition(() => setStage('configuration'))}
                disabled={disabled}
              >
                Approve And Continue
              </Button>
            </div>
          </div>
        ) : null}

        {stage === 'configuration' ? (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Configuration fields are rendered directly from the canonical app
              manifest. Secret fields are submitted vault-first and are not sent
              into the activation handshake.
            </p>
            {deferredGroups.map((group) => (
              <div key={group.id} className="space-y-4 rounded-md border border-border/80 p-4">
                <div>
                  <h4 className="text-sm font-semibold">{group.label}</h4>
                  <p className="text-xs text-muted-foreground">
                    {group.fields.some((field) => field.secret)
                      ? 'Includes vault-backed secret fields.'
                      : 'Non-secret runtime configuration.'}
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
                      {field.type === 'boolean' ? (
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
                          type={field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'}
                          defaultValue={
                            field.secret ? '' : String(config[field.key] ?? '')
                          }
                          onChange={
                            field.secret
                              ? undefined
                              : (event) =>
                                  setConfig((current) => ({
                                    ...current,
                                    [field.key]:
                                      field.type === 'number'
                                        ? event.target.value
                                        : event.target.value,
                                  }))
                          }
                          ref={(element) => {
                            if (field.secret) {
                              secretRefs.current[field.key] = element
                            }
                          }}
                        />
                      )}
                      {field.validation ? (
                        <div className="text-xs text-muted-foreground">
                          Rule: {field.validation}
                        </div>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => React.startTransition(() => setStage('permission_review'))}
              >
                Back
              </Button>
              <Button onClick={submit} disabled={disabled || isSubmitting}>
                {isSubmitting ? 'Installing...' : 'Validate And Activate'}
              </Button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4 rounded-md border border-border/80 bg-muted/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.status === 'failed' ? 'outline' : 'default'}>
                {result.status}
              </Badge>
              <Badge variant="outline">{result.phase}</Badge>
              {result.runtime_session_id ? (
                <Badge variant="outline">session {result.runtime_session_id}</Badge>
              ) : null}
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

