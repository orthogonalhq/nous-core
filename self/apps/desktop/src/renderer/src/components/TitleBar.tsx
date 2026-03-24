'use client'
import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import type { DockviewApi } from 'dockview-react'
import type { ShellMode } from '@nous/ui/components'
import type { PanelDef } from '../App'
import { AppMenuBar } from './MenuBar'

// Electron-specific CSS property not in standard CSSProperties
type ElectronStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const winAPI = () => window.electronAPI?.win

export function TitleBar({
  dockviewApi,
  panelDefs,
  mode,
  onModeToggle,
}: {
  dockviewApi: DockviewApi | null
  panelDefs: PanelDef[]
  mode: ShellMode
  onModeToggle: () => void
}) {
  const [isMaximized, setIsMaximized] = useState(false)
  const [btnHover, setBtnHover] = useState<'min' | 'max' | 'close' | null>(null)

  // Sync maximized state on mount and whenever the window resizes
  const syncMaximized = useCallback(async () => {
    const api = winAPI()
    if (api) setIsMaximized(await api.isMaximized())
  }, [])

  useEffect(() => {
    syncMaximized()
    window.addEventListener('resize', syncMaximized)
    return () => window.removeEventListener('resize', syncMaximized)
  }, [syncMaximized])

  const handleMinimize = () => winAPI()?.minimize()
  const handleMaximize = async () => {
    await winAPI()?.maximize()
    syncMaximized()
  }
  const handleClose = () => winAPI()?.close()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 'var(--nous-titlebar-height)',
        minHeight: 'var(--nous-titlebar-height)',
        background: 'var(--nous-header-bg)',
        borderBottom: '1px solid var(--nous-header-border)',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        flexShrink: 0,
      } as ElectronStyle}
    >
      {/* App icon + name — left anchor, no-drag */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-md)',
          padding: '0 var(--nous-space-lg) 0 var(--nous-space-xl)',
          WebkitAppRegion: 'no-drag',
          pointerEvents: 'none',
          flexShrink: 0,
        } as ElectronStyle}
      >
        <span style={{ fontSize: 'var(--nous-font-size-base)', color: 'var(--nous-header-fg)', lineHeight: 'var(--nous-line-height-tight)' }}>◈</span>
        <span
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

      <div
        aria-label="Active project"
        style={{
          minWidth: 'var(--nous-space-4xl)',
          paddingRight: 'var(--nous-space-lg)',
          color: 'var(--nous-fg-subtle)',
          fontSize: 'var(--nous-font-size-xs)',
          WebkitAppRegion: 'no-drag',
          pointerEvents: 'none',
          flexShrink: 0,
        } as ElectronStyle}
      />

      {/* Menu bar — File / View / Help */}
      <AppMenuBar
        dockviewApi={dockviewApi}
        panelDefs={panelDefs}
        mode={mode}
        onModeToggle={onModeToggle}
      />

      {/* Drag region fills the middle */}
      <div style={{ flex: 1 }} />

      {/* Window controls — right side */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          WebkitAppRegion: 'no-drag',
        } as ElectronStyle}
      >
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          onMouseEnter={() => setBtnHover('min')}
          onMouseLeave={() => setBtnHover(null)}
          style={{
            width: 'var(--nous-titlebar-btn-width)',
            height: 'var(--nous-titlebar-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btnHover === 'min' ? 'var(--nous-btn-hover)' : 'transparent',
            border: 'none',
            cursor: 'default',
            color: 'var(--nous-header-fg)',
            fontSize: 'var(--nous-font-size-xs)',
            transition: 'background var(--nous-duration-micro) var(--nous-ease-in-out)',
          }}
          title="Minimize"
        >
          &#x2212;
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={handleMaximize}
          onMouseEnter={() => setBtnHover('max')}
          onMouseLeave={() => setBtnHover(null)}
          style={{
            width: 'var(--nous-titlebar-btn-width)',
            height: 'var(--nous-titlebar-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btnHover === 'max' ? 'var(--nous-btn-hover)' : 'transparent',
            border: 'none',
            cursor: 'default',
            color: 'var(--nous-header-fg)',
            fontSize: 'var(--nous-font-size-xs)',
            transition: 'background var(--nous-duration-micro) var(--nous-ease-in-out)',
          }}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? '❐' : '□'}
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          onMouseEnter={() => setBtnHover('close')}
          onMouseLeave={() => setBtnHover(null)}
          style={{
            width: 'var(--nous-titlebar-btn-width)',
            height: 'var(--nous-titlebar-height)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btnHover === 'close' ? 'var(--nous-close-btn)' : 'transparent',
            border: 'none',
            cursor: 'default',
            color: btnHover === 'close' ? 'var(--nous-fg-on-color)' : 'var(--nous-header-fg)',
            fontSize: 'var(--nous-font-size-sm)',
            transition: 'background var(--nous-duration-micro) var(--nous-ease-in-out), color var(--nous-duration-micro) var(--nous-ease-in-out)',
          }}
          title="Close"
        >
          &#x2715;
        </button>
      </div>
    </div>
  )
}
