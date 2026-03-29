'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import type { DockviewApi } from 'dockview-react'
import type { ShellMode } from '@nous/ui/components'
import type { PanelDef } from './web-panel-defs'

const WebMenuBar = dynamic(
  () => import('./web-menu-bar').then((mod) => ({ default: mod.WebMenuBar })),
  { ssr: false },
)

export interface WebHeaderProps {
  mode: ShellMode
  onModeToggle: () => void
  dockviewApi?: DockviewApi | null
  panelDefs?: PanelDef[]
}

export function WebHeader({ mode, onModeToggle, dockviewApi, panelDefs }: WebHeaderProps) {
  return (
    <header
      data-testid="web-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 'var(--nous-titlebar-height)',
        minHeight: 'var(--nous-titlebar-height)',
        background: 'var(--nous-header-bg)',
        borderBottom: '1px solid var(--nous-header-border)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* App icon + name — left anchor */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-md)',
          padding: '0 var(--nous-space-lg) 0 var(--nous-space-xl)',
          pointerEvents: 'none',
          flexShrink: 0,
        }}
      >
        <span
          data-testid="web-header-app-icon"
          style={{
            fontSize: 'var(--nous-font-size-base)',
            color: 'var(--nous-header-fg)',
            lineHeight: 'var(--nous-line-height-tight)',
          }}
        >
          ◈
        </span>
        <span
          data-testid="web-header-app-name"
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            fontWeight: 'var(--nous-font-weight-medium)' as any,
            color: 'var(--nous-header-fg)',
            letterSpacing: '0.01em',
          }}
        >
          Nous
        </span>
      </div>

      {/* Project placeholder (matches desktop TitleBar) */}
      <div
        aria-label="Active project"
        style={{
          minWidth: 'var(--nous-space-4xl)',
          paddingRight: 'var(--nous-space-lg)',
          color: 'var(--nous-fg-subtle)',
          fontSize: 'var(--nous-font-size-xs)',
          flexShrink: 0,
        }}
      />

      {/* Menu bar — File / View / Help */}
      <WebMenuBar mode={mode} onModeToggle={onModeToggle} dockviewApi={dockviewApi ?? null} panelDefs={panelDefs ?? []} />

      {/* Spacer fills the rest */}
      <div style={{ flex: 1 }} />
    </header>
  )
}
