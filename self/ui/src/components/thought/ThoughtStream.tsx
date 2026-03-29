'use client'

import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'
import type { ThoughtMode } from './use-thought-mode'
import { ThoughtCard } from './ThoughtCard'
import { ThoughtLifecycleEvent } from './ThoughtLifecycleEvent'

export type ThoughtEvent =
  | { channel: 'thought:pfc-decision'; payload: ThoughtPfcDecisionPayload }
  | { channel: 'thought:turn-lifecycle'; payload: ThoughtTurnLifecyclePayload }

export interface ThoughtStreamProps {
  thoughts: ThoughtEvent[]
  mode: ThoughtMode
  className?: string
}

export function ThoughtStream({ thoughts, mode, className }: ThoughtStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  const isCompact = mode === 'conversing:expanded'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thoughts.length])

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="AI thought stream"
      id="thought-stream"
      data-testid="thought-stream"
      className={clsx(className)}
      style={{
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        background: 'var(--nous-bg-elevated)',
        borderRadius: 'var(--nous-radius-sm)',
        fontSize: 'var(--nous-font-size-xs)',
        color: 'var(--nous-fg-subtle)',
        maxHeight: isCompact ? '200px' : undefined,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: isCompact
          ? 'var(--nous-space-xs)'
          : 'var(--nous-space-sm)',
      }}
    >
      {thoughts.map((t, i) =>
        t.channel === 'thought:pfc-decision' ? (
          <ThoughtCard
            key={i}
            payload={t.payload as ThoughtPfcDecisionPayload}
            compact={isCompact}
          />
        ) : (
          <ThoughtLifecycleEvent
            key={i}
            payload={t.payload as ThoughtTurnLifecyclePayload}
          />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  )
}
