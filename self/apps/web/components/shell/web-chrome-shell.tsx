'use client'

import * as React from 'react'
import type { ShellMode } from '@nous/ui/components'
import { WebHeader } from './web-header'
import { WebStatusBar } from './web-status-bar'

export interface WebChromeShellProps {
  mode: ShellMode
  onModeToggle: () => void
  children: React.ReactNode
}

export function WebChromeShell({ mode, onModeToggle, children }: WebChromeShellProps) {
  return (
    <div
      data-testid="web-chrome-shell"
      data-shell-mode={mode}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--nous-bg)',
        fontFamily: 'var(--nous-font-family)',
      }}
    >
      <WebHeader mode={mode} onModeToggle={onModeToggle} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {children}
      </div>
      <WebStatusBar mode={mode} />
    </div>
  )
}
