'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const COLLAPSED_THRESHOLD = 60

export interface CollapsibleObserveEdgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Current observe column width in pixels */
  width: number
  /** Called when the user clicks the expand chevron */
  onExpandToggle: () => void
  children: React.ReactNode
}

interface ExpandCollapseButtonProps {
  action: 'expand' | 'collapse'
  label: string
  onClick: () => void
  icon: React.ReactNode
  fullSize?: boolean
}

function ExpandCollapseButton({ action, label, onClick, icon, fullSize }: ExpandCollapseButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <button
      type="button"
      aria-label={label}
      data-action={action}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: fullSize ? '100%' : 'auto',
        height: fullSize ? '100%' : 'auto',
        border: 'none',
        background: isHovered ? 'var(--nous-bg-hover)' : 'transparent',
        borderRadius: 'var(--nous-radius-sm)',
        color: 'var(--nous-text-tertiary)',
        cursor: 'pointer',
        padding: fullSize ? 0 : '2px 4px',
        transition: 'var(--nous-hover-button-transition)',
      }}
    >
      {icon}
    </button>
  )
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
        <ExpandCollapseButton
          action="expand"
          label="Expand observe panel"
          onClick={onExpandToggle}
          icon={<ChevronLeft size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />}
          fullSize
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: 'var(--nous-space-xs)',
              borderBottom: '1px solid var(--nous-shell-column-border)',
              flexShrink: 0,
            }}
          >
            <ExpandCollapseButton
              action="collapse"
              label="Collapse observe panel"
              onClick={onExpandToggle}
              icon={<ChevronRight size={16} />}
            />
          </div>
          <div style={{ flex: '1 1 0%', overflow: 'auto' }}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}
