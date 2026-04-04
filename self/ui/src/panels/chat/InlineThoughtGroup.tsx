'use client'

import { useState } from 'react'
import { ChevronRight, Podcast } from 'lucide-react'
import type { InlineThoughtItem } from './inline-thoughts'

export interface InlineThoughtGroupProps {
    items: InlineThoughtItem[]
    /** true while the turn is still in progress (always expanded) */
    active?: boolean
}

export function InlineThoughtGroup({ items, active }: InlineThoughtGroupProps) {
    const [expanded, setExpanded] = useState(false)

    if (items.length === 0) return null

    // In-progress turns: always show all items, no collapse toggle
    if (active) {
        return (
            <div style={styles.container} data-testid="inline-thought-group">
                {items.map((item, i) => (
                    <div key={i} style={styles.item} data-testid="inline-thought-item">
                        {item.text}
                    </div>
                ))}
            </div>
        )
    }

    // Completed turns — collapsed summary
    if (!expanded) {
        return (
            <div style={styles.container}>
                <button
                    style={styles.toggle}
                    onClick={() => setExpanded(true)}
                    data-testid="inline-thought-group"
                    aria-expanded={false}
                >
                    <Podcast size={12} strokeWidth={1} />
                    <span>{items.length} {items.length === 1 ? 'action' : 'actions'}</span>
                    <ChevronRight size={12} />
                </button>
            </div>
        )
    }

    // Completed turns — expanded
    return (
        <div style={styles.container} data-testid="inline-thought-group">
            <button
                style={styles.toggle}
                onClick={() => setExpanded(false)}
                aria-expanded={true}
            >
                <Podcast size={12} strokeWidth={1} />
                <span>{items.length} {items.length === 1 ? 'action' : 'actions'}</span>
                <ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} />
            </button>
            {items.map((item, i) => (
                <div key={i} style={styles.item} data-testid="inline-thought-item">
                    {item.text}
                </div>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 'var(--nous-space-2xs)',
        padding: 'var(--nous-space-md) 0',
    },
    item: {
        fontSize: 'var(--nous-font-size-xs)',
        fontFamily: 'var(--nous-font-family-mono)',
        color: 'var(--nous-fg-subtle)',
        paddingLeft: 'var(--nous-space-md)',
        lineHeight: 1.5,
    },
    toggle: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-sm)',
        fontSize: 'var(--nous-font-size-xs)',
        fontFamily: 'var(--nous-font-family-mono)',
        color: 'var(--nous-fg-subtle)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0',
    },
} as const
