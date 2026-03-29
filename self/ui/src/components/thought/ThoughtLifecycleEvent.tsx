'use client'

import { clsx } from 'clsx'
import type { ThoughtTurnLifecyclePayload } from '@nous/shared'
import { getThoughtLabel } from './thought-labels'

export interface ThoughtLifecycleEventProps {
  payload: ThoughtTurnLifecyclePayload
}

export function ThoughtLifecycleEvent({ payload }: ThoughtLifecycleEventProps) {
  const displayContent = payload.content ?? payload.status

  return (
    <div
      role="status"
      aria-label={`${payload.phase} ${payload.status}`}
      data-testid="thought-event"
      className={clsx('nous-animate-fade-in-up')}
      style={{
        fontFamily: 'var(--nous-font-mono)',
        fontSize: 'var(--nous-font-size-xs)',
        lineHeight: 1.4,
        color: 'var(--nous-fg-subtle)',
        background: 'transparent',
        padding: 'var(--nous-space-2xs) var(--nous-space-sm)',
      }}
    >
      <span
        style={{
          color: 'var(--nous-accent)',
          fontWeight: 'var(--nous-font-weight-medium)' as any,
        }}
      >
        [{getThoughtLabel('phase', payload.phase)}]
      </span>{' '}
      {displayContent}
    </div>
  )
}
