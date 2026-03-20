import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'

const STUB_STATUS = [
  { label: 'Status', value: 'Online', dot: 'var(--nous-state-complete)' },
  { label: 'Uptime', value: '4h 23m' },
  { label: 'Version', value: 'v0.0.1' },
  { label: 'Phase', value: 'phase-7.3' },
  { label: 'Memory', value: '1.2 GB / 4.0 GB' },
]

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

export function SystemStatusWidget(_props: IDockviewPanelProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', color: 'var(--nous-fg)' }}>
      {STUB_STATUS.map((item) => (
        <div key={item.label} style={rowStyle}>
          <span style={{ color: 'var(--nous-fg-muted)' }}>{item.label}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
            {item.dot && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.dot, display: 'inline-block' }} />
            )}
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
