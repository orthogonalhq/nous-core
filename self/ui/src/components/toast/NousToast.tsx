'use client'

import type { CSSProperties } from 'react'
import { useToast, type ToastEntry } from './ToastContext'

const SEVERITY_COLORS: Record<ToastEntry['severity'], string> = {
  info: 'var(--nous-state-active)',
  warning: 'var(--nous-state-blocked)',
  error: 'var(--nous-state-blocked)',
}

const SEVERITY_BG: Record<ToastEntry['severity'], string> = {
  info: 'var(--nous-bg-surface)',
  warning: 'var(--nous-bg-surface)',
  error: 'var(--nous-bg-surface)',
}

const containerStyle: CSSProperties = {
  position: 'fixed',
  top: 'var(--nous-space-xl)',
  right: 'var(--nous-space-xl)',
  zIndex: 'var(--nous-z-toast)' as any,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-sm)',
  pointerEvents: 'none',
  maxWidth: '400px',
}

function toastItemStyle(severity: ToastEntry['severity']): CSSProperties {
  return {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--nous-space-sm)',
    padding: 'var(--nous-space-md) var(--nous-space-lg)',
    background: SEVERITY_BG[severity],
    border: `1px solid ${SEVERITY_COLORS[severity]}`,
    borderLeft: `3px solid ${SEVERITY_COLORS[severity]}`,
    borderRadius: 'var(--nous-menu-content-radius)',
    boxShadow: 'var(--nous-menu-content-shadow)',
    fontSize: 'var(--nous-font-size-sm)',
    color: 'var(--nous-fg)',
    animation: 'nous-toast-in 200ms ease-out',
  }
}

const closeButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--nous-fg-muted)',
  cursor: 'pointer',
  padding: '0',
  fontSize: 'var(--nous-font-size-sm)',
  lineHeight: 1,
  flexShrink: 0,
}

export function NousToast() {
  const { toasts, dismissToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div style={containerStyle} data-testid="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} style={toastItemStyle(toast.severity)} role="alert" data-testid={`toast-${toast.id}`}>
          <span style={{ flex: 1 }}>{toast.message}</span>
          {toast.dismissible && (
            <button
              onClick={() => dismissToast(toast.id)}
              style={closeButtonStyle}
              aria-label="Dismiss"
              data-testid={`toast-dismiss-${toast.id}`}
            >
              &#x2715;
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
