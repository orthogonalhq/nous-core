import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'

type UsagePeriod = { label: string; tokens: string; cost: string }
type ProviderBudget = { name: string; remaining: string; budget: string; note?: string }

const STUB_USAGE: UsagePeriod[] = [
  { label: 'Today', tokens: '12,450', cost: '$0.02' },
  { label: 'This week', tokens: '84,200', cost: '$0.14' },
  { label: 'This month', tokens: '312,800', cost: '$0.52' },
]

const STUB_BUDGETS: ProviderBudget[] = [
  { name: 'Ollama (local)', remaining: 'unlimited', budget: 'free' },
  { name: 'OpenAI', remaining: '$4.48', budget: '$5.00' },
  { name: 'Anthropic', remaining: '\u2014', budget: '\u2014', note: 'not configured' },
]

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

export function TokenUsageWidget(_props: IDockviewPanelProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', color: 'var(--nous-fg)' }}>
      <div style={sectionHeader}>Usage</div>
      {STUB_USAGE.map((period) => (
        <div key={period.label} style={rowStyle}>
          <span style={{ color: 'var(--nous-fg-muted)', minWidth: '80px' }}>{period.label}</span>
          <span style={{ flex: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{period.tokens}</span>
          <span style={{ minWidth: '60px', textAlign: 'right', color: 'var(--nous-fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {period.cost}
          </span>
        </div>
      ))}
      <div style={{ ...sectionHeader, marginTop: 'var(--nous-space-xs)' }}>Provider Budgets</div>
      {STUB_BUDGETS.map((provider) => (
        <div key={provider.name} style={rowStyle}>
          <span style={{ fontWeight: 'var(--nous-font-weight-medium)' as any, flex: 1 }}>{provider.name}</span>
          {provider.note ? (
            <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)' }}>{provider.note}</span>
          ) : (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {provider.remaining}
              <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)' }}> / {provider.budget}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
