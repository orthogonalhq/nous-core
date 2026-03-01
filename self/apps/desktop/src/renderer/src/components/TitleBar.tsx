'use client'
import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { AppMenuBar } from './MenuBar'

// Electron-specific CSS property not in standard CSSProperties
type ElectronStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const winAPI = () => (window as any).electronAPI?.win

export function TitleBar() {
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
        height: '30px',
        minHeight: '30px',
        background: '#1e1e1e',
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
          gap: '7px',
          padding: '0 10px 0 14px',
          WebkitAppRegion: 'no-drag',
          pointerEvents: 'none',
          flexShrink: 0,
        } as ElectronStyle}
      >
        <span style={{ fontSize: '13px', color: '#858585', lineHeight: 1 }}>◈</span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#858585',
            letterSpacing: '0.01em',
          }}
        >
          Nous
        </span>
      </div>

      {/* Menu bar — File / View / Help */}
      <AppMenuBar />

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
            width: '46px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btnHover === 'min' ? 'rgba(255,255,255,0.07)' : 'transparent',
            border: 'none',
            cursor: 'default',
            color: '#858585',
            fontSize: '11px',
            transition: 'background 0.1s',
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
            width: '46px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btnHover === 'max' ? 'rgba(255,255,255,0.07)' : 'transparent',
            border: 'none',
            cursor: 'default',
            color: '#858585',
            fontSize: '11px',
            transition: 'background 0.1s',
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
            width: '46px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: btnHover === 'close' ? '#e81123' : 'transparent',
            border: 'none',
            cursor: 'default',
            color: btnHover === 'close' ? '#ffffff' : '#858585',
            fontSize: '12px',
            transition: 'background 0.1s, color 0.1s',
          }}
          title="Close"
        >
          &#x2715;
        </button>
      </div>
    </div>
  )
}
