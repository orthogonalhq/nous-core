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

const ROLE_ICON: Record<string, string> = {
  orchestrator: '🎯', worker: '⚙️', reviewer: '🔍', 'prompt-gen': '✍️',
}

const STATE_COLOR: Record<string, string> = {
  idle: '#52525b', active: '#3b82f6', complete: '#22c55e', waiting: '#f59e0b',
}

interface MAOPanelProps extends IDockviewPanelProps {
  params?: { entries?: AgentCycleEntry[] }
}

export function MAOPanel({ params }: MAOPanelProps) {
  const entries = params?.entries ?? DEMO_MAO_STATE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#18181b', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif', fontSize: '13px' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #3f3f46', fontWeight: 600, fontSize: '12px', color: '#a1a1aa', display: 'flex', justifyContent: 'space-between' }}>
        <span>MAO — Agent Cycle</span>
        <span style={{ color: '#52525b', fontWeight: 400 }}>Cycle {Math.max(...entries.map(e => e.cycle))}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{ROLE_ICON[entry.role]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500, color: '#d4d4d8' }}>{entry.agent}</span>
                <span style={{ fontSize: '11px', color: STATE_COLOR[entry.state], fontWeight: 600, textTransform: 'uppercase' }}>{entry.state}</span>
              </div>
              {entry.lastPacket && (
                <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.lastPacket}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '6px 16px', borderTop: '1px solid #3f3f46', fontSize: '11px', color: '#52525b' }}>
        Stub — live adapter pending DISC-2026-02-28-001 ratification
      </div>
    </div>
  )
}
