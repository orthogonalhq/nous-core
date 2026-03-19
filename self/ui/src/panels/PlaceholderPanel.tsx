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
        color: 'var(--nous-fg-muted)',
      }}
    >
      <div style={{ textAlign: 'center', gap: 'var(--nous-space-sm)', display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 'var(--nous-font-size-lg)', fontWeight: 'var(--nous-font-weight-semibold)' as any, color: 'var(--nous-fg)' }}>Nous</span>
        <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-subtle)' }}>Panel: {api.id}</span>
      </div>
    </div>
  )
}
