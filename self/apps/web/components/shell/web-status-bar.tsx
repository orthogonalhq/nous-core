'use client'

import * as React from 'react'
import type { ShellMode } from '@nous/ui/components'

export interface WebStatusBarProps {
  mode?: ShellMode
}

export function WebStatusBar({ mode = 'simple' }: WebStatusBarProps) {
  return (
    <footer
      data-testid="web-status-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '28px',
        minHeight: '28px',
        padding: '0 var(--nous-space-md)',
        borderTop: '1px solid var(--nous-shell-column-border)',
        background: 'var(--nous-bg-base)',
        color: 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-xs)',
        fontFamily: 'var(--nous-font-family)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-sm)',
        }}
      >
        <span data-testid="web-status-bar-status">Connected</span>
        <span
          data-testid="web-status-bar-mode"
          style={{
            padding: '0 var(--nous-space-xs)',
            borderLeft: '1px solid var(--nous-shell-column-border)',
          }}
        >
          {mode === 'simple' ? 'Simple' : 'Developer'}
        </span>
      </div>

      <div>
        <span data-testid="web-status-bar-version">v0.0.1</span>
      </div>
    </footer>
  )
}
