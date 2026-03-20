'use client'

import { useState, useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

interface AgentCycleEntry {
  agent: string
  role: 'orchestrator' | 'worker' | 'reviewer' | 'prompt-gen'
  state: 'idle' | 'active' | 'complete' | 'waiting'
  lastPacket?: string
  cycle: number
}

interface MaoApi {
  getAgentProjections: (projectId: string) => Promise<MaoAgentProjection[]>
  getProjectControlProjection: (projectId: string) => Promise<MaoProjectControlProjection | null>
  requestProjectControl: (input: unknown) => Promise<unknown>
}

interface MaoAgentProjection {
  agent_id: string
  state: string
  current_step: string
  progress_percent: number
  risk_level: string
  dispatch_origin_ref: string
  dispatch_state: string
  reflection_cycle_count: number
  last_update_at: string
}

interface MaoProjectControlProjection {
  project_id: string
  control_state: string
  updated_at: string
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

/** Map backend lifecycle state to the panel's display state */
function mapLifecycleState(backendState: string): AgentCycleEntry['state'] {
  switch (backendState) {
    case 'running':
    case 'resuming':
      return 'active'
    case 'completed':
      return 'complete'
    case 'waiting_pfc':
    case 'waiting_async':
    case 'blocked':
    case 'paused':
      return 'waiting'
    case 'queued':
    case 'ready':
    case 'failed':
    default:
      return 'idle'
  }
}

/** Infer a display role from dispatch_origin_ref or agent_id patterns */
function inferRole(projection: MaoAgentProjection): AgentCycleEntry['role'] {
  const ref = (projection.dispatch_origin_ref ?? '').toLowerCase()
  const id = (projection.agent_id ?? '').toLowerCase()
  if (ref.includes('orchestrat') || id.includes('orchestrat')) return 'orchestrator'
  if (ref.includes('review') || id.includes('review')) return 'reviewer'
  if (ref.includes('prompt') || id.includes('prompt')) return 'prompt-gen'
  return 'worker'
}

function projectionsToEntries(projections: MaoAgentProjection[]): AgentCycleEntry[] {
  return projections.map((p) => ({
    agent: p.dispatch_origin_ref || p.agent_id,
    role: inferRole(p),
    state: mapLifecycleState(p.state),
    lastPacket: p.current_step,
    cycle: p.reflection_cycle_count || 1,
  }))
}

const MAO_POLL_INTERVAL = 4000

interface MAOPanelProps extends IDockviewPanelProps {
  params: {
    entries?: AgentCycleEntry[]
    maoApi?: MaoApi
  }
}

export function MAOPanel({ params }: MAOPanelProps) {
  const maoApi = params?.maoApi
  const [entries, setEntries] = useState<AgentCycleEntry[]>(params?.entries ?? DEMO_MAO_STATE)
  const [controlState, setControlState] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!maoApi) {
      setIsLive(false)
      setEntries(params?.entries ?? DEMO_MAO_STATE)
      return
    }

    let cancelled = false

    const poll = async () => {
      try {
        // Use a placeholder project ID — the backend returns whatever project is active
        const projections = await maoApi.getAgentProjections('00000000-0000-0000-0000-000000000000')
        if (cancelled || !mountedRef.current) return

        if (Array.isArray(projections) && projections.length > 0) {
          setEntries(projectionsToEntries(projections))
          setIsLive(true)
          setError(null)
        } else {
          // Backend returned empty — show demo state with a note
          setEntries(params?.entries ?? DEMO_MAO_STATE)
          setIsLive(false)
          setError(null)
        }

        // Also fetch control state
        try {
          const ctrl = await maoApi.getProjectControlProjection('00000000-0000-0000-0000-000000000000')
          if (!cancelled && mountedRef.current && ctrl && typeof ctrl === 'object') {
            setControlState((ctrl as MaoProjectControlProjection).control_state ?? null)
          }
        } catch {
          // Non-critical — control state is optional
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setError('MAO backend unavailable')
          setIsLive(false)
        }
      }
    }

    void poll()
    const intervalId = window.setInterval(poll, MAO_POLL_INTERVAL)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [maoApi, params?.entries])

  const maxCycle = Math.max(...entries.map(e => e.cycle), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)', fontSize: 'var(--nous-font-size-base)' }}>
      <div style={{ padding: 'var(--nous-space-md) var(--nous-space-2xl)', borderBottom: '1px solid var(--nous-border)', fontWeight: 'var(--nous-font-weight-semibold)' as any, fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)', display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <span>MAO — Agent Cycle</span>
        <span style={{ display: 'flex', gap: 'var(--nous-space-lg)', alignItems: 'center' }}>
          {controlState && (
            <span style={{ color: 'var(--nous-fg-subtle)', fontWeight: 'var(--nous-font-weight-regular)' as any, textTransform: 'none', letterSpacing: 0, fontSize: 'var(--nous-font-size-xs)' }}>
              {controlState}
            </span>
          )}
          <span style={{ color: 'var(--nous-fg-subtle)', fontWeight: 'var(--nous-font-weight-regular)' as any, textTransform: 'none', letterSpacing: 0 }}>Cycle {maxCycle}</span>
        </span>
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
      <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-2xl)', borderTop: '1px solid var(--nous-border)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-border)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{isLive ? 'Live' : 'Stub — live adapter pending backend connection'}</span>
        {error && <span style={{ color: 'var(--nous-state-blocked)' }}>{error}</span>}
      </div>
    </div>
  )
}
