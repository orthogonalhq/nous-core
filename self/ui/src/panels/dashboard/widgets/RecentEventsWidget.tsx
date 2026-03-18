import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'

type EventEntry = {
  time: string
  type: string
  detail: string
}

const STUB_EVENTS: EventEntry[] = [
  { time: '11:16', type: 'agent.cycle.start', detail: 'cycle 3' },
  { time: '11:15', type: 'agent.handoff', detail: 'impl \u2192 reviewer' },
  { time: '11:14', type: 'provider.request', detail: 'llama3.2:3b (342 tokens)' },
  { time: '11:12', type: 'agent.cycle.start', detail: 'cycle 2' },
  { time: '11:10', type: 'agent.handoff', detail: 'sds \u2192 impl' },
  { time: '11:09', type: 'provider.request', detail: 'llama3.2:3b (218 tokens)' },
  { time: '11:07', type: 'agent.handoff', detail: 'prompt-gen \u2192 sds' },
  { time: '11:05', type: 'agent.cycle.start', detail: 'cycle 1' },
]

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xl)',
  padding: 'var(--nous-space-xs) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

export function RecentEventsWidget(_props: IDockviewPanelProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', color: 'var(--nous-fg)' }}>
      {STUB_EVENTS.map((event, i) => (
        <div key={i} style={rowStyle}>
          <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {event.time}
          </span>
          <span style={{ color: 'var(--nous-fg-muted)', flex: 1, fontFamily: 'var(--nous-font-family-mono)', fontSize: 'var(--nous-font-size-xs)' }}>
            {event.type}
          </span>
          <span style={{ color: 'var(--nous-fg)', flexShrink: 0 }}>{event.detail}</span>
        </div>
      ))}
    </div>
  )
}
