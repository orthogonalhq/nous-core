'use client'

import * as React from 'react'
import type { CSSProperties } from 'react'

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md)',
  padding: 'var(--nous-space-4xl)',
  width: '100%',
}

const barStyle: CSSProperties = {
  height: '1rem',
  borderRadius: 'var(--nous-radius-sm)',
  background: 'var(--nous-surface)',
  opacity: 0.5,
  animation: 'pulse 1.5s ease-in-out infinite',
}

export function RouteSkeleton() {
  return (
    <div data-testid="route-skeleton" style={containerStyle}>
      <div style={{ ...barStyle, width: '40%', height: '1.5rem' }} />
      <div style={{ ...barStyle, width: '80%' }} />
      <div style={{ ...barStyle, width: '60%' }} />
      <div style={{ ...barStyle, width: '70%' }} />
    </div>
  )
}
