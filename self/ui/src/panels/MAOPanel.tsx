'use client'

import type { IDockviewPanelProps } from 'dockview-react'

interface AgentCycleEntry {
  agent: string
  role: 'orchestrator' | 'worker' | 'reviewer' | 'prompt-gen'
  state: 'idle' | 'active' | 'complete' | 'waiting'
  lastPacket?: string
  cycle: number
}

const DEMO_MAO_STATE: AgentCycleEntry[] = [
  { agent: 'nous-orchestrator', role: 'orchestrator', state: 'active', lastPacket: 'dispatch → impl-worker', cycle: 2 },
  { agent: 'nous-prompt-gen', role: 'prompt-gen', state: 'complete', lastPacket: 'handoff → sds-worker', cycle: 1 },
  { agent: 'nous-worker-sds', role: 'worker', state: 'complete', lastPacket: 'response_packet → orchestrator', cycle: 1 },
  { agent: 'nous-worker-impl', role: 'worker', state: 'active', lastPacket: 'executing implementation', cycle: 2 },
  { agent: 'nous-reviewer', role: 'reviewer', state: 'waiting', lastPacket: 'awaiting handoff', cycle: 2 },
]

const ROLE_CODICON: Record<string, string> = {
  orchestrator: 'codicon-circuit-board',
  worker:       'codicon-tools',
  reviewer:     'codicon-eye',
  'prompt-gen': 'codicon-edit',
}

const STATE_VAR: Record<string, string> = {
  idle:     'var(--nous-state-idle)',
  active:   'var(--nous-state-active)',
  complete: 'var(--nous-state-complete)',
  waiting:  'var(--nous-state-waiting)',
}

interface MAOPanelProps extends IDockviewPanelProps {
  params: { entries?: AgentCycleEntry[] }
}

export function MAOPanel({ params }: MAOPanelProps) {
  const entries = params?.entries ?? DEMO_MAO_STATE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)', fontSize: 'var(--nous-font-size-base)' }}>
      <div style={{ padding: 'var(--nous-space-md) var(--nous-space-2xl)', borderBottom: '1px solid var(--nous-border)', fontWeight: 'var(--nous-font-weight-semibold)' as any, fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)', display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>MAO — Agent Cycle</span>
        <span style={{ color: 'var(--nous-fg-subtle)', fontWeight: 'var(--nous-font-weight-regular)' as any, textTransform: 'none', letterSpacing: 0 }}>Cycle {Math.max(...entries.map(e => e.cycle))}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ padding: 'var(--nous-space-lg) var(--nous-space-2xl)', borderBottom: '1px solid var(--nous-border-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xl)' }}>
            <i className={`codicon ${ROLE_CODICON[entry.role]}`} style={{ fontSize: 'var(--nous-icon-size-sm)', flexShrink: 0, color: STATE_VAR[entry.state] }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'var(--nous-font-weight-medium)' as any, color: 'var(--nous-fg)' }}>{entry.agent}</span>
                <span style={{ fontSize: 'var(--nous-font-size-xs)', color: STATE_VAR[entry.state], fontWeight: 'var(--nous-font-weight-semibold)' as any, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{entry.state}</span>
              </div>
              {entry.lastPacket && (
                <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', marginTop: 'var(--nous-space-2xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.lastPacket}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-2xl)', borderTop: '1px solid var(--nous-border)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-border)' }}>
        Stub — live adapter pending DISC-2026-02-28-001 ratification
      </div>
    </div>
  )
}
