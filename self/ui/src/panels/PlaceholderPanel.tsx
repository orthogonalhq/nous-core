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
        background: '#18181b',
        color: '#a1a1aa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', gap: '8px', display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '18px', fontWeight: 600, color: '#e4e4e7' }}>Nous</span>
        <span style={{ fontSize: '12px', color: '#71717a' }}>Panel: {api.id}</span>
      </div>
    </div>
  )
}
