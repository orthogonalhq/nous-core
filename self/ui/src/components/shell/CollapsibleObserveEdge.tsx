'use client'

import * as React from 'react'
import { clsx } from 'clsx'

const COLLAPSED_THRESHOLD = 60

export interface CollapsibleObserveEdgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Current observe column width in pixels */
  width: number
  /** Called when the user clicks the expand chevron */
  onExpandToggle: () => void
  children: React.ReactNode
}

export function CollapsibleObserveEdge({
  width,
  onExpandToggle,
  children,
  className,
  style,
  ...props
}: CollapsibleObserveEdgeProps) {
  const isCollapsed = width < COLLAPSED_THRESHOLD

  return (
    <div
      className={clsx('nous-collapsible-observe-edge', className)}
      data-shell-component="collapsible-observe-edge"
      data-state={isCollapsed ? 'collapsed' : 'expanded'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {isCollapsed ? (
        <button
          type="button"
          aria-label="Expand observe panel"
          data-action="expand"
          onClick={onExpandToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            color: 'var(--nous-text-tertiary)',
            cursor: 'pointer',
            fontSize: 'var(--nous-font-size-md, 16px)',
            padding: 0,
            transition: 'var(--nous-hover-button-transition)',
          }}
        >
          &#x2039;
        </button>
      ) : (
        children
      )}
    </div>
  )
}
