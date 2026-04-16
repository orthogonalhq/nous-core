'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { FloatingPanel, useFloatingPanel } from './floating-panel'
import { getAllRegistryEntries } from './nodes/node-registry'
import type { NodePaletteItem, NodeCategory } from '../../types/workflow-builder'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NodePaletteProps {
  /** Canvas wrapper ref for boundary clamping. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── Category display metadata ────────────────────────────────────────────────

const CATEGORY_META: Record<NodeCategory, { label: string; icon: string }> = {
  trigger:    { label: 'Triggers',   icon: 'codicon-zap' },
  agent:      { label: 'Agents',     icon: 'codicon-hubot' },
  condition:  { label: 'Conditions', icon: 'codicon-git-compare' },
  app:        { label: 'Apps',       icon: 'codicon-plug' },
  tool:       { label: 'Tools',      icon: 'codicon-search' },
  memory:     { label: 'Memory',     icon: 'codicon-database' },
  governance: { label: 'Governance', icon: 'codicon-shield' },
}

const CATEGORY_ORDER: NodeCategory[] = [
  'trigger', 'agent', 'condition', 'app', 'tool', 'memory', 'governance',
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const searchContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)' as unknown as string,
  padding: 'var(--nous-space-xs)' as unknown as string,
  marginBottom: 'var(--nous-space-xs)' as unknown as string,
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--nous-bg-input)',
  border: '1px solid var(--nous-builder-panel-border)',
  borderRadius: 'var(--nous-radius-xs)' as unknown as string,
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  padding: 'var(--nous-space-xs) var(--nous-space-sm)' as unknown as string,
  outline: 'none',
  width: '100%',
}

const categoryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)' as unknown as string,
  padding: 'var(--nous-space-xs) var(--nous-space-sm)' as unknown as string,
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  fontWeight: 600,
  color: 'var(--nous-fg-muted)',
  cursor: 'pointer',
  userSelect: 'none',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
}

const paletteItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--nous-space-sm)' as unknown as string,
  padding: 'var(--nous-space-xs) var(--nous-space-md)' as unknown as string,
  fontSize: 'var(--nous-font-size-xs)' as unknown as string,
  color: 'var(--nous-fg)',
  cursor: 'grab',
  borderRadius: 'var(--nous-radius-xs)' as unknown as string,
}

const categoryBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-2xs)' as unknown as string,
  color: 'var(--nous-fg-subtle)',
  marginLeft: 'auto',
  textTransform: 'capitalize',
}

// ─── Component ────────────────────────────────────────────────────────────────

function NodePaletteInner({ containerRef }: NodePaletteProps) {
  const {
    state,
    panelRef,
    onCollapse,
    onPin,
    onClose,
    onDragStart,
  } = useFloatingPanel({
    initialPosition: 'left',
    containerRef,
  })

  const [search, setSearch] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<NodeCategory>>(new Set())

  // Build palette items from registry
  const allItems = useMemo((): NodePaletteItem[] => {
    const entries = getAllRegistryEntries()
    return entries.map(([nousType, entry]) => ({
      nousType,
      label: entry.defaultLabel,
      category: entry.category,
      colorVar: entry.colorVar,
      icon: entry.icon,
    }))
  }, [])

  // Group items by category
  const groupedItems = useMemo(() => {
    const searchLower = search.toLowerCase()
    const groups = new Map<NodeCategory, NodePaletteItem[]>()

    for (const category of CATEGORY_ORDER) {
      groups.set(category, [])
    }

    for (const item of allItems) {
      if (search && !item.label.toLowerCase().includes(searchLower) && !item.nousType.toLowerCase().includes(searchLower)) {
        continue
      }
      const group = groups.get(item.category)
      if (group) group.push(item)
    }

    return groups
  }, [allItems, search])

  const toggleCategory = useCallback((category: NodeCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  const handleItemDragStart = useCallback((e: React.DragEvent, nousType: string) => {
    e.dataTransfer.setData('application/nous-node-type', nousType)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
  }, [])

  return (
    <FloatingPanel
      title="Node Palette"
      state={state}
      panelRef={panelRef}
      onCollapse={onCollapse}
      onPin={onPin}
      onClose={onClose}
      onDragStart={onDragStart}
    >
      {/* Search */}
      <div style={searchContainerStyle}>
        <i className="codicon codicon-search" style={{ color: 'var(--nous-fg-subtle)', fontSize: 12 }} />
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search nodes..."
          style={searchInputStyle}
          aria-label="Search nodes"
          data-testid="node-palette-search"
        />
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map((category) => {
        const items = groupedItems.get(category)
        if (!items || items.length === 0) return null

        const meta = CATEGORY_META[category]
        const isCollapsed = collapsedCategories.has(category)

        return (
          <div key={category} data-testid={`palette-category-${category}`}>
            {/* Category header */}
            <button
              type="button"
              style={categoryHeaderStyle}
              onClick={() => toggleCategory(category)}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${meta.label} category`}
              data-testid={`palette-category-header-${category}`}
            >
              <i
                className={`codicon ${isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`}
                style={{ fontSize: 10 }}
              />
              <i className={`codicon ${meta.icon}`} style={{ fontSize: 12 }} />
              <span>{meta.label}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{items.length}</span>
            </button>

            {/* Items */}
            {!isCollapsed && items.map((item) => (
              <div
                key={item.nousType}
                draggable
                onDragStart={(e) => handleItemDragStart(e, item.nousType)}
                style={paletteItemStyle}
                data-testid={`palette-item-${item.nousType}`}
              >
                <i
                  className={`codicon ${item.icon}`}
                  style={{ color: item.colorVar, fontSize: 12, flexShrink: 0 }}
                />
                <span>{item.label}</span>
                <span style={categoryBadgeStyle}>{item.category}</span>
              </div>
            ))}
          </div>
        )
      })}
    </FloatingPanel>
  )
}

export const NodePalette = React.memo(NodePaletteInner)
