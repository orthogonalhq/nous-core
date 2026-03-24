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

const stackMdStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md)',
}

const stackLgStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
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

const twoColumnGridCompactStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(2, 1fr)',
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
            <Badge variant="outline">{preparation.app_id}</Badge>
          </div>
        </div>
        <div style={rowWrapXsStyle}>
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
            {disabledReason ?? 'This install surface is currently unavailable.'}
          </div>
        ) : null}

        {stage === 'permission_review' ? (
          <div style={stackMdStyle}>
            <p style={mutedTextStyle}>
              Review the runtime permissions requested by this app before any
              configuration or activation work begins.
            </p>
            <div style={twoColumnGridCompactStyle}>
              {renderPermissionSummary(preparation).map((entry) => (
                <div
                  key={entry.label}
                  style={{
                    borderRadius: 'var(--nous-radius-md)',
                    border: '1px solid var(--nous-shell-column-border)',
                    background: 'var(--nous-bg-hover)',
                    padding: 'var(--nous-space-sm)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--nous-font-size-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--nous-text-secondary)',
                    }}
                  >
                    {entry.label}
                  </div>
                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: 'var(--nous-font-size-sm)',
                    }}
                  >
                    {entry.value}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
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
          <div style={stackLgStyle}>
            <p style={mutedTextStyle}>
              Configuration fields are rendered directly from the canonical app
              manifest. Secret fields are submitted vault-first and are not sent
              into the activation handshake.
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
                      ? 'Includes vault-backed secret fields.'
                      : 'Non-secret runtime configuration.'}
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
                        <div style={mutedTextXsStyle}>
                          Rule: {field.validation}
                        </div>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
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
              <Badge variant="outline">{result.phase}</Badge>
              {result.runtime_session_id ? (
                <Badge variant="outline">session {result.runtime_session_id}</Badge>
              ) : null}
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

