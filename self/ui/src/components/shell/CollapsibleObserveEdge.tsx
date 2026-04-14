'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, PanelRightClose } from 'lucide-react'

const COLLAPSED_THRESHOLD = 60
const PEEK_WIDTH = 32

export interface CollapsibleObserveEdgeProps
    extends React.HTMLAttributes<HTMLDivElement> {
    /** Current observe column width in pixels */
    width: number
    /** The last expanded width — used to keep the panel at full size when collapsed */
    expandedWidth?: number
    /** Called when the user clicks the expand chevron */
    onExpandToggle: () => void
    children: React.ReactNode
}

export function CollapsibleObserveEdge({
    width,
    expandedWidth = 280,
    onExpandToggle,
    children,
    className,
    style,
    ...props
}: CollapsibleObserveEdgeProps) {
    const isCollapsed = width < COLLAPSED_THRESHOLD

    // Panel always renders at full expanded width.
    // When collapsed, the grid column clips it to PEEK_WIDTH — no transform needed.
    const panelWidth = isCollapsed ? expandedWidth : width

    return (
        <div
            className={clsx('nous-collapsible-observe-edge', className)}
            data-shell-component="collapsible-observe-edge"
            data-state={isCollapsed ? 'collapsed' : 'expanded'}
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                width: panelWidth,
                minWidth: panelWidth,
                height: 'calc(100% - 1rem)',
                overflow: 'hidden',
                margin: '0.5rem 0',
                boxSizing: 'border-box',
                borderRadius: 'var(--nous-radius-md) 0 0 var(--nous-radius-md)',
                background: 'var(--nous-bg-surface)',
                ...style,
            }}
            {...props}
        >
            
            {/* Expand button */}
            <button
                type="button"
                aria-label={isCollapsed ? 'Expand observe panel' : 'Collapse observe panel'}
                data-action={isCollapsed ? 'expand' : 'collapse'}
                onClick={onExpandToggle}
                style={{
                    ...styles.toggleButton,
                    ...(isCollapsed ? {
                        position: 'absolute' as const,
                        top: '50%',
                        left: 0,
                        transform: 'translateY(-50%)',
                        zIndex: 5,
                        height: '100%',
                    } : {}),
                }}
            >
                {isCollapsed
                    ? <ChevronLeft size={16} style={{ color: 'var(--nous-text-tertiary)' }} />
                    : ''
                }
            </button>

            {/* Collapse button */}
            <button
                type="button"
                aria-label={isCollapsed ? 'Expand observe panel' : 'Collapse observe panel'}
                data-action={isCollapsed ? 'expand' : 'collapse'}
                onClick={onExpandToggle}
                style={{
                    ...styles.toggleButton,
                    ...(isCollapsed ? {
                        display: 'none',
                    } : {}),
                }}
            >
                <PanelRightClose size={16} style={{ color: 'var(--nous-text-tertiary)' }} />
            </button>


            {/* Content */}
            <div style={styles.content}>
                {children}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
    toggleButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: PEEK_WIDTH,
        border: 'none',
        background: 'transparent',
        borderRadius: 'var(--nous-radius-sm)',
        color: 'var(--nous-text-tertiary)',
        cursor: 'pointer',
        padding: 'var(--nous-space-xs)',
        flexShrink: 0,
        transition: 'var(--nous-hover-button-transition)',
    },
    content: {
        flex: '1 1 0%',
        overflow: 'auto',
    },
} as const
