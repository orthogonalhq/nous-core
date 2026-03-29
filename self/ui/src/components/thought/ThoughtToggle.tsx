'use client'

export interface ThoughtToggleProps {
  expanded: boolean
  eventCount: number
  onToggle: () => void
  sending: boolean
}

export function ThoughtToggle({
  expanded,
  eventCount,
  onToggle,
  sending,
}: ThoughtToggleProps) {
  const label = `AI thoughts, ${eventCount} event${eventCount !== 1 ? 's' : ''}`

  return (
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls="thought-stream"
      aria-label={label}
      data-testid="thought-toggle"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--nous-fg-subtle)',
        fontSize: 'var(--nous-font-size-xs)',
        padding: 'var(--nous-space-xs) 0',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-xs)',
      }}
    >
      <i
        className="codicon codicon-chevron-right nous-thought-transition"
        data-testid="thought-toggle-chevron"
        style={{
          fontSize: 'var(--nous-font-size-xs)',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform var(--nous-ambient-fade)',
          display: 'inline-block',
        }}
      />
      <span>
        {eventCount} thought{eventCount !== 1 ? 's' : ''}
      </span>
      {sending && !expanded && (
        <span
          style={{
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-2xs)',
            fontStyle: 'italic',
          }}
        >
          Thinking...
        </span>
      )}
    </button>
  )
}
