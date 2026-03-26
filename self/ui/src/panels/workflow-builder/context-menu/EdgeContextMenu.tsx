'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Props ──────────────────────────────────────────────────────────────────

export interface EdgeContextMenuProps {
  /** Screen-space position for the menu. */
  position: { x: number; y: number }
  /** ID of the target edge. */
  edgeId: string
  /** Close the menu. */
  onClose: () => void
  /** Delete the target edge. */
  onDeleteEdge: (edgeId: string) => void
  /** Toggle the edge type (execution <-> config). */
  onChangeEdgeType: (edgeId: string) => void
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 50,
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-sm)',
  padding: '4px 0',
  minWidth: 180,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg)',
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  width: '100%',
  textAlign: 'left',
}

const menuItemDisabledStyle: React.CSSProperties = {
  ...menuItemStyle,
  opacity: 0.5,
  cursor: 'default',
}

const separatorStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--nous-border)',
  margin: '4px 0',
}

// ─── Component ──────────────────────────────────────────────────────────────

function EdgeContextMenuInner({
  position,
  edgeId,
  onClose,
  onDeleteEdge,
  onChangeEdgeType,
}: EdgeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [clampedPosition, setClampedPosition] = useState(position)

  // Clamp position to viewport bounds after render
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setClampedPosition({
      x: Math.min(position.x, window.innerWidth - rect.width - 8),
      y: Math.min(position.y, window.innerHeight - rect.height - 8),
    })
  }, [position])

  // Click outside dismissal
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Escape key dismissal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleDelete = useCallback(() => {
    onDeleteEdge(edgeId)
    onClose()
  }, [onDeleteEdge, edgeId, onClose])

  const handleChangeType = useCallback(() => {
    onChangeEdgeType(edgeId)
    onClose()
  }, [onChangeEdgeType, edgeId, onClose])

  return (
    <div
      ref={menuRef}
      style={{ ...menuStyle, left: clampedPosition.x, top: clampedPosition.y }}
      data-testid="edge-context-menu"
      role="menu"
    >
      {/* Delete */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleDelete}
        aria-label="Delete edge"
        role="menuitem"
        data-testid="context-menu-delete-edge"
      >
        <i className="codicon codicon-trash" style={{ fontSize: 14 }} />
        <span>Delete</span>
      </button>

      {/* Change type */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleChangeType}
        aria-label="Change edge type"
        role="menuitem"
        data-testid="context-menu-change-edge-type"
      >
        <i className="codicon codicon-arrow-swap" style={{ fontSize: 14 }} />
        <span>Change type</span>
      </button>

      <div style={separatorStyle} role="separator" />

      {/* Set condition — placeholder */}
      <button
        type="button"
        style={menuItemDisabledStyle}
        disabled
        aria-label="Set condition"
        role="menuitem"
        data-testid="context-menu-set-condition"
      >
        <i className="codicon codicon-filter" style={{ fontSize: 14 }} />
        <span>Set condition</span>
      </button>
    </div>
  )
}

export const EdgeContextMenu = React.memo(EdgeContextMenuInner)
