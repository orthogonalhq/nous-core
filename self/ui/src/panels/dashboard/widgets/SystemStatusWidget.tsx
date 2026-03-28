import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { trpc, useEventSubscription } from '@nous/transport'

const containerStyle: CSSProperties = {
  height: '100%',
  overflow: 'auto',
  color: 'var(--nous-fg)',
  padding: 'var(--nous-space-md) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-subtle)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: 'var(--nous-space-lg)',
  marginBottom: 'var(--nous-space-sm)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-md)',
  padding: 'var(--nous-space-xs) 0',
  fontSize: 'var(--nous-font-size-sm)',
}

const BOOT_STATUS_COLORS: Record<string, string> = {
  ready: 'var(--nous-state-complete)',
  booting: 'var(--nous-state-active)',
  degraded: 'var(--nous-state-blocked)',
}

const BOOT_STATUS_LABELS: Record<string, string> = {
  ready: 'Ready',
  booting: 'Booting',
  degraded: 'Degraded',
}

export function SystemStatusWidget(_props: IDockviewPanelProps) {
  const utils = trpc.useUtils()
  const { data, isLoading, error } = trpc.health.systemStatus.useQuery()

  useEventSubscription({
    channels: [
      'health:boot-step',
      'health:gateway-status',
      'health:issue',
      'health:backlog-analytics',
    ],
    onEvent: () => {
      void utils.health.systemStatus.invalidate()
    },
  })

  if (isLoading && !data) {
    return (
      <div style={containerStyle}>
        <span style={{ color: 'var(--nous-fg-muted)' }}>Loading system status...</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={containerStyle}>
        <span style={{ color: 'var(--nous-state-blocked)' }}>
          Failed to load system status: {error.message}
        </span>
      </div>
    )
  }

  if (!data) return <div style={containerStyle} />

  const backlog = data.backlogAnalytics

  return (
    <div style={containerStyle}>
      {/* Boot status */}
      <div style={rowStyle}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: BOOT_STATUS_COLORS[data.bootStatus] ?? 'var(--nous-fg-subtle)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as any }}>
          {BOOT_STATUS_LABELS[data.bootStatus] ?? data.bootStatus}
        </span>
        {data.issueCodes.length > 0 && (
          <span style={{ color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-xs)' }}>
            {data.issueCodes.length} issue{data.issueCodes.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Completed boot steps */}
      <div style={sectionHeaderStyle}>Boot Steps</div>
      {data.completedBootSteps.length === 0 ? (
        <div style={{ color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-xs)' }}>
          No boot steps recorded
        </div>
      ) : (
        data.completedBootSteps.map((step) => (
          <div key={step} style={rowStyle}>
            <span style={{ color: 'var(--nous-state-complete)', flexShrink: 0 }}>&#x2713;</span>
            <span>{step}</span>
          </div>
        ))
      )}

      {/* Backlog analytics */}
      <div style={sectionHeaderStyle}>Backlog</div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--nous-fg-muted)', minWidth: 80 }}>Queued</span>
        <span>{backlog.queuedCount}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--nous-fg-muted)', minWidth: 80 }}>Active</span>
        <span>{backlog.activeCount}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: 'var(--nous-fg-muted)', minWidth: 80 }}>Trend</span>
        <span>{backlog.pressureTrend}</span>
      </div>

      {/* Collected at */}
      <div
        style={{
          marginTop: 'var(--nous-space-lg)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-subtle)',
        }}
      >
        Updated: {new Date(data.collectedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}
