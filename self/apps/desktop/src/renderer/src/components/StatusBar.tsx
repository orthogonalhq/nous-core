'use client'

import type { ShellMode } from '@nous/ui/components'

export function StatusBar({
  mode,
}: {
  mode: ShellMode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 'var(--nous-statusbar-height)',
        minHeight: 'var(--nous-statusbar-height)',
        padding: '0 0',
        background: 'var(--nous-footer-bg)',
        borderTop: '1px solid var(--nous-footer-border)',
        fontSize: 'var(--nous-font-size-xs)',
        color: 'var(--nous-footer-fg)',
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)' }}>
            <span style={{ fontSize: 'var(--nous-indicator-size)' }}>●</span>
            <span>ready</span>
          </span>
          <span aria-label="Active project scope" style={{ minWidth: 'var(--nous-space-4xl)' }} />
          <span>0 workflows</span>
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
    </div>
  )
}
