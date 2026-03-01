'use client'

import type { IDockviewPanelProps } from 'dockview-react'

export function PlaceholderPanel({ api }: IDockviewPanelProps) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--nous-bg)',
        color: 'var(--nous-fg-muted)',
      }}
    >
      <div style={{ textAlign: 'center', gap: '6px', display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--nous-fg)' }}>Nous</span>
        <span style={{ fontSize: '12px', color: 'var(--nous-fg-subtle)' }}>Panel: {api.id}</span>
      </div>
    </div>
  )
}
