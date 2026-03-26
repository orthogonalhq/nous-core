'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getAllRegistryEntries } from '../nodes/node-registry'
import type { NodeCategory } from '../../../types/workflow-builder'

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CanvasContextMenuProps {
  /** Screen-space position for the menu. */
  position: { x: number; y: number }
  /** Close the menu. */
  onClose: () => void
  /** Add a node of the given nousType. */
  onAddNode: (nousType: string) => void
  /** Select all nodes. */
  onSelectAll: () => void
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_ORDER: NodeCategory[] = [
  'trigger', 'agent', 'condition', 'app', 'tool', 'memory', 'governance',
]

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

const submenuContainerStyle: React.CSSProperties = {
  position: 'relative',
}

const submenuStyle: React.CSSProperties = {
  position: 'absolute',
  left: '100%',
  top: 0,
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-sm)',
  padding: '4px 0',
  minWidth: 180,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  fontSize: 'inherit',
  color: 'inherit',
  zIndex: 51,
}

const separatorStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--nous-border)',
  margin: '4px 0',
}

// ─── Component ──────────────────────────────────────────────────────────────

function CanvasContextMenuInner({ position, onClose, onAddNode, onSelectAll }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [clampedPosition, setClampedPosition] = useState(position)
  const [showAddNodeSubmenu, setShowAddNodeSubmenu] = useState(false)

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

  const handleAddNode = useCallback(
    (nousType: string) => {
      onAddNode(nousType)
      onClose()
    },
    [onAddNode, onClose],
  )

  const handleSelectAll = useCallback(() => {
    onSelectAll()
    onClose()
  }, [onSelectAll, onClose])

  // Build grouped registry entries for the sub-menu
  const registryEntries = getAllRegistryEntries()
  const groupedEntries = CATEGORY_ORDER.map((category) => {
    const entries = registryEntries.filter(([, entry]) => entry.category === category)
    return { category, entries }
  }).filter((g) => g.entries.length > 0)

  return (
    <div
      ref={menuRef}
      style={{ ...menuStyle, left: clampedPosition.x, top: clampedPosition.y }}
      data-testid="canvas-context-menu"
      role="menu"
    >
      {/* Add node — with sub-menu */}
      <div
        style={submenuContainerStyle}
        onMouseEnter={() => setShowAddNodeSubmenu(true)}
        onMouseLeave={() => setShowAddNodeSubmenu(false)}
      >
        <button
          type="button"
          style={menuItemStyle}
          aria-label="Add node"
          role="menuitem"
          data-testid="context-menu-add-node"
          onMouseEnter={() => setShowAddNodeSubmenu(true)}
        >
          <i className="codicon codicon-add" style={{ fontSize: 14 }} />
          <span>Add node</span>
          <i className="codicon codicon-chevron-right" style={{ fontSize: 10, marginLeft: 'auto' }} />
        </button>

        {showAddNodeSubmenu && (
          <div style={submenuStyle} data-testid="add-node-submenu" role="menu">
            {groupedEntries.map(({ category, entries }) => (
              <div key={category}>
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: 'var(--nous-font-size-2xs)',
                    color: 'var(--nous-fg-muted)',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {category}
                </div>
                {entries.map(([nousType, entry]) => (
                  <button
                    key={nousType}
                    type="button"
                    style={menuItemStyle}
                    onClick={() => handleAddNode(nousType)}
                    aria-label={`Add ${entry.defaultLabel}`}
                    role="menuitem"
                    data-testid={`add-node-${nousType}`}
                  >
                    <i className={`codicon ${entry.icon}`} style={{ fontSize: 12 }} />
                    <span>{entry.defaultLabel}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={separatorStyle} role="separator" />

      {/* Paste — placeholder */}
      <button
        type="button"
        style={menuItemDisabledStyle}
        disabled
        aria-label="Paste"
        role="menuitem"
        data-testid="context-menu-paste"
      >
        <i className="codicon codicon-clippy" style={{ fontSize: 14 }} />
        <span>Paste</span>
      </button>

      {/* Select all */}
      <button
        type="button"
        style={menuItemStyle}
        onClick={handleSelectAll}
        aria-label="Select all"
        role="menuitem"
        data-testid="context-menu-select-all"
      >
        <i className="codicon codicon-check-all" style={{ fontSize: 14 }} />
        <span>Select all</span>
      </button>

      <div style={separatorStyle} role="separator" />

      {/* Auto-layout — placeholder */}
      <button
        type="button"
        style={menuItemDisabledStyle}
        disabled
        aria-label="Auto-layout"
        role="menuitem"
        data-testid="context-menu-auto-layout"
      >
        <i className="codicon codicon-layout" style={{ fontSize: 14 }} />
        <span>Auto-layout</span>
      </button>
    </div>
  )
}

export const CanvasContextMenu = React.memo(CanvasContextMenuInner)
