'use client'

import * as React from 'react'
import { useEffect, useState } from 'react'
import type { ShellMode } from '@nous/ui/components'

export interface WebHeaderProps {
  mode: ShellMode
  onModeToggle: () => void
}

export function WebHeader({ mode, onModeToggle }: WebHeaderProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const initial = stored ?? (prefersDark ? 'dark' : 'light')
      setTheme(initial)
      document.documentElement.classList.toggle('dark', initial === 'dark')
    } catch {
      // localStorage may be unavailable
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem('theme', next)
    } catch {
      // localStorage may be unavailable
    }
  }

  return (
    <header
      data-testid="web-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 'var(--nous-titlebar-height)',
        minHeight: 'var(--nous-titlebar-height)',
        padding: '0 var(--nous-space-md)',
        borderBottom: '1px solid var(--nous-header-border)',
        background: 'var(--nous-header-bg)',
        color: 'var(--nous-header-fg)',
        fontFamily: 'var(--nous-font-family)',
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-md)',
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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-sm)',
        }}
      >
        <span
          data-testid="web-header-mode-badge"
          style={{
            fontSize: 'var(--nous-font-size-xs)',
            padding: 'var(--nous-space-xs) var(--nous-space-sm)',
            borderRadius: 'var(--nous-radius-sm)',
            background: 'var(--nous-catalog-card-bg)',
            border: '1px solid var(--nous-shell-column-border)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          {mode === 'simple' ? 'Simple' : 'Developer'}
        </span>

        <button
          type="button"
          data-testid="web-header-mode-toggle"
          onClick={onModeToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--nous-shell-column-border)',
            borderRadius: 'var(--nous-radius-md)',
            background: 'transparent',
            color: 'var(--nous-text-secondary)',
            padding: 'var(--nous-space-xs) var(--nous-space-sm)',
            cursor: 'pointer',
            fontSize: 'var(--nous-font-size-sm)',
            transition: 'var(--nous-hover-button-transition)',
          }}
        >
          {mode === 'simple' ? 'Dev' : 'Simple'}
        </button>

        <button
          type="button"
          data-testid="web-header-theme-toggle"
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--nous-shell-column-border)',
            borderRadius: 'var(--nous-radius-md)',
            background: 'transparent',
            color: 'var(--nous-text-secondary)',
            padding: 'var(--nous-space-xs) var(--nous-space-sm)',
            cursor: 'pointer',
            fontSize: 'var(--nous-font-size-sm)',
            transition: 'var(--nous-hover-button-transition)',
          }}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </header>
  )
}
