import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { trpc, useEventSubscription } from '@nous/transport'

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  available: { color: 'var(--nous-state-complete)', label: 'Available' },
  unknown: { color: 'var(--nous-fg-subtle)', label: 'Unknown' },
  unreachable: { color: 'var(--nous-state-blocked)', label: 'Unreachable' },
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-lg)',
  padding: 'var(--nous-space-md) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

const containerStyle: CSSProperties = {
  height: '100%',
  overflow: 'auto',
  color: 'var(--nous-fg)',
}

export function ProviderHealthWidget(_props: IDockviewPanelProps) {
  const utils = trpc.useUtils()
  const { data, isLoading, error } = trpc.health.providerHealth.useQuery()

  useEventSubscription({
    channels: ['health:boot-step', 'health:gateway-status', 'health:issue', 'health:backlog-analytics'],
    onEvent: () => {
      void utils.health.providerHealth.invalidate()
    },
  })

  if (isLoading && !data) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 'var(--nous-space-md) var(--nous-space-xl)', color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-sm)' }}>
          Loading provider health...
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 'var(--nous-space-md) var(--nous-space-xl)', color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-sm)' }}>
          Failed to load provider health: {error.message}
        </div>
      </div>
    )
  }

  if (!data) return <div style={containerStyle} />

  return (
    <div style={containerStyle}>
      {data.providers.map((provider) => {
        const dot = STATUS_DOT[provider.status] ?? { color: 'var(--nous-fg-subtle)', label: provider.status }
        return (
          <div key={provider.providerId} style={rowStyle}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dot.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 'var(--nous-font-weight-medium)' as any, minWidth: '80px' }}>{provider.name}</span>
            <span style={{ color: 'var(--nous-fg-muted)', flex: 1 }}>{dot.label}</span>
            {provider.modelId && (
              <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', flexShrink: 0 }}>
                {provider.modelId}
              </span>
            )}
          </div>
        )
      })}
      <div
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-xl)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-subtle)',
        }}
      >
        Updated: {new Date(data.collectedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}
