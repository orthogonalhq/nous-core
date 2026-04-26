'use client'

import type { CSSProperties } from 'react'
import type { StatusBarBudget } from '@nous/shared'
import { useShellContext } from '../ShellContext'

/**
 * WR-162 SP 12 (SUPV-SP12-009 + SUPV-SP12-012) — Budget indicator.
 *
 * Direct slot read from `statusBarSnapshot.budget`; closed-record state
 * mapping (TS exhaustiveness admits the four literals at compile time);
 * closed-form null fallback ('— $'); click → 'cost-monitor' tab.
 *
 * Period rendering: `slot.period` is an ISO datetime per SP 11 SDS-N2
 * (`safeBudget.period = budget.periodStart`). Rendered as compact
 * year-month via `Intl.DateTimeFormat`; on parse failure (malformed
 * ISO), graceful fall-through to the raw string.
 */
const STATE_LABEL: Record<StatusBarBudget['state'], string> = {
  nominal: 'OK',
  warning: 'Warning',
  caution: 'Caution',
  exceeded: 'Exceeded',
}

function formatUsd(n: number): string {
  return '$' + n.toFixed(2)
}

export function formatPeriod(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' }).format(d)
  } catch {
    return iso
  }
}

export function BudgetIndicator({ slot }: { slot: StatusBarBudget | null }) {
  const { setActiveObserveTab, observePanelCollapsed, setObservePanelCollapsed } =
    useShellContext()

  const handleClick = () => {
    setActiveObserveTab('cost-monitor')
    if (observePanelCollapsed) setObservePanelCollapsed(false)
  }

  if (slot === null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-indicator="budget"
        data-state="unavailable"
        aria-label="Budget (not available)"
        style={indicatorButtonStyle}
      >
        — $
      </button>
    )
  }

  const tooltip = `${formatUsd(slot.spent)} / ${formatUsd(slot.ceiling)} · ${formatPeriod(slot.period)}`

  return (
    <button
      type="button"
      onClick={handleClick}
      data-indicator="budget"
      data-state={slot.state}
      aria-label={`Budget: ${STATE_LABEL[slot.state]} (${tooltip})`}
      title={tooltip}
      style={indicatorButtonStyle}
    >
      {formatUsd(slot.spent)} / {formatUsd(slot.ceiling)}
    </button>
  )
}

const indicatorButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  padding: '0 var(--nous-space-xs)',
}
