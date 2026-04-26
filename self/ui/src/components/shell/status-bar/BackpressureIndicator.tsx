'use client'

import type { CSSProperties } from 'react'
import type { StatusBarBackpressure } from '@nous/shared'
import { useShellContext } from '../ShellContext'

/**
 * WR-162 SP 12 (SUPV-SP12-008 + SUPV-SP12-012) — Backpressure indicator.
 *
 * Direct slot read from `statusBarSnapshot.backpressure`; closed-record
 * state mapping (TS exhaustiveness admits the three literals at compile
 * time); closed-form null fallback ('— BP'); click → 'system-load' tab
 * with the SP 11 batched-render contract (one synchronous handler invokes
 * both `setActiveObserveTab` + conditional `setObservePanelCollapsed`).
 */
const STATE_LABEL: Record<StatusBarBackpressure['state'], string> = {
  nominal: 'OK',
  elevated: 'Elevated',
  critical: 'Critical',
}

const STATE_GLYPH: Record<StatusBarBackpressure['state'], string> = {
  nominal: '●',
  elevated: '▲',
  critical: '■',
}

export function BackpressureIndicator({ slot }: { slot: StatusBarBackpressure | null }) {
  const { setActiveObserveTab, observePanelCollapsed, setObservePanelCollapsed } =
    useShellContext()

  const handleClick = () => {
    setActiveObserveTab('system-load')
    if (observePanelCollapsed) setObservePanelCollapsed(false)
  }

  if (slot === null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-indicator="backpressure"
        data-state="unavailable"
        aria-label="Backpressure (not available)"
        style={indicatorButtonStyle}
      >
        — BP
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-indicator="backpressure"
      data-state={slot.state}
      aria-label={`Backpressure: ${STATE_LABEL[slot.state]} (queue ${slot.queueDepth}, ${slot.activeAgents} agents)`}
      title={`Queue ${slot.queueDepth} • ${slot.activeAgents} agents`}
      style={indicatorButtonStyle}
    >
      <span aria-hidden="true">{STATE_GLYPH[slot.state]}</span> {STATE_LABEL[slot.state]}
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
