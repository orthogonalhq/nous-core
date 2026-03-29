'use client'

import { clsx } from 'clsx'
import type { ThoughtPfcDecisionPayload } from '@nous/shared'
import { getThoughtLabel } from './thought-labels'

export interface ThoughtCardProps {
  payload: ThoughtPfcDecisionPayload
  compact: boolean
}

const BORDER_COLOR_BY_DECISION: Record<
  ThoughtPfcDecisionPayload['decision'],
  string
> = {
  approved: 'var(--nous-state-approved)',
  denied: 'var(--nous-alert-error)',
  neutral: 'var(--nous-fg-subtle)',
}

export function ThoughtCard({ payload, compact }: ThoughtCardProps) {
  const borderColor = BORDER_COLOR_BY_DECISION[payload.decision]

  return (
    <div
      role="status"
      aria-label={`${payload.decision} ${payload.thoughtType}: ${payload.content}`}
      data-testid="thought-event"
      className={clsx('nous-animate-fade-in-up')}
      style={{
        borderLeft: `3px solid ${borderColor}`,
        padding: compact
          ? 'var(--nous-space-xs) var(--nous-space-sm)'
          : 'var(--nous-space-sm) var(--nous-space-md)',
        fontFamily: 'var(--nous-font-mono)',
        fontSize: 'var(--nous-font-size-xs)',
        lineHeight: 1.4,
        color: 'var(--nous-ambient-fg)',
        background: 'var(--nous-ambient-event-bg)',
        borderRadius: 'var(--nous-radius-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)' }}>
        <span
          style={{
            color: borderColor,
            fontWeight: 'var(--nous-font-weight-medium)' as any,
          }}
        >
          [{getThoughtLabel('thoughtType', payload.thoughtType)}]
        </span>
        <span
          style={{
            color: borderColor,
            fontWeight: 'var(--nous-font-weight-medium)' as any,
            fontSize: 'var(--nous-font-size-2xs)',
            textTransform: 'uppercase',
          }}
        >
          {payload.decision}
        </span>
      </div>
      <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{payload.content}</div>
      {payload.reason && !compact && (
        <div
          style={{
            marginTop: 'var(--nous-space-2xs)',
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-2xs)',
          }}
        >
          {payload.reason}
        </div>
      )}
    </div>
  )
}
