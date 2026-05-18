'use client'
import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import type { DockviewApi } from 'dockview-react'
import type { ShellMode } from '@nous/ui/components'
import type { PanelDef } from '../App'
import { AppMenuBar } from './MenuBar'
import { ChevronLeft, ChevronRight, MessageCircle, PanelTop, Code2, Search } from 'lucide-react'

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
        height: 'var(--nous-shell-topbar-height, 35px)',
        minHeight: 'var(--nous-shell-topbar-height, 35px)',
        background: 'var(--nous-workspace-shell-frame-bg)',
        borderBottom: '1px solid var(--nous-workspace-shell-border)',
        userSelect: 'none',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as ElectronStyle}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          WebkitAppRegion: 'no-drag',
          flexShrink: 0,
        } as ElectronStyle}
        data-reference-extraction="TOPO-02 DIM-11 STATE-01"
      >
        <button type="button" aria-label="Back" style={topbarIconButton}><ChevronLeft size={14} /></button>
        <button type="button" aria-label="Forward" style={topbarIconButton}><ChevronRight size={14} /></button>
      </div>

      {/* App branding — simple mode clusters brand, tabs, and search like the reference chrome. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px 0 32px',
          WebkitAppRegion: 'no-drag',
          pointerEvents: 'none',
          flexShrink: 0,
        } as ElectronStyle}
      >
        <span
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            fontFamily: 'var(--nous-font-family)',
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: 'var(--nous-fg)',
          }}
        >
          Nous
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

      {mode === 'simple' && (
        <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: 2,
          borderRadius: 999,
          background: 'rgba(255, 255, 255, 0.035)',
            WebkitAppRegion: 'no-drag',
          } as ElectronStyle}
          data-reference-extraction="STATE-01 PAL-10 TYPE-04"
        >
          <span style={topbarTabMuted}><MessageCircle size={12} />Chat</span>
          <span style={topbarTabActive}><PanelTop size={12} />Workspaces</span>
          <span style={topbarTabMuted}><Code2 size={12} />Developer</span>
        </div>
      )}

      {/* Centered search bar + flex spacers */}
      <div style={{ flex: mode === 'simple' ? '0 1 32px' : 1 }} />
      <div
        role="search"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: 310,
          height: 26,
          padding: '0 12px',
          background: 'var(--nous-search-bg)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 8,
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
          Search...
        </span>
        <span
          style={{
            marginLeft: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            borderRadius: 5,
            padding: '1px 6px',
            color: 'var(--nous-fg-subtle)',
            fontFamily: 'var(--nous-font-family-mono)',
            fontSize: 'var(--nous-type-micro-xs, 10px)',
          }}
        >
          ⌘ K
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
            height: 'var(--nous-shell-topbar-height, 35px)',
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
            height: 'var(--nous-shell-topbar-height, 35px)',
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
            height: 'var(--nous-shell-topbar-height, 35px)',
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

const topbarIconButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 7,
  background: 'rgba(255, 255, 255, 0.025)',
  color: 'var(--nous-fg-subtle)',
  padding: 0,
}

const topbarTabMuted: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 24,
  padding: '3px 12px',
  borderRadius: 999,
  color: 'var(--nous-fg-subtle)',
  fontSize: 'var(--nous-font-size-xs)',
}

const topbarTabActive: CSSProperties = {
  ...topbarTabMuted,
  color: '#ffffff',
  background: 'rgba(91, 124, 255, 0.14)',
  border: '1px solid rgba(91, 124, 255, 0.28)',
}
