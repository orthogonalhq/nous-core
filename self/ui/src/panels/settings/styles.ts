import type React from 'react'
import type { Provider } from './types'

// ─── Extracted style objects from PreferencesPanel.tsx (L142-276) ─────────────
// Two token migrations applied per SDS:
//   - badgeStyle padding: '2px 8px' → 'var(--nous-space-2xs) var(--nous-space-md)'
//   - inputStyle fontFamily: 'monospace' → 'var(--nous-font-family-mono)'

export const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--nous-space-2xl)',
}

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-lg)',
  fontWeight: 'var(--nous-font-weight-semibold)' as never,
  color: 'var(--nous-fg)',
  marginBottom: 'var(--nous-space-lg)',
  paddingBottom: 'var(--nous-space-sm)',
  borderBottom: '1px solid var(--nous-header-border)',
}

export const cardStyle: React.CSSProperties = {
  background: 'var(--nous-bg-elevated)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-lg)',
  marginBottom: 'var(--nous-space-md)',
  border: '1px solid var(--nous-header-border)',
}

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-md)',
}

export const badgeStyle = (configured: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: 'var(--nous-space-2xs) var(--nous-space-md)',
  borderRadius: 'var(--nous-radius-sm)',
  fontSize: 'var(--nous-font-size-xs)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
  background: configured ? 'var(--nous-state-active)' : 'var(--nous-bg)',
  color: configured ? 'var(--nous-fg-on-color)' : 'var(--nous-fg-subtle)',
  border: configured ? 'none' : '1px solid var(--nous-header-border)',
})

export const btnStyle = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
  padding: 'var(--nous-space-sm) var(--nous-space-lg)',
  borderRadius: 'var(--nous-radius-md)',
  border: variant === 'ghost' ? '1px solid var(--nous-header-border)' : 'none',
  background:
    variant === 'primary'
      ? 'var(--nous-btn-primary-bg)'
      : variant === 'danger'
        ? 'var(--nous-state-blocked)'
        : 'transparent',
  color: variant === 'ghost' ? 'var(--nous-fg-muted)' : 'var(--nous-fg-on-color)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
})

export const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--nous-input-bg)',
  border: '1px solid var(--nous-header-border)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
  fontFamily: 'var(--nous-font-family-mono)',
}

export const selectStyle: React.CSSProperties = {
  background: 'var(--nous-input-bg)',
  border: '1px solid var(--nous-header-border)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
}

export const feedbackStyle = (success: boolean): React.CSSProperties => ({
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  borderRadius: 'var(--nous-radius-sm)',
  fontSize: 'var(--nous-font-size-sm)',
  background: success ? 'var(--nous-state-active)' : 'var(--nous-state-blocked)',
  color: 'var(--nous-fg-on-color)',
  marginTop: 'var(--nous-space-sm)',
})

export const helperTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-subtle)',
}

export const roleGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 'var(--nous-space-md)',
  marginTop: 'var(--nous-space-lg)',
}

export const roleCardStyle: React.CSSProperties = {
  background: 'var(--nous-surface)',
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-header-border)',
  padding: 'var(--nous-space-lg)',
  display: 'grid',
  gap: 'var(--nous-space-sm)',
}

export const roleCurrentLabelStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--nous-fg-subtle)',
}

export const roleCurrentValueStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-fg)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
}

export const applyAllRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-sm)',
  alignItems: 'center',
  marginTop: 'var(--nous-space-md)',
}

export const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--nous-space-sm)',
  marginTop: 'var(--nous-space-lg)',
}

// ─── Provider Labels (L278) ──────────────────────────────────────────────────

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}
