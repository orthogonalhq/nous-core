'use client'

export function StatusBar() {
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
      {/* Left slot: phase indicator */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--nous-space-sm)',
            padding: '0 var(--nous-space-lg)',
            height: '100%',
            cursor: 'default',
          }}
        >
          <span style={{ fontSize: 'var(--nous-font-size-2xs)', lineHeight: 'var(--nous-line-height-tight)' }}>◈</span>
          <span>phase-7.3</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--nous-space-xs)',
            padding: '0 var(--nous-space-md)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)' }}>
            <span style={{ fontSize: 'var(--nous-indicator-size)' }}>●</span>
            <span>ready</span>
          </span>
        </div>
      </div>

      {/* Right slot: version */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <div style={{ padding: '0 var(--nous-space-lg)' }}>v0.0.1</div>
      </div>
    </div>
  )
}
