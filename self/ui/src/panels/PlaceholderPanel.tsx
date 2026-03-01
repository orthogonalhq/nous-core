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
        background: '#1e1e1e',
        color: '#9d9d9d',
      }}
    >
      <div style={{ textAlign: 'center', gap: '6px', display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '16px', fontWeight: 600, color: '#cccccc' }}>Nous</span>
        <span style={{ fontSize: '12px', color: '#6a6a6a' }}>Panel: {api.id}</span>
      </div>
    </div>
  )
}
