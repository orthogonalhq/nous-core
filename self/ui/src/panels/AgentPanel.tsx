'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'idle'

export type GovernanceDecision = 'allowed' | 'denied'

export interface AgentToolCall {
  id: string
  toolName: string
  input: unknown
  output?: unknown
  governance: GovernanceDecision
  timestamp: string
}

export interface AgentMessage {
  id: string
  role: 'agent' | 'system' | 'tool'
  content: string
  timestamp: string
  toolCall?: AgentToolCall
}

export interface AgentSession {
  id: string
  agentName: string
  agentType: 'nous.agent.claude' | 'nous.agent.codex' | string
  status: AgentStatus
  messages: AgentMessage[]
}

export interface AgentPanelApi {
  /** Subscribe to session updates. Returns unsubscribe function. */
  onSessionUpdate?: (callback: (session: AgentSession) => void) => () => void
  /** Send a pause/interject signal to the active agent. */
  sendStopSignal?: (sessionId: string) => void
  /** Get initial sessions. */
  getSessions?: () => AgentSession[]
}

interface AgentPanelProps extends IDockviewPanelProps {
  params: { agentApi?: AgentPanelApi }
}

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<AgentStatus, string> = {
  running: 'var(--nous-state-active)',
  waiting: 'var(--nous-state-waiting)',
  completed: 'var(--nous-state-complete)',
  failed: 'var(--nous-state-blocked)',
  idle: 'var(--nous-state-idle)',
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
  idle: 'Idle',
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_SESSIONS: AgentSession[] = [
  {
    id: 'demo-claude-1',
    agentName: 'Claude',
    agentType: 'nous.agent.claude',
    status: 'running',
    messages: [
      { id: 'm1', role: 'agent', content: 'Analyzing the codebase structure...', timestamp: new Date().toISOString() },
      { id: 'm2', role: 'tool', content: 'Read src/index.ts', timestamp: new Date().toISOString(), toolCall: { id: 'tc1', toolName: 'Read', input: { file_path: 'src/index.ts' }, governance: 'allowed', timestamp: new Date().toISOString() } },
      { id: 'm3', role: 'agent', content: 'Found the entry point. Now implementing the feature...', timestamp: new Date().toISOString() },
      { id: 'm4', role: 'tool', content: 'Edit src/auth.ts', timestamp: new Date().toISOString(), toolCall: { id: 'tc2', toolName: 'Edit', input: { file_path: 'src/auth.ts' }, governance: 'allowed', timestamp: new Date().toISOString() } },
    ],
  },
  {
    id: 'demo-codex-1',
    agentName: 'Codex',
    agentType: 'nous.agent.codex',
    status: 'completed',
    messages: [
      { id: 'm5', role: 'agent', content: 'Running tests for the module.', timestamp: new Date().toISOString() },
      { id: 'm6', role: 'tool', content: 'Bash: npm test', timestamp: new Date().toISOString(), toolCall: { id: 'tc3', toolName: 'Bash', input: { command: 'npm test' }, output: { exitCode: 0 }, governance: 'allowed', timestamp: new Date().toISOString() } },
      { id: 'm7', role: 'agent', content: 'All tests passed.', timestamp: new Date().toISOString() },
    ],
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GovernanceBadge({ decision }: { decision: GovernanceDecision }) {
  const isAllowed = decision === 'allowed'
  return (
    <span
      data-testid="governance-badge"
      style={{
        display: 'inline-block',
        fontSize: 'var(--nous-font-size-2xs, 10px)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '1px 6px',
        borderRadius: 'var(--nous-radius-sm, 3px)',
        background: isAllowed ? 'rgba(0,200,100,0.15)' : 'rgba(255,60,60,0.15)',
        color: isAllowed ? 'var(--nous-state-complete, #00c864)' : 'var(--nous-state-blocked, #ff3c3c)',
      }}
    >
      {decision}
    </span>
  )
}

function ToolCallEntry({ toolCall }: { toolCall: AgentToolCall }) {
  return (
    <div
      data-testid="tool-call"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-sm, 4px)',
        padding: 'var(--nous-space-xs, 2px) var(--nous-space-md, 8px)',
        background: 'var(--nous-bg-subtle, rgba(255,255,255,0.03))',
        borderRadius: 'var(--nous-radius-sm, 3px)',
        fontSize: 'var(--nous-font-size-xs, 12px)',
        fontFamily: 'monospace',
      }}
    >
      <i className="codicon codicon-wrench" style={{ fontSize: 'var(--nous-icon-size-xs, 12px)', color: 'var(--nous-fg-muted)' }} />
      <span style={{ fontWeight: 600, color: 'var(--nous-fg)' }}>{toolCall.toolName}</span>
      <GovernanceBadge decision={toolCall.governance} />
    </div>
  )
}

function MessageEntry({ message }: { message: AgentMessage }) {
  const isToolMessage = message.role === 'tool' && message.toolCall
  return (
    <div
      data-testid="agent-message"
      style={{
        padding: 'var(--nous-space-sm, 4px) 0',
      }}
    >
      {isToolMessage && message.toolCall ? (
        <ToolCallEntry toolCall={message.toolCall} />
      ) : (
        <div style={{
          fontSize: 'var(--nous-font-size-base, 14px)',
          lineHeight: 1.5,
          color: message.role === 'system' ? 'var(--nous-fg-subtle)' : 'var(--nous-fg)',
        }}>
          {message.content}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span
      data-testid="status-dot"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: STATUS_COLORS[status],
        flexShrink: 0,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  sessions,
  activeSessionId,
  onSelectSession,
}: {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
}) {
  return (
    <div
      data-testid="agent-tab-bar"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--nous-border, #333)',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId
        return (
          <button
            key={session.id}
            data-testid={`agent-tab-${session.id}`}
            onClick={() => onSelectSession(session.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--nous-space-sm, 4px)',
              padding: 'var(--nous-space-sm, 4px) var(--nous-space-xl, 12px)',
              background: isActive ? 'var(--nous-bg-elevated, #1e1e1e)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--nous-accent, #007acc)' : '2px solid transparent',
              color: isActive ? 'var(--nous-fg)' : 'var(--nous-fg-muted)',
              cursor: 'pointer',
              fontSize: 'var(--nous-font-size-sm, 13px)',
              whiteSpace: 'nowrap',
            }}
          >
            <StatusDot status={session.status} />
            <span>{session.agentName}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conversation stream
// ---------------------------------------------------------------------------

function ConversationStream({ messages }: { messages: AgentMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div
      data-testid="conversation-stream"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--nous-space-lg, 8px) var(--nous-space-2xl, 16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-sm, 4px)',
      }}
    >
      {messages.length === 0 && (
        <div style={{ color: 'var(--nous-fg-subtle)', textAlign: 'center', marginTop: 'var(--nous-space-4xl, 32px)', fontSize: 'var(--nous-font-size-base, 14px)' }}>
          No agent activity yet.
        </div>
      )}
      {messages.map((msg) => (
        <MessageEntry key={msg.id} message={msg} />
      ))}
      <div ref={endRef} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main AgentPanel
// ---------------------------------------------------------------------------

export function AgentPanel({ params }: AgentPanelProps) {
  const agentApi = params?.agentApi
  const [sessions, setSessions] = useState<AgentSession[]>(() =>
    agentApi?.getSessions?.() ?? DEMO_SESSIONS,
  )
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => sessions[0]?.id ?? null,
  )

  // Subscribe to session updates from the API
  useEffect(() => {
    if (!agentApi?.onSessionUpdate) return

    const unsubscribe = agentApi.onSessionUpdate((updatedSession) => {
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === updatedSession.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updatedSession
          return next
        }
        return [...prev, updatedSession]
      })

      // Auto-select new sessions if none is active
      setActiveSessionId((currentId) =>
        currentId ?? updatedSession.id,
      )
    })

    return unsubscribe
  }, [agentApi])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  const handlePause = useCallback(() => {
    if (activeSessionId && agentApi?.sendStopSignal) {
      agentApi.sendStopSignal(activeSessionId)
    }
  }, [activeSessionId, agentApi])

  const isRunning = activeSession?.status === 'running'

  return (
    <div
      data-testid="agent-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--nous-fg)',
        fontSize: 'var(--nous-font-size-base, 14px)',
      }}
    >
      {/* Panel header */}
      <div style={{
        padding: 'var(--nous-space-md, 6px) var(--nous-space-2xl, 16px)',
        borderBottom: '1px solid var(--nous-header-border, #333)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm, 4px)' }}>
          <i className="codicon codicon-terminal" style={{ fontSize: 'var(--nous-icon-size-sm, 14px)', color: 'var(--nous-fg-muted)' }} />
          <span style={{
            fontWeight: 600,
            fontSize: 'var(--nous-font-size-sm, 13px)',
            color: 'var(--nous-fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Coding Agents
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-md, 8px)' }}>
          {activeSession && (
            <span data-testid="agent-status" style={{
              fontSize: 'var(--nous-font-size-xs, 12px)',
              color: STATUS_COLORS[activeSession.status],
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {STATUS_LABELS[activeSession.status]}
            </span>
          )}
          <button
            data-testid="pause-button"
            onClick={handlePause}
            disabled={!isRunning}
            style={{
              background: isRunning ? 'var(--nous-state-blocked, #ff3c3c)' : 'var(--nous-input-bg, #333)',
              border: 'none',
              borderRadius: 'var(--nous-radius-sm, 3px)',
              padding: 'var(--nous-space-xs, 2px) var(--nous-space-lg, 10px)',
              color: isRunning ? 'var(--nous-fg-on-color, #fff)' : 'var(--nous-fg-muted)',
              cursor: isRunning ? 'pointer' : 'not-allowed',
              fontSize: 'var(--nous-font-size-xs, 12px)',
              fontWeight: 600,
              opacity: isRunning ? 1 : 0.5,
            }}
          >
            Pause
          </button>
        </div>
      </div>

      {/* Tab bar */}
      {sessions.length > 0 && (
        <TabBar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
        />
      )}

      {/* Conversation stream */}
      {activeSession ? (
        <ConversationStream messages={activeSession.messages} />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--nous-fg-subtle)',
        }}>
          No agent sessions active.
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: 'var(--nous-space-sm, 4px) var(--nous-space-2xl, 16px)',
        borderTop: '1px solid var(--nous-border, #333)',
        fontSize: 'var(--nous-font-size-xs, 12px)',
        color: 'var(--nous-fg-subtle)',
        flexShrink: 0,
      }}>
        {sessions.length} session{sessions.length !== 1 ? 's' : ''} — {activeSession?.agentType ?? 'none'}
      </div>
    </div>
  )
}
