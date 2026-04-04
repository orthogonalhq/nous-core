'use client'

import { useEffect, useRef } from 'react'
import type { InlineThoughtItem } from './inline-thoughts'

export interface AmbientTeleprompterProps {
  items: InlineThoughtItem[]
  /** Max visible lines — oldest scroll off. */
  maxLines?: number
}

/**
 * Ephemeral teleprompter for `ambient_large` stage.
 * Shows the most recent filtered prose items, auto-scrolls down.
 * Per Q4: separate feed from full stage, no state transfer.
 */
export function AmbientTeleprompter({ items, maxLines = 8 }: AmbientTeleprompterProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const visible = items.slice(-maxLines)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items.length])

  if (visible.length === 0) return null

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="AI activity"
      data-testid="ambient-teleprompter"
      style={styles.container}
    >
      {visible.map((item, i) => (
        <div
          key={i}
          style={{
            ...styles.line,
            opacity: i === visible.length - 1 ? 1 : 0.5,
          }}
        >
          {item.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--nous-space-xs)',
    padding: 'var(--nous-space-sm) var(--nous-space-md)',
    fontFamily: 'var(--nous-font-family-mono)',
    fontSize: 'var(--nous-font-size-xs)',
    color: 'var(--nous-fg-subtle)',
    overflowY: 'hidden' as const,
  },
  line: {
    lineHeight: 1.5,
    transition: 'opacity 0.3s ease',
  },
} as const
