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
        height: 'var(--nous-statusbar-height)',
        minHeight: 'var(--nous-statusbar-height)',
        padding: '0',
        borderTop: '1px solid var(--nous-footer-border)',
        background: 'var(--nous-footer-bg)',
        color: 'var(--nous-footer-fg)',
        fontSize: 'var(--nous-font-size-xs)',
        fontFamily: 'var(--nous-font-family)',
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left slot: runtime status */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--nous-space-lg)',
            padding: '0 var(--nous-space-lg)',
          }}
        >
          <span
            data-testid="web-status-bar-indicator"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)' }}
          >
            <span style={{ fontSize: 'var(--nous-indicator-size)' }}>●</span>
            <span>ready</span>
          </span>
          <span aria-label="Active project scope" style={{ minWidth: 'var(--nous-space-4xl)' }} />
          <span data-testid="web-status-bar-workflows">0 workflows</span>
        </div>
      </div>

      {/* Right slot: mode chip (developer mode only) */}
      {mode === 'developer' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <div style={{ padding: '0 var(--nous-space-lg)' }}>
            <div
              data-testid="web-status-bar-mode-badge"
              style={{
                padding: '0 var(--nous-space-sm)',
                borderRadius: 'var(--nous-radius-sm)',
                background: 'var(--nous-surface)',
                fontSize: 'var(--nous-font-size-xs)',
                color: 'var(--nous-fg-subtle)',
              }}
            >
              Developer
            </div>
          </div>
        </div>
      ) : null}
    </footer>
  )
}
