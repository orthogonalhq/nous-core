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
        background: '#007acc',
        fontSize: '11px',
        color: '#ffffff',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left slot: remote indicator (Cursor-style remote badge) + phase */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        {/* Remote/connection indicator pill — dark accent, like Cursor's remote badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '0 10px',
            height: '100%',
            background: 'rgba(0,0,0,0.2)',
            cursor: 'default',
          }}
        >
          <span style={{ fontSize: '11px', lineHeight: 1 }}>◈</span>
          <span>ui/phase-1</span>
        </div>

        {/* Status items */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0 8px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '9px' }}>●</span>
            <span>ready</span>
          </span>
        </div>
      </div>

      {/* Right slot: version + encoding hints */}
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
