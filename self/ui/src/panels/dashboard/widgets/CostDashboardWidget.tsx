import { useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'
import { trpc, useEventSubscription } from '@nous/transport'
import { useShellContext } from '../../../components/shell/ShellContext'
import { useToast } from '../../../components/toast/ToastContext'

// ─── Styles ────────���───────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  height: '100%',
  overflow: 'auto',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
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

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

const placeholderStyle: CSSProperties = {
  ...rowStyle,
  color: 'var(--nous-fg-muted)',
  justifyContent: 'center',
}

// ─── Color thresholds ─────────��────────────────────────────────────────────────

function utilizationColor(percent: number): string {
  if (percent >= 100) return 'var(--nous-state-blocked)'
  if (percent >= 80) return '#f97316' // orange
  if (percent >= 60) return '#eab308' // yellow
  return 'var(--nous-state-complete)' // green
}

function utilizationLabel(percent: number): string {
  if (percent >= 100) return 'critical'
  if (percent >= 80) return 'high'
  if (percent >= 60) return 'moderate'
  return 'normal'
}

// ─── Breakdown tabs ────────��───────────────────────────────────────────────────

const BREAKDOWN_TABS = [
  { key: 'provider' as const, label: 'Provider' },
  { key: 'model' as const, label: 'Model' },
  { key: 'agentClass' as const, label: 'Agent Class' },
  { key: 'correlationRoot' as const, label: 'Workflow' },
]

type GroupBy = (typeof BREAKDOWN_TABS)[number]['key']

// ─── Tab button style ─────��────────────────────────────────────────────────────

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    padding: 'var(--nous-space-xs) var(--nous-space-md)',
    fontSize: 'var(--nous-font-size-xs)',
    background: active ? 'var(--nous-bg-surface)' : 'transparent',
    border: active ? '1px solid var(--nous-border-subtle)' : '1px solid transparent',
    borderBottom: active ? 'none' : '1px solid var(--nous-border-subtle)',
    borderRadius: 'var(--nous-menu-content-radius) var(--nous-menu-content-radius) 0 0',
    color: active ? 'var(--nous-fg)' : 'var(--nous-fg-muted)',
    cursor: 'pointer',
    fontWeight: active ? ('var(--nous-font-weight-semibold)' as any) : 'normal',
  }
}

// ─── Widget ───────────���────────────────────────────────────────────────────────

export function CostDashboardWidget(_props: IDockviewPanelProps) {
  const { activeProjectId } = useShellContext()
  const [activeTab, setActiveTab] = useState<GroupBy>('provider')
  const utils = trpc.useUtils()
  const { showToast } = useToast()

  const enabled = !!activeProjectId

  const budgetQuery = trpc.cost.getBudgetStatus.useQuery(
    { projectId: activeProjectId ?? '' },
    { enabled, refetchInterval: 30_000 },
  )

  const summaryQuery = trpc.cost.getCostSummary.useQuery(
    { projectId: activeProjectId ?? '' },
    { enabled, refetchInterval: 30_000 },
  )

  const breakdownQuery = trpc.cost.getCostBreakdown.useQuery(
    { projectId: activeProjectId ?? '', groupBy: activeTab },
    { enabled },
  )

  // SSE: invalidate on cost:snapshot
  useEventSubscription({
    channels: ['cost:snapshot'],
    onEvent: () => {
      void utils.cost.getBudgetStatus.invalidate()
      void utils.cost.getCostSummary.invalidate()
    },
  })

  // SSE: soft alert toast
  useEventSubscription({
    channels: ['cost:budget-alert'],
    onEvent: (_channel: string, payload: unknown) => {
      const data = payload as {
        projectId: string
        utilizationPercent: number
        budgetCeilingUsd: number
      }
      showToast({
        id: `budget-alert-${data.projectId}`,
        message: `Budget alert: project has reached ${data.utilizationPercent.toFixed(0)}% of $${data.budgetCeilingUsd.toFixed(2)} budget`,
        severity: 'warning',
        dismissible: true,
      })
    },
  })

  // ─── No project selected ──────────────────────────────────────────────
  if (!activeProjectId) {
    return (
      <div style={containerStyle}>
        <div style={placeholderStyle} data-testid="no-project">
          Select a project to view cost data
        </div>
      </div>
    )
  }

  // ─── Loading ───��──────────────────────────────────────────────────────
  const isLoading = (budgetQuery.isLoading && !budgetQuery.data) || (summaryQuery.isLoading && !summaryQuery.data)
  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={placeholderStyle} data-testid="loading">Loading cost data...</div>
      </div>
    )
  }

  // ─── Error ────────────���───────────────────────────────────────────────
  const error = budgetQuery.error || summaryQuery.error
  if (error && !budgetQuery.data && !summaryQuery.data) {
    return (
      <div style={containerStyle}>
        <div style={{ ...rowStyle, color: 'var(--nous-state-blocked)' }} data-testid="error">
          Failed to load cost data: {error.message}
        </div>
      </div>
    )
  }

  const budget = budgetQuery.data
  const summary = summaryQuery.data

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {/* Section 1: Budget Utilization Bar */}
      <div style={sectionHeader}>Budget Utilization</div>
      {budget && budget.hasBudget ? (
        <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--nous-space-2xs)' }}>
            <span data-testid="utilization-percent">
              {budget.utilizationPercent.toFixed(1)}%
            </span>
            <span
              style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}
              data-testid="utilization-label"
            >
              {utilizationLabel(budget.utilizationPercent)}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: 'var(--nous-border-subtle)',
              overflow: 'hidden',
            }}
          >
            <div
              data-testid="utilization-bar"
              style={{
                width: `${Math.min(budget.utilizationPercent, 100)}%`,
                height: '100%',
                borderRadius: '4px',
                background: utilizationColor(budget.utilizationPercent),
                transition: 'width 300ms ease, background 300ms ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-muted)',
              marginTop: 'var(--nous-space-2xs)',
            }}
          >
            <span>${budget.currentSpendUsd.toFixed(2)}</span>
            <span>${budget.budgetCeilingUsd.toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <div style={placeholderStyle} data-testid="no-budget">
          No budget configured
        </div>
      )}

      {/* Section 2: Cost Summary Header */}
      <div style={{ ...sectionHeader, marginTop: 'var(--nous-space-xs)' }}>Cost Summary</div>
      {summary ? (
        <>
          <div style={rowStyle}>
            <span style={{ color: 'var(--nous-fg-muted)' }}>Total Spend</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--nous-font-weight-semibold)' as any }}>
              ${summary.totalCostUsd.toFixed(2)}
            </span>
          </div>
          {summary.topProvider && (
            <div style={rowStyle}>
              <span style={{ color: 'var(--nous-fg-muted)' }}>Top Provider</span>
              <span>{summary.topProvider}</span>
            </div>
          )}
          {summary.topModel && (
            <div style={rowStyle}>
              <span style={{ color: 'var(--nous-fg-muted)' }}>Top Model</span>
              <span>{summary.topModel}</span>
            </div>
          )}
          <div style={rowStyle}>
            <span style={{ color: 'var(--nous-fg-muted)' }}>Events</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.totalEvents.toLocaleString()}</span>
          </div>
        </>
      ) : (
        <div style={placeholderStyle} data-testid="no-cost-data">
          No cost data
        </div>
      )}

      {/* Section 3: Cost Breakdown Tabs */}
      <div style={{ ...sectionHeader, marginTop: 'var(--nous-space-xs)', borderBottom: 'none', paddingBottom: 0 }}>
        Breakdown
      </div>
      <div
        style={{
          display: 'flex',
          gap: '0',
          padding: '0 var(--nous-space-xl)',
          borderBottom: '1px solid var(--nous-border-subtle)',
        }}
      >
        {BREAKDOWN_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={tabButtonStyle(activeTab === tab.key)}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {breakdownQuery.isLoading && !breakdownQuery.data ? (
        <div style={placeholderStyle}>Loading breakdown...</div>
      ) : breakdownQuery.error ? (
        <div style={{ ...rowStyle, color: 'var(--nous-state-blocked)' }}>
          Failed to load breakdown: {breakdownQuery.error.message}
        </div>
      ) : breakdownQuery.data && breakdownQuery.data.length > 0 ? (
        (() => {
          const maxCost = Math.max(...breakdownQuery.data.map((e) => e.totalCostUsd), 0.01)
          const totalCost = breakdownQuery.data.reduce((sum, e) => sum + e.totalCostUsd, 0) || 1
          return breakdownQuery.data
            .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
            .map((entry) => (
              <div key={entry.key} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 'var(--nous-space-2xs)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'var(--nous-font-weight-medium)' as any }}>{entry.key}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${entry.totalCostUsd.toFixed(2)}
                    <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)', marginLeft: 'var(--nous-space-sm)' }}>
                      {((entry.totalCostUsd / totalCost) * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'var(--nous-border-subtle)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(entry.totalCostUsd / maxCost) * 100}%`,
                      height: '100%',
                      borderRadius: '2px',
                      background: 'var(--nous-state-active)',
                    }}
                  />
                </div>
              </div>
            ))
        })()
      ) : (
        <div style={placeholderStyle} data-testid="no-breakdown">
          No breakdown data
        </div>
      )}
    </div>
  )
}
