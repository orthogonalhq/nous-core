'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import type { DockviewApi } from 'dockview-react'

export interface WebDockviewShellProps {
  onApiReady?: (api: DockviewApi) => void
}

const LAYOUT_STORAGE_KEY = 'nous-web-dockview-layout'

const DockviewShellInner = dynamic(
  () => import('./web-dockview-shell-inner').then((mod) => ({ default: mod.WebDockviewShellInner })),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="dockview-loading"
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--nous-text-secondary)',
          fontFamily: 'var(--nous-font-family)',
        }}
      >
        Loading developer workspace...
      </div>
    ),
  },
)

export function WebDockviewShell({ onApiReady }: WebDockviewShellProps) {
  return (
    <div
      data-testid="web-dockview-shell"
      style={{
        height: '100%',
        width: '100%',
        padding: 'var(--nous-space-sm)',
        background: 'var(--nous-surface)',
        boxSizing: 'border-box',
      }}
    >
      <DockviewShellInner onApiReady={onApiReady} />
    </div>
  )
}
