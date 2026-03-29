import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { trpc } from '@nous/transport'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

const sectionHeader: CSSProperties = {
  padding: 'var(--nous-space-sm) var(--nous-space-xl) var(--nous-space-2xs)',
  fontSize: 'var(--nous-font-size-xs)',
  fontWeight: 'var(--nous-font-weight-semibold)' as any,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--nous-fg-subtle)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

const skeletonRowStyle: CSSProperties = {
  ...rowStyle,
  opacity: 0.5,
}

const USAGE_WINDOWS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
] as const

export function TokenUsageWidget(_props: IDockviewPanelProps) {
  const usageQuery = trpc.inference.getTokenUsageSummary.useQuery(undefined, {
    refetchInterval: 10_000,
  })
  const providersQuery = trpc.inference.getProviderBreakdown.useQuery(undefined, {
    refetchInterval: 10_000,
  })

  return (
    <div style={{ height: '100%', overflow: 'auto', color: 'var(--nous-fg)' }}>
      <div style={sectionHeader}>Usage</div>
      {usageQuery.isLoading && !usageQuery.data ? (
        <>
          {USAGE_WINDOWS.map((w) => (
            <div key={w.key} style={skeletonRowStyle} data-testid={`skeleton-${w.key}`}>
              <span style={{ color: 'var(--nous-fg-muted)', minWidth: '80px' }}>{w.label}</span>
              <span style={{ flex: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--nous-fg-subtle)' }}>
                ---
              </span>
            </div>
          ))}
        </>
      ) : usageQuery.error ? (
        <div style={{ ...rowStyle, color: 'var(--nous-state-blocked)' }}>
          Failed to load token usage: {usageQuery.error.message}
        </div>
      ) : usageQuery.data ? (
        <>
          {USAGE_WINDOWS.map((w) => {
            const window = usageQuery.data[w.key]
            const totalTokens = window.inputTokens + window.outputTokens
            return (
              <div key={w.key} style={rowStyle}>
                <span style={{ color: 'var(--nous-fg-muted)', minWidth: '80px' }}>{w.label}</span>
                <span style={{ flex: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {totalTokens.toLocaleString()} tokens
                </span>
                <span style={{ minWidth: '60px', textAlign: 'right', color: 'var(--nous-fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {window.callCount.toLocaleString()} calls
                </span>
              </div>
            )
          })}
        </>
      ) : null}

      <div style={{ ...sectionHeader, marginTop: 'var(--nous-space-xs)' }}>Provider Breakdown</div>
      {providersQuery.isLoading && !providersQuery.data ? (
        <div style={skeletonRowStyle}>
          <span style={{ color: 'var(--nous-fg-muted)' }}>Loading providers...</span>
        </div>
      ) : providersQuery.error ? (
        <div style={{ ...rowStyle, color: 'var(--nous-state-blocked)' }}>
          Failed to load provider data: {providersQuery.error.message}
        </div>
      ) : providersQuery.data && providersQuery.data.length > 0 ? (
        providersQuery.data.map((provider) => {
          const totalTokens = provider.inputTokens + provider.outputTokens
          return (
            <div key={provider.providerId} style={rowStyle}>
              <span style={{ fontWeight: 'var(--nous-font-weight-medium)' as any, flex: 1 }}>
                {provider.providerId}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {totalTokens.toLocaleString()} tokens
                <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)' }}>
                  {' '}/ {provider.callCount.toLocaleString()} calls
                </span>
              </span>
            </div>
          )
        })
      ) : (
        <div style={{ ...rowStyle, color: 'var(--nous-fg-muted)' }}>
          No provider activity
        </div>
      )}
    </div>
  )
}
