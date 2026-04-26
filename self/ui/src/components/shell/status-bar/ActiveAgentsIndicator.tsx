'use client'

import type { CSSProperties } from 'react'
import type { StatusBarActiveAgents } from '@nous/shared'
import { useShellContext } from '../ShellContext'

/**
 * WR-162 SP 12 (SUPV-SP12-010 + SUPV-SP12-012) — Active Agents indicator.
 *
 * Direct slot read from `statusBarSnapshot.activeAgents`; closed-record
 * status mapping (TS exhaustiveness admits both literals at compile
 * time); closed-form null fallback ('— Ag'); click → 'agents' tab.
 */
const STATUS_LABEL: Record<StatusBarActiveAgents['status'], string> = {
  idle: 'Idle',
  active: 'Active',
}

export function ActiveAgentsIndicator({ slot }: { slot: StatusBarActiveAgents | null }) {
  const { setActiveObserveTab, observePanelCollapsed, setObservePanelCollapsed } =
    useShellContext()

  const handleClick = () => {
    setActiveObserveTab('agents')
    if (observePanelCollapsed) setObservePanelCollapsed(false)
  }

  if (slot === null) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-indicator="active-agents"
        data-state="unavailable"
        aria-label="Active agents (not available)"
        style={indicatorButtonStyle}
      >
        — Ag
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-indicator="active-agents"
      data-status={slot.status}
      aria-label={`Active agents: ${slot.count} (${STATUS_LABEL[slot.status]})`}
      title={`${slot.count} agents · ${STATUS_LABEL[slot.status]}`}
      style={indicatorButtonStyle}
    >
      {slot.count} Ag
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
