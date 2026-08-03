'use client'

import { useState, useEffect } from 'react'
import type {
  PreferencesApi,
  ProviderConnection,
  ProviderConnectionStatus,
  SystemStatus,
  FeedbackState,
} from '../types'
import { sectionStyle, sectionTitleStyle, cardStyle, rowStyle, badgeStyle, feedbackStyle } from '../styles'
import { formatFeedbackError } from './helpers'

export interface SystemStatusPageProps {
  api: Pick<PreferencesApi, 'getSystemStatus'>
}

function connectionStatusLabel(status: ProviderConnectionStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'missing_credentials':
      return 'Missing credentials'
    case 'not_running':
      return 'Not running'
    case 'not_checked':
      return 'Not checked'
    case 'unavailable':
      return 'Unavailable'
  }
}

function connectionIsReady(connection: ProviderConnection): boolean {
  return connection.status === 'ready'
}

export function SystemStatusPage({ api }: SystemStatusPageProps) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.getSystemStatus().then((status) => {
      if (!cancelled) {
        setSystemStatus(status)
      }
    }).catch((err) => {
      if (!cancelled) setFeedback(formatFeedbackError(err))
    })
    return () => { cancelled = true }
  }, [api])

  return (
    <div data-testid="settings-page-system-status">
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>System Status</div>

        <div style={cardStyle}>
          <div style={{ ...rowStyle, marginBottom: 'var(--nous-space-md)' }}>
            <span>Ollama</span>
            <span style={badgeStyle(systemStatus?.ollama.running ?? false)}>
              {systemStatus?.ollama.running ? 'Running' : 'Not running'}
            </span>
          </div>
          {systemStatus?.ollama.running && systemStatus.ollama.models.length > 0 && (
            <div style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              Models: {systemStatus.ollama.models.join(', ')}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-medium)' as never, marginBottom: 'var(--nous-space-md)', color: 'var(--nous-fg-muted)' }}>
            Provider Connections
          </div>
          {systemStatus?.providerConnections?.length ? (
            <div style={{ display: 'grid', gap: 'var(--nous-space-md)' }}>
              {systemStatus.providerConnections.map((connection) => (
                <div key={connection.provider} style={{ display: 'grid', gap: 'var(--nous-space-xs)' }}>
                  <div style={rowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
                      <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never }}>
                        {connection.displayName}
                      </span>
                      <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>
                        {connection.authKind === 'api_key'
                          ? 'API key'
                          : connection.authKind === 'local_session'
                            ? 'Local session'
                            : connection.authKind === 'none'
                              ? 'No auth'
                              : 'Custom auth'}
                      </span>
                    </div>
                    <span style={badgeStyle(connectionIsReady(connection))}>
                      {connectionStatusLabel(connection.status)}
                    </span>
                  </div>
                  {connection.message && (
                    <div style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
                      {connection.message}
                    </div>
                  )}
                  {(connection.setupCommand || connection.versionCommand) && (
                    <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', fontFamily: 'var(--nous-font-family-mono)' }}>
                      {[connection.setupCommand, connection.versionCommand].filter(Boolean).join(' | ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={rowStyle}>
              <span>Active Providers</span>
              <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
                {systemStatus?.configuredProviders.length
                  ? systemStatus.configuredProviders.join(', ')
                  : 'None'}
              </span>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={rowStyle}>
            <span>Credential Vault</span>
            <span style={badgeStyle(systemStatus?.credentialVaultHealthy ?? false)}>
              {systemStatus?.credentialVaultHealthy ? 'Healthy' : 'Unavailable'}
            </span>
          </div>
        </div>

        {feedback && (
          <div style={feedbackStyle(feedback.success)}>
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  )
}
