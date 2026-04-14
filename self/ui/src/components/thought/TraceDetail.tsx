'use client'

import type { ExecutionTrace } from '@nous/shared'

export interface TraceDetailProps {
  trace: ExecutionTrace
  className?: string
}

export function TraceDetail({ trace, className }: TraceDetailProps) {
  const turn = trace.turns[0]
  if (!turn) {
    return (
      <div
        data-testid="trace-detail"
        className={className}
        style={{
          fontFamily: 'var(--nous-font-mono)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-subtle)',
          padding: 'var(--nous-space-sm) var(--nous-space-md)',
          background: 'var(--nous-bg-elevated)',
          borderRadius: 'var(--nous-radius-sm)',
        }}
      >
        No turn data available.
      </div>
    )
  }

  const pfcDecisions = turn.pfcDecisions ?? []
  const toolDecisions = turn.toolDecisions ?? []
  const memoryWrites = turn.memoryWrites ?? []
  const memoryDenials = turn.memoryDenials ?? []

  return (
    <div
      data-testid="trace-detail"
      className={className}
      style={{
        fontFamily: 'var(--nous-font-mono)',
        fontSize: 'var(--nous-font-size-xs)',
        color: 'var(--nous-fg-subtle)',
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        background: 'var(--nous-bg-elevated)',
        borderRadius: 'var(--nous-radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-sm)',
      }}
    >
      {pfcDecisions.length > 0 && (
        <div>
          <div
            style={{
              fontWeight: 'var(--nous-font-weight-semibold)' as any,
              marginBottom: 'var(--nous-space-2xs)',
              color: 'var(--nous-fg-muted)',
            }}
          >
            PFC Decisions
          </div>
          {pfcDecisions.map((d, i) => (
            <div
              key={i}
              data-testid="trace-pfc-decision"
              style={{
                borderLeft: `2px solid ${d.approved ? 'var(--nous-state-approved)' : 'var(--nous-alert-error)'}`,
                padding: 'var(--nous-space-2xs) var(--nous-space-xs)',
                marginBottom: 'var(--nous-space-2xs)',
              }}
            >
              <span style={{ color: d.approved ? 'var(--nous-state-approved)' : 'var(--nous-alert-error)' }}>
                {d.approved ? 'approved' : 'denied'}
              </span>
              {d.reason && (
                <span style={{ marginLeft: 'var(--nous-space-xs)' }}>{d.reason}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {toolDecisions.length > 0 && (
        <div>
          <div
            style={{
              fontWeight: 'var(--nous-font-weight-semibold)' as any,
              marginBottom: 'var(--nous-space-2xs)',
              color: 'var(--nous-fg-muted)',
            }}
          >
            Tool Decisions
          </div>
          {toolDecisions.map((td, i) => (
            <div
              key={i}
              data-testid="trace-tool-decision"
              style={{
                borderLeft: `2px solid ${td.approved ? 'var(--nous-state-approved)' : 'var(--nous-alert-error)'}`,
                padding: 'var(--nous-space-2xs) var(--nous-space-xs)',
                marginBottom: 'var(--nous-space-2xs)',
              }}
            >
              <span>{td.toolName}</span>
              <span
                style={{
                  marginLeft: 'var(--nous-space-xs)',
                  color: td.approved ? 'var(--nous-state-approved)' : 'var(--nous-alert-error)',
                }}
              >
                {td.approved ? 'approved' : 'denied'}
              </span>
              {td.reason && (
                <span style={{ marginLeft: 'var(--nous-space-xs)' }}>{td.reason}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {memoryWrites.length > 0 && (
        <div data-testid="trace-memory-writes">
          <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as any, color: 'var(--nous-fg-muted)' }}>
            Memory Writes:
          </span>{' '}
          {memoryWrites.length}
        </div>
      )}

      {memoryDenials.length > 0 && (
        <div data-testid="trace-memory-denials">
          <div
            style={{
              fontWeight: 'var(--nous-font-weight-semibold)' as any,
              marginBottom: 'var(--nous-space-2xs)',
              color: 'var(--nous-fg-muted)',
            }}
          >
            Memory Denials
          </div>
          {memoryDenials.map((md, i) => (
            <div
              key={i}
              style={{
                borderLeft: '2px solid var(--nous-alert-error)',
                padding: 'var(--nous-space-2xs) var(--nous-space-xs)',
                marginBottom: 'var(--nous-space-2xs)',
              }}
            >
              {md.reason}
            </div>
          ))}
        </div>
      )}

      {pfcDecisions.length === 0 &&
        toolDecisions.length === 0 &&
        memoryWrites.length === 0 &&
        memoryDenials.length === 0 && (
          <div>No decision data in this turn.</div>
        )}
    </div>
  )
}
