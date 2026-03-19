import type { IDockviewPanelProps } from 'dockview-react'
import type { CSSProperties } from 'react'

type AgentEntry = {
  name: string
  detail: string
  status: 'active' | 'complete' | 'waiting'
}

const STUB_AGENTS: AgentEntry[] = [
  { name: 'nous-orchestrator', detail: 'dispatch \u2192 impl', status: 'active' },
  { name: 'nous-prompt-gen', detail: 'handoff \u2192 sds', status: 'complete' },
  { name: 'nous-worker-sds', detail: 'response_packet', status: 'complete' },
  { name: 'nous-worker-impl', detail: 'executing impl', status: 'active' },
  { name: 'nous-reviewer', detail: 'awaiting handoff', status: 'waiting' },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--nous-state-active)',
  complete: 'var(--nous-state-complete)',
  waiting: 'var(--nous-state-waiting)',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'ACTIVE',
  complete: 'COMPLETE',
  waiting: 'WAITING',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
  borderBottom: '1px solid var(--nous-border-subtle)',
}

export function ActiveAgentsWidget(_props: IDockviewPanelProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--nous-fg)' }}>
      <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-xl)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', borderBottom: '1px solid var(--nous-border-subtle)' }}>
        Cycle 3
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {STUB_AGENTS.map((agent) => (
          <div key={agent.name} style={rowStyle}>
            <span style={{ flex: 1, fontWeight: 'var(--nous-font-weight-medium)' as any }}>{agent.name}</span>
            <span style={{ color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-xs)', flex: 1 }}>{agent.detail}</span>
            <span style={{ fontSize: 'var(--nous-font-size-xs)', fontWeight: 'var(--nous-font-weight-semibold)' as any, color: STATUS_COLORS[agent.status], flexShrink: 0 }}>
              {STATUS_LABELS[agent.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
