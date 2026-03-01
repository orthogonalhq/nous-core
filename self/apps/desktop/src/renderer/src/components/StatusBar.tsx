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
        padding: '0 12px',
        background: '#18181b',
        borderTop: '1px solid #27272a',
        fontSize: '11px',
        color: '#71717a',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left slot: connection status + phase */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#22c55e', fontSize: '8px' }}>●</span>
          <span>ready</span>
        </span>
        <span style={{ color: '#3f3f46' }}>|</span>
        <span>ui/phase-1</span>
      </div>

      {/* Right slot: version */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>v0.0.1</span>
      </div>
    </div>
  )
}
