'use client'

import React, { useId } from 'react'
import type { FloatingPanelState } from '../../../types/workflow-builder'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FloatingPanelProps {
  /** Header title text. */
  title: string
  /** Body content (slot pattern). */
  children: React.ReactNode
  /** Controlled state from useFloatingPanel. */
  state: FloatingPanelState
  /** Ref to attach to the panel container for boundary clamping. */
  panelRef?: React.RefObject<HTMLDivElement | null>
  /** Toggle collapsed state. */
  onCollapse: () => void
  /** Toggle pinned state. */
  onPin: () => void
  /** Set visible to false. */
  onClose: () => void
  /** Header mousedown handler for drag. */
  onDragStart: (e: React.MouseEvent) => void
  /** Additional CSS class. */
  className?: string
  /** Additional inline styles. */
  style?: React.CSSProperties
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 'var(--nous-z-dropdown)' as unknown as number,
  background: 'var(--nous-builder-panel-bg)',
  border: '1px solid var(--nous-builder-panel-border)',
  boxShadow: 'var(--nous-builder-panel-shadow)',
  borderRadius: 'var(--nous-radius-md)' as unknown as string,
  overflow: 'hidden',
  minWidth: 220,
  maxWidth: 320,
  userSelect: 'none',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-sm)' as unknown as string,
  padding: 'var(--nous-space-sm) var(--nous-space-md)' as unknown as string,
  background: 'var(--nous-builder-panel-header-bg)',
  color: 'var(--nous-builder-panel-header-text)',
  cursor: 'grab',
  fontSize: 'var(--nous-font-size-sm)' as unknown as string,
  fontWeight: 600,
  borderBottom: '1px solid var(--nous-builder-panel-border)',
}

const headerTitleStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const controlButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--nous-fg-muted)',
  cursor: 'pointer',
  padding: 2,
  borderRadius: 'var(--nous-radius-xs)' as unknown as string,
  fontSize: 14,
  lineHeight: 1,
  width: 22,
  height: 22,
}

const bodyStyle: React.CSSProperties = {
  padding: 'var(--nous-space-sm)' as unknown as string,
  overflow: 'auto',
  maxHeight: 480,
}

// ─── Component ────────────────────────────────────────────────────────────────

function FloatingPanelInner({
  title,
  children,
  state,
  panelRef,
  onCollapse,
  onPin,
  onClose,
  onDragStart,
  className,
  style,
}: FloatingPanelProps) {
  const panelTitleId = useId()

  if (!state.visible) return null

  const pinnedHeaderStyle: React.CSSProperties = {
    ...headerStyle,
    cursor: state.pinned ? 'default' : 'grab',
  }

  return (
    <div
      ref={panelRef}
      className={className}
      style={{
        ...panelStyle,
        left: state.x,
        top: state.y,
        ...style,
      }}
      data-testid="floating-panel"
      role="region"
      aria-label={title}
      aria-labelledby={panelTitleId}
    >
      {/* Header / drag handle */}
      <div
        style={pinnedHeaderStyle}
        onMouseDown={onDragStart}
        data-testid="floating-panel-header"
      >
        <span id={panelTitleId} style={headerTitleStyle}>{title}</span>

        {/* Collapse toggle */}
        <button
          type="button"
          style={controlButtonStyle}
          onClick={onCollapse}
          aria-label={state.collapsed ? 'Expand panel' : 'Collapse panel'}
          data-testid="floating-panel-collapse"
        >
          <i
            className={`codicon ${state.collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`}
          />
        </button>

        {/* Pin toggle */}
        <button
          type="button"
          style={controlButtonStyle}
          onClick={onPin}
          aria-label={state.pinned ? 'Unpin panel' : 'Pin panel'}
          data-testid="floating-panel-pin"
        >
          <i className={`codicon ${state.pinned ? 'codicon-pinned' : 'codicon-pin'}`} />
        </button>

        {/* Close button */}
        <button
          type="button"
          style={controlButtonStyle}
          onClick={onClose}
          aria-label="Close panel"
          data-testid="floating-panel-close"
        >
          <i className="codicon codicon-close" />
        </button>
      </div>

      {/* Body */}
      {!state.collapsed && (
        <div style={bodyStyle} data-testid="floating-panel-body">
          {children}
        </div>
      )}
    </div>
  )
}

export const FloatingPanel = React.memo(FloatingPanelInner)
