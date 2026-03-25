import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { useEventSubscription } from '../../../hooks/useEventSubscription'

type ProviderEntry = {
  name: string
  status: 'connected' | 'not-configured' | 'error'
  model?: string
}

const STUB_PROVIDERS: ProviderEntry[] = [
  { name: 'Ollama', status: 'connected', model: 'llama3.2:3b' },
  { name: 'OpenAI', status: 'not-configured' },
  { name: 'Anthropic', status: 'not-configured' },
]

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  connected: { color: 'var(--nous-state-complete)', label: 'Connected' },
  'not-configured': { color: 'var(--nous-fg-subtle)', label: 'Not configured' },
  error: { color: 'var(--nous-state-blocked)', label: 'Error' },
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-lg)',
  padding: 'var(--nous-space-md) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

export function ProviderHealthWidget(_props: IDockviewPanelProps) {
  useEventSubscription({
    channels: ['health:boot-step', 'health:gateway-status', 'health:issue', 'health:backlog-analytics'],
    onEvent: () => {
      // Future: invalidate health tRPC query when widget is connected to real data
    },
  })

  return (
    <div style={{ height: '100%', overflow: 'auto', color: 'var(--nous-fg)' }}>
      {STUB_PROVIDERS.map((provider) => {
        const dot = STATUS_DOT[provider.status]
        return (
          <div key={provider.name} style={rowStyle}>
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
            {provider.model && (
              <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', flexShrink: 0 }}>
                {provider.model}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
