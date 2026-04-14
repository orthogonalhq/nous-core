'use client'

import type { ShellMode } from '../types'
import { sectionStyle, sectionTitleStyle, cardStyle, rowStyle, helperTextStyle } from '../styles'

export interface ShellModePageProps {
  currentMode: ShellMode
  onModeChange?: (mode: ShellMode) => void
}

export function ShellModePage({ currentMode, onModeChange }: ShellModePageProps) {
  const isDeveloperMode = currentMode === 'developer'

  return (
    <div data-testid="settings-page-shell-mode">
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Shell Mode</div>

        <div style={cardStyle}>
          <div style={rowStyle}>
            <div>
              <label
                htmlFor="developer-mode-toggle"
                style={{
                  fontSize: 'var(--nous-font-size-base)',
                  fontWeight: 'var(--nous-font-weight-semibold)' as never,
                  color: 'var(--nous-fg)',
                }}
              >
                Developer Mode
              </label>
              <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-xs)' }}>
                Switch to the advanced panel-based layout with full customization
              </div>
            </div>
            <input
              id="developer-mode-toggle"
              aria-label="Developer Mode"
              type="checkbox"
              role="switch"
              checked={isDeveloperMode}
              disabled={!onModeChange}
              onChange={(event) => {
                onModeChange?.(
                  event.target.checked ? 'developer' : 'simple',
                )
              }}
              style={{
                width: 'var(--nous-space-4xl)',
                height: 'var(--nous-space-lg)',
                accentColor: 'var(--nous-btn-primary-bg)',
                cursor: onModeChange ? 'pointer' : 'not-allowed',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
