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

const STATE_COLOR: Record<string, string> = {
  idle:     '#6a6a6a',
  active:   '#007acc',
  complete: '#89d185',
  waiting:  '#cca700',
}

interface MAOPanelProps extends IDockviewPanelProps {
  params?: { entries?: AgentCycleEntry[] }
}

export function MAOPanel({ params }: MAOPanelProps) {
  const entries = params?.entries ?? DEMO_MAO_STATE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', color: '#cccccc', fontSize: '13px' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #3c3c3c', fontWeight: 600, fontSize: '11px', color: '#9d9d9d', display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>MAO — Agent Cycle</span>
        <span style={{ color: '#6a6a6a', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Cycle {Math.max(...entries.map(e => e.cycle))}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ padding: '9px 16px', borderBottom: '1px solid #2d2d2d', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <i className={`codicon ${ROLE_CODICON[entry.role]}`} style={{ fontSize: '14px', flexShrink: 0, color: STATE_COLOR[entry.state] }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500, color: '#cccccc' }}>{entry.agent}</span>
                <span style={{ fontSize: '11px', color: STATE_COLOR[entry.state], fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{entry.state}</span>
              </div>
              {entry.lastPacket && (
                <div style={{ fontSize: '11px', color: '#6a6a6a', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.lastPacket}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '5px 16px', borderTop: '1px solid #3c3c3c', fontSize: '11px', color: '#3c3c3c' }}>
        Stub — live adapter pending DISC-2026-02-28-001 ratification
      </div>
    </div>
  )
}
