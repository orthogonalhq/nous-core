/**
 * CostBreakdownWidget — Budget gauge, provider cost breakdown, and alert states.
 *
 * Displays real-time budget usage with color-coded thresholds and a
 * per-provider/model cost table. Requires a projectId prop.
 */
import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { trpc } from '@nous/transport'

// --- Styles ---

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

const gaugeTrack: CSSProperties = {
  height: '8px',
  borderRadius: '4px',
  background: 'var(--nous-bg-subtle)',
  overflow: 'hidden',
  margin: '0 var(--nous-space-xl)',
  marginTop: 'var(--nous-space-xs)',
  marginBottom: 'var(--nous-space-sm)',
}

// --- Alert level colors ---

const ALERT_COLORS = {
  normal: 'var(--nous-state-active, #22c55e)',
  soft_threshold: 'var(--nous-state-caution, #f59e0b)',
  hard_ceiling: 'var(--nous-state-blocked, #ef4444)',
} as const

// --- Component ---

export interface CostBreakdownWidgetParams {
  projectId: string
}

export function CostBreakdownWidget(props: IDockviewPanelProps<CostBreakdownWidgetParams>) {
  const projectId = props.params?.projectId ?? ''
  const budgetQuery = trpc.costGovernance.getBudgetStatus.useQuery(
    { projectId },
    { refetchInterval: 10_000 },
  )
  const breakdownQuery = trpc.costGovernance.getProviderBreakdown.useQuery(
    { projectId, window: 'period' as const },
    { refetchInterval: 10_000 },
  )

  const budget = budgetQuery.data
  const breakdown = breakdownQuery.data

  return (
    <div style={{ height: '100%', overflow: 'auto', color: 'var(--nous-fg)' }}>
      {/* --- Budget Gauge Section --- */}
      <div style={sectionHeader}>Budget</div>

      {budgetQuery.isLoading && !budget ? (
        <div style={{ ...rowStyle, opacity: 0.5 }} data-testid="budget-skeleton">
          <span style={{ color: 'var(--nous-fg-muted)' }}>Loading budget...</span>
        </div>
      ) : budgetQuery.error ? (
        <div style={{ ...rowStyle, color: 'var(--nous-state-blocked)' }} data-testid="budget-error">
          Failed to load budget: {budgetQuery.error.message}
        </div>
      ) : budget ? (
        <>
          {/* Spend vs ceiling */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--nous-fg-muted)' }}>Spend</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${budget.currentSpendDollars.toFixed(2)}
              <span style={{ color: 'var(--nous-fg-subtle)' }}> / ${budget.hardCeilingDollars.toFixed(2)}</span>
            </span>
          </div>

          {/* Gauge bar */}
          <div style={gaugeTrack} data-testid="budget-gauge">
            <div
              style={{
                height: '100%',
                width: `${Math.min(budget.percentUsed, 100)}%`,
                borderRadius: '4px',
                background: ALERT_COLORS[budget.alertLevel],
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
              data-testid="budget-gauge-fill"
            />
          </div>

          {/* Alert and period info */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--nous-fg-muted)' }}>Status</span>
            <span
              style={{ color: ALERT_COLORS[budget.alertLevel], fontWeight: 'var(--nous-font-weight-medium)' as any }}
              data-testid="budget-alert-level"
            >
              {budget.isPaused
                ? 'Paused (ceiling reached)'
                : budget.alertLevel === 'soft_threshold'
                  ? 'Warning'
                  : budget.alertLevel === 'hard_ceiling'
                    ? 'Ceiling reached'
                    : 'Normal'}
            </span>
          </div>

          <div style={rowStyle}>
            <span style={{ color: 'var(--nous-fg-muted)' }}>Period</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--nous-fg-subtle)' }}>
              {budget.periodType}
              {budget.periodStart && ` from ${new Date(budget.periodStart).toLocaleDateString()}`}
            </span>
          </div>
        </>
      ) : (
        <div style={{ ...rowStyle, color: 'var(--nous-fg-muted)' }} data-testid="no-budget">
          No budget policy configured
        </div>
      )}

      {/* --- Provider Breakdown Section --- */}
      <div style={{ ...sectionHeader, marginTop: 'var(--nous-space-xs)' }}>Provider Breakdown</div>

      {breakdownQuery.isLoading && !breakdown ? (
        <div style={{ ...rowStyle, opacity: 0.5 }} data-testid="breakdown-skeleton">
          <span style={{ color: 'var(--nous-fg-muted)' }}>Loading breakdown...</span>
        </div>
      ) : breakdownQuery.error ? (
        <div style={{ ...rowStyle, color: 'var(--nous-state-blocked)' }} data-testid="breakdown-error">
          Failed to load breakdown: {breakdownQuery.error.message}
        </div>
      ) : breakdown && breakdown.length > 0 ? (
        <>
          {/* Table header */}
          <div style={{ ...rowStyle, fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>
            <span style={{ flex: 2 }}>Provider / Model</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Tokens</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Cost</span>
          </div>
          {breakdown.map((entry) => {
            const totalTokens = entry.inputTokens + entry.outputTokens
            return (
              <div key={`${entry.providerId}:${entry.modelId}`} style={rowStyle}>
                <span style={{ flex: 2, fontWeight: 'var(--nous-font-weight-medium)' as any }}>
                  {entry.providerId}
                  <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)' }}>
                    {' / '}{entry.modelId}
                  </span>
                </span>
                <span style={{ flex: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {totalTokens.toLocaleString()}
                </span>
                <span style={{ flex: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  ${entry.totalCostDollars.toFixed(4)}
                </span>
              </div>
            )
          })}
        </>
      ) : (
        <div style={{ ...rowStyle, color: 'var(--nous-fg-muted)' }} data-testid="no-breakdown">
          No cost data available
        </div>
      )}
    </div>
  )
}
