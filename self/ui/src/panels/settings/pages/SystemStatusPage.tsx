'use client'

import { useState, useEffect } from 'react'
import type { PreferencesApi, Provider, SystemStatus, FeedbackState } from '../types'
import { sectionStyle, sectionTitleStyle, cardStyle, rowStyle, badgeStyle, feedbackStyle, PROVIDER_LABELS } from '../styles'
import { formatFeedbackError } from './helpers'

export interface SystemStatusPageProps {
  api: Pick<PreferencesApi, 'getSystemStatus'>
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
          <div style={rowStyle}>
            <span>Active Providers</span>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              {systemStatus?.configuredProviders.length
                ? systemStatus.configuredProviders.map((p) => PROVIDER_LABELS[p as Provider] ?? p).join(', ')
                : 'None'}
            </span>
          </div>
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
