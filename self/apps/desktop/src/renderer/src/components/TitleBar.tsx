'use client'
import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import type { DockviewApi } from 'dockview-react'
import type { ShellMode } from '@nous/ui/components'
import type { PanelDef } from '../App'
import { AppMenuBar } from './MenuBar'
import { Search } from 'lucide-react'

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
        background: 'var(--nous-bg-surface)',
        userSelect: 'none',
        flexShrink: 0,
      } as ElectronStyle}
    >
      {/* App branding — left anchor, no-drag */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--nous-space-2xl)',
          WebkitAppRegion: 'no-drag',
          pointerEvents: 'none',
          flexShrink: 0,
        } as ElectronStyle}
      >
        <span
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            fontFamily: 'var(--nous-font-family-mono)',
            fontWeight: 500,
            color: 'var(--nous-fg)',
          }}
        >
          Agent Name
        </span>
      </div>

      {/* Menu bar — File / View / Help (hidden in simple mode) */}
      {mode !== 'simple' && (
        <AppMenuBar
          dockviewApi={dockviewApi}
          panelDefs={panelDefs}
          mode={mode}
          onModeToggle={onModeToggle}
        />
      )}

      {/* Centered search bar + flex spacers */}
      <div style={{ flex: 1 }} />
      <div
        role="search"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-md)',
          width: 300,
          height: 26,
          padding: '0 var(--nous-space-xl)',
          background: 'var(--nous-surface)',
          borderRadius: 'var(--nous-radius-md)',
          WebkitAppRegion: 'no-drag',
          cursor: 'text',
          flexShrink: 0,
        } as ElectronStyle}
      >
        <Search
          size={14}
          style={{ color: 'var(--nous-search-icon)', flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-search-placeholder)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Search everything...
        </span>
      </div>
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
            fontSize: 'var(--nous-font-size-base)',
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
            fontSize: 'var(--nous-font-size-base)',
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
            fontSize: 'var(--nous-font-size-md)',
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
