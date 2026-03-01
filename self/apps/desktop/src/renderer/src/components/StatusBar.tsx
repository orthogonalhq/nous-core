'use client'

export function StatusBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '22px',
        minHeight: '22px',
        padding: '0 0',
        background: 'var(--nous-bg)',
        borderTop: '1px solid var(--nous-border-subtle)',
        fontSize: '11px',
        color: 'var(--nous-fg-subtle)',
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
            gap: '5px',
            padding: '0 10px',
            height: '100%',
            cursor: 'default',
          }}
        >
          <span style={{ fontSize: '9px', lineHeight: 1 }}>◈</span>
          <span>phase-7.3</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0 8px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '8px' }}>●</span>
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
        <div style={{ padding: '0 10px' }}>v0.0.1</div>
      </div>
    </div>
  )
}
