import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { useEventSubscription } from '../../../hooks/useEventSubscription'
import { useHealthQueries, useHealthQuery } from '../hooks'

const HEALTH_STATUS_COLORS: Record<string, string> = {
  healthy: 'var(--nous-state-complete)',
  degraded: 'var(--nous-state-active)',
  unhealthy: 'var(--nous-state-blocked)',
  stale: 'var(--nous-fg-subtle)',
}

const SESSION_STATUS_LABELS: Record<string, string> = {
  starting: 'STARTING',
  active: 'ACTIVE',
  draining: 'DRAINING',
  stopped: 'STOPPED',
  failed: 'FAILED',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

const sectionHeaderStyle: CSSProperties = {
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-subtle)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

const containerStyle: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  color: 'var(--nous-fg)',
}

export function ActiveAgentsWidget(_props: IDockviewPanelProps) {
  const { fetchAgentStatus } = useHealthQueries()
  const { data, isLoading, error, refetch } = useHealthQuery(fetchAgentStatus)

  useEventSubscription({
    channels: [
      'health:boot-step',
      'health:gateway-status',
      'health:issue',
      'health:backlog-analytics',
    ],
    onEvent: () => {
      refetch()
    },
  })

  if (isLoading && !data) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-xl)', color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-sm)' }}>
          Loading agent status...
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-xl)', color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-sm)' }}>
          Failed to load agent status: {error.message}
        </div>
      </div>
    )
  }

  if (!data) return <div style={containerStyle} />

  return (
    <div style={containerStyle}>
      <div style={sectionHeaderStyle}>
        {data.gateways.length} Gateway{data.gateways.length !== 1 ? 's' : ''} &middot; {data.appSessions.length} Session{data.appSessions.length !== 1 ? 's' : ''}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Gateways */}
        {data.gateways.map((gw) => (
          <div key={gw.agentId} style={rowStyle}>
            <span style={{ flex: 1, fontWeight: 'var(--nous-font-weight-medium)' as any }}>
              {gw.agentClass}
            </span>
            <span style={{ color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-xs)' }}>
              {gw.visibleToolCount} tool{gw.visibleToolCount !== 1 ? 's' : ''}
            </span>
            <span
              style={{
                fontSize: 'var(--nous-font-size-xs)',
                fontWeight: 'var(--nous-font-weight-semibold)' as any,
                color: gw.inboxReady ? 'var(--nous-state-complete)' : 'var(--nous-fg-subtle)',
                flexShrink: 0,
              }}
            >
              {gw.inboxReady ? 'READY' : 'NOT READY'}
            </span>
            {gw.issueCount > 0 && (
              <span style={{ color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-xs)' }}>
                {gw.issueCount} issue{gw.issueCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        ))}

        {/* App sessions */}
        {data.appSessions.map((session) => (
          <div key={session.sessionId} style={rowStyle}>
            <span style={{ flex: 1, fontWeight: 'var(--nous-font-weight-medium)' as any }}>
              {session.appId}
            </span>
            <span style={{ color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-xs)', flex: 1 }}>
              {session.packageId}
            </span>
            <span
              style={{
                fontSize: 'var(--nous-font-size-xs)',
                fontWeight: 'var(--nous-font-weight-semibold)' as any,
                color: HEALTH_STATUS_COLORS[session.healthStatus] ?? 'var(--nous-fg-subtle)',
                flexShrink: 0,
              }}
            >
              {SESSION_STATUS_LABELS[session.status] ?? session.status.toUpperCase()}
            </span>
            {session.stale && (
              <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)' }}>
                STALE
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Collected at */}
      <div
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-xl)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-subtle)',
          borderTop: '1px solid var(--nous-border-subtle)',
        }}
      >
        Updated: {new Date(data.collectedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}
