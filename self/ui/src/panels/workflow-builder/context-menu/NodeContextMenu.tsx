'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Props ──────────────────────────────────────────────────────────────────

export interface NodeContextMenuProps {
  /** Screen-space position for the menu. */
  position: { x: number; y: number }
  /** ID of the target node. */
  nodeId: string
  /** Close the menu. */
  onClose: () => void
  /** Delete the target node. */
  onDeleteNode: (nodeId: string) => void
  /** Duplicate the target node. */
  onDuplicateNode: (nodeId: string) => void
  /** Open the inspector for the target node (used for bind and view actions). */
  onOpenInspector: (nodeId: string) => void
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

const separatorStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--nous-border)',
  margin: '4px 0',
}

// ─── Component ──────────────────────────────────────────────────────────────

function NodeContextMenuInner({
  position,
  nodeId,
  onClose,
  onDeleteNode,
  onDuplicateNode,
  onOpenInspector,
}: NodeContextMenuProps) {
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
    onDeleteNode(nodeId)
    onClose()
  }, [onDeleteNode, nodeId, onClose])

  const handleDuplicate = useCallback(() => {
    onDuplicateNode(nodeId)
    onClose()
  }, [onDuplicateNode, nodeId, onClose])

  const handleOpenInspector = useCallback(() => {
    onOpenInspector(nodeId)
    onClose()
  }, [onOpenInspector, nodeId, onClose])

  return (
    <div
      ref={menuRef}
      style={{ ...menuStyle, left: clampedPosition.x, top: clampedPosition.y }}
      data-testid="node-context-menu"
      role="menu"
    >
      {/* Delete */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleDelete}
        aria-label="Delete node"
        role="menuitem"
        data-testid="context-menu-delete-node"
      >
        <i className="codicon codicon-trash" style={{ fontSize: 14 }} />
        <span>Delete</span>
      </button>

      {/* Duplicate */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleDuplicate}
        aria-label="Duplicate node"
        role="menuitem"
        data-testid="context-menu-duplicate-node"
      >
        <i className="codicon codicon-copy" style={{ fontSize: 14 }} />
        <span>Duplicate</span>
      </button>

      <div style={separatorStyle} role="separator" />

      {/* Bind skill */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleOpenInspector}
        aria-label="Bind skill"
        role="menuitem"
        data-testid="context-menu-bind-skill"
      >
        <i className="codicon codicon-link" style={{ fontSize: 14 }} />
        <span>Bind skill</span>
      </button>

      {/* Bind contract */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleOpenInspector}
        aria-label="Bind contract"
        role="menuitem"
        data-testid="context-menu-bind-contract"
      >
        <i className="codicon codicon-link" style={{ fontSize: 14 }} />
        <span>Bind contract</span>
      </button>

      {/* Bind template */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleOpenInspector}
        aria-label="Bind template"
        role="menuitem"
        data-testid="context-menu-bind-template"
      >
        <i className="codicon codicon-link" style={{ fontSize: 14 }} />
        <span>Bind template</span>
      </button>

      <div style={separatorStyle} role="separator" />

      {/* View node.md */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleOpenInspector}
        aria-label="View node.md"
        role="menuitem"
        data-testid="context-menu-view-nodemd"
      >
        <i className="codicon codicon-file-code" style={{ fontSize: 14 }} />
        <span>View node.md</span>
      </button>
    </div>
  )
}

export const NodeContextMenu = React.memo(NodeContextMenuInner)
