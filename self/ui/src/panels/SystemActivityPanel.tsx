'use client'

import { useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { clsx } from 'clsx'
import type { SystemTurnAckPayload } from '@nous/shared'
import { trpc, useEventSubscription } from '@nous/transport'

// ---------------------------------------------------------------------------
// Inline projection type for BacklogEntry (not importable from @nous/cortex-core)
// ---------------------------------------------------------------------------

export interface BacklogEntryProjection {
  id: string
  status: 'queued' | 'active' | 'suspended' | 'completed' | 'failed'
  source: 'principal_tool' | 'scheduler' | 'system_event' | 'hook'
  priority: 'low' | 'normal' | 'high' | 'critical'
  acceptedAt: string
  instructions: string
  runId: string
}

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

export const TURN_STREAM_MAX_SIZE = 50

function appendToRingBuffer(
  prev: SystemTurnAckPayload[],
  event: SystemTurnAckPayload,
): SystemTurnAckPayload[] {
  const next = [event, ...prev]
  if (next.length > TURN_STREAM_MAX_SIZE) {
    next.length = TURN_STREAM_MAX_SIZE
  }
  return next
}

// ---------------------------------------------------------------------------
// Sub-view: Backlog Queue
// ---------------------------------------------------------------------------

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'var(--nous-state-blocked, #f44)',
  high: 'var(--nous-state-active, #fa0)',
  normal: 'var(--nous-fg-muted)',
  low: 'var(--nous-fg-subtle)',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--nous-state-active)',
  queued: 'var(--nous-state-waiting)',
  suspended: 'var(--nous-state-blocked, #f44)',
  completed: 'var(--nous-state-complete)',
  failed: 'var(--nous-state-blocked, #f44)',
}

function BacklogQueueView() {
  const utils = trpc.useUtils()
  const { data, isLoading, error } = trpc.systemActivity.backlogEntries.useQuery()

  useEventSubscription({
    channels: ['system:backlog-change'],
    onEvent: () => { void utils.systemActivity.backlogEntries.invalidate() },
  })

  return (
    <div data-testid="backlog-queue-view" style={{ borderBottom: '1px solid var(--nous-border)' }}>
      <div
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-2xl)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-muted)',
          fontWeight: 'var(--nous-font-weight-semibold)' as any,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: '1px solid var(--nous-border-subtle)',
        }}
      >
        Backlog Queue
      </div>
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {isLoading && (
          <div
            style={{
              padding: 'var(--nous-space-lg) var(--nous-space-2xl)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-subtle)',
            }}
          >
            Loading backlog entries...
          </div>
        )}
        {error && (
          <div
            data-testid="backlog-error"
            style={{
              padding: 'var(--nous-space-lg) var(--nous-space-2xl)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-state-blocked, #f44)',
            }}
          >
            Failed to load backlog: {error.message}
          </div>
        )}
        {data !== undefined && data.length === 0 && !isLoading && (
          <div
            style={{
              padding: 'var(--nous-space-lg) var(--nous-space-2xl)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-subtle)',
            }}
          >
            No backlog entries
          </div>
        )}
        {data !== undefined &&
          (data as BacklogEntryProjection[]).map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: 'var(--nous-space-sm) var(--nous-space-2xl)',
                borderBottom: '1px solid var(--nous-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--nous-space-lg)',
                fontSize: 'var(--nous-font-size-xs)',
              }}
            >
              <span
                style={{
                  color: PRIORITY_COLOR[entry.priority] ?? 'var(--nous-fg-muted)',
                  fontWeight: 'var(--nous-font-weight-semibold)' as any,
                  textTransform: 'uppercase',
                  minWidth: '50px',
                }}
              >
                {entry.priority}
              </span>
              <span style={{ flex: 1, color: 'var(--nous-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.source}
              </span>
              <span
                style={{
                  color: STATUS_COLOR[entry.status] ?? 'var(--nous-fg-muted)',
                  fontWeight: 'var(--nous-font-weight-medium)' as any,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {entry.status}
              </span>
              <span style={{ color: 'var(--nous-fg-subtle)', minWidth: '80px', textAlign: 'right' }}>
                {entry.acceptedAt}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-view: Turn Activity Stream
// ---------------------------------------------------------------------------

function TurnActivityStreamView() {
  const [turnEvents, setTurnEvents] = useState<SystemTurnAckPayload[]>([])

  useEventSubscription({
    channels: ['system:turn-ack'],
    onEvent: (_channel: string, payload: SystemTurnAckPayload) => {
      setTurnEvents((prev) => appendToRingBuffer(prev, payload))
    },
  })

  return (
    <div data-testid="turn-activity-view" style={{ borderBottom: '1px solid var(--nous-border)' }}>
      <div
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-2xl)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-muted)',
          fontWeight: 'var(--nous-font-weight-semibold)' as any,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: '1px solid var(--nous-border-subtle)',
        }}
      >
        Turn Activity
      </div>
      <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
        {turnEvents.length === 0 && (
          <div
            data-testid="turn-stream-empty"
            style={{
              padding: 'var(--nous-space-lg) var(--nous-space-2xl)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-subtle)',
            }}
          >
            Awaiting turn events...
          </div>
        )}
        {turnEvents.map((event, i) => (
          <div
            key={`${event.runId}-${event.turn}-${i}`}
            data-testid="turn-event-entry"
            style={{
              padding: 'var(--nous-space-sm) var(--nous-space-2xl)',
              borderBottom: '1px solid var(--nous-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--nous-space-lg)',
              fontSize: 'var(--nous-font-size-xs)',
            }}
          >
            <span style={{ color: 'var(--nous-fg)', fontWeight: 'var(--nous-font-weight-medium)' as any }}>
              {event.agentClass}
            </span>
            <span style={{ color: 'var(--nous-fg-muted)' }}>
              turn {event.turn}
            </span>
            <span style={{ color: 'var(--nous-fg-subtle)', fontFamily: 'monospace' }}>
              {event.runId.slice(0, 8)}
            </span>
            <span style={{ color: 'var(--nous-fg-muted)' }}>
              {event.turnsUsed}t / {event.tokensUsed}tok
            </span>
            <span style={{ color: 'var(--nous-fg-subtle)', marginLeft: 'auto' }}>
              {event.emittedAt}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-view: Health Projection
// ---------------------------------------------------------------------------

function HealthProjectionView() {
  const utils = trpc.useUtils()
  const { data, isLoading, error } = trpc.systemActivity.gatewayHealth.useQuery()

  useEventSubscription({
    channels: ['health:gateway-status'],
    onEvent: () => { void utils.systemActivity.gatewayHealth.invalidate() },
  })

  return (
    <div data-testid="health-projection-view">
      <div
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-2xl)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-muted)',
          fontWeight: 'var(--nous-font-weight-semibold)' as any,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: '1px solid var(--nous-border-subtle)',
        }}
      >
        Gateway Health
      </div>
      <div style={{ padding: 'var(--nous-space-lg) var(--nous-space-2xl)' }}>
        {isLoading && (
          <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>
            Loading gateway health...
          </div>
        )}
        {error && (
          <div
            data-testid="health-error"
            style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-state-blocked, #f44)' }}
          >
            Failed to load gateway health: {error.message}
          </div>
        )}
        {data !== undefined && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)' }}>
              <span style={{ color: 'var(--nous-fg-muted)' }}>Gateways</span>
              <span style={{ color: 'var(--nous-fg)' }}>{data.gateways.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)' }}>
              <span style={{ color: 'var(--nous-fg-muted)' }}>Active Sessions</span>
              <span style={{ color: 'var(--nous-fg)' }}>
                {data.appSessions.filter((s) => s.status === 'active').length}
              </span>
            </div>
            {data.escalationCount !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)' }}>
                <span style={{ color: 'var(--nous-fg-muted)' }}>Escalations</span>
                <span style={{ color: data.escalationCount > 0 ? 'var(--nous-state-blocked, #f44)' : 'var(--nous-fg)' }}>
                  {data.escalationCount}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)' }}>
              <span style={{ color: 'var(--nous-fg-muted)' }}>Collected At</span>
              <span style={{ color: 'var(--nous-fg-subtle)' }}>{data.collectedAt}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export interface SystemActivityPanelCoreProps {
  hostingContext?: 'dockview' | 'observe-child'
  className?: string
}

interface SystemActivityPanelProps extends IDockviewPanelProps {
  params: Record<string, never>
}

export function SystemActivityPanel(
  props: SystemActivityPanelProps | SystemActivityPanelCoreProps,
) {
  const className = 'className' in props ? props.className : undefined
  const _hostingContext = 'hostingContext' in props ? props.hostingContext : undefined

  return (
    <div
      className={clsx(className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--nous-fg)',
        fontSize: 'var(--nous-font-size-base)',
      }}
    >
      <div
        style={{
          padding: 'var(--nous-space-md) var(--nous-space-2xl)',
          borderBottom: '1px solid var(--nous-border)',
          fontWeight: 'var(--nous-font-weight-semibold)' as any,
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        System Activity
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <BacklogQueueView />
        <TurnActivityStreamView />
        <HealthProjectionView />
      </div>
      <div
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-2xl)',
          borderTop: '1px solid var(--nous-border)',
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-border)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>System Activity — Read-only</span>
      </div>
    </div>
  )
}
