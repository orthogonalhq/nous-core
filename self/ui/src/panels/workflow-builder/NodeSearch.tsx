'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { XYPosition } from '@xyflow/react'
import { getAllRegistryEntries } from './nodes/node-registry'
import type { WorkflowBuilderNode, NodeCategory, NodeSearchResult } from '../../types/workflow-builder'

// ─── Props ──────────────────────────────────────────────────────────────────

export interface NodeSearchProps {
  /** Whether the search overlay is open. */
  isOpen: boolean
  /** Close the search overlay. */
  onClose: () => void
  /** Current graph nodes for "existing nodes" search. */
  nodes: WorkflowBuilderNode[]
  /** Add a node of the given nousType at the given position. */
  onAddNode: (nousType: string, position: XYPosition) => void
  /** Navigate to an existing node on the canvas. */
  onFocusNode: (nodeId: string) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_ORDER: NodeCategory[] = [
  'trigger', 'agent', 'condition', 'app', 'tool', 'memory', 'governance',
]

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 50,
  display: 'flex',
  justifyContent: 'center',
  paddingTop: 80,
}

const panelStyle: React.CSSProperties = {
  background: 'var(--nous-bg-elevated)',
  border: '1px solid var(--nous-border)',
  borderRadius: 'var(--nous-radius-md)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  width: 400,
  maxHeight: 480,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--nous-border)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
}

const resultsContainerStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: '8px 16px 4px',
  fontSize: 'var(--nous-font-size-2xs)',
  fontWeight: 600,
  color: 'var(--nous-fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const resultItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 16px',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-xs)',
  width: '100%',
  textAlign: 'left',
}

const categoryBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-2xs)',
  color: 'var(--nous-fg-subtle)',
  marginLeft: 'auto',
  textTransform: 'capitalize',
}

const emptyStyle: React.CSSProperties = {
  padding: '16px',
  textAlign: 'center',
  color: 'var(--nous-fg-muted)',
  fontSize: 'var(--nous-font-size-xs)',
}

/** Visually hidden but accessible to screen readers */
const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

// ─── Component ──────────────────────────────────────────────────────────────

function NodeSearchInner({ isOpen, onClose, nodes, onAddNode, onFocusNode }: NodeSearchProps) {
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)
  const resultsListId = useId()

  // Save focus and auto-focus input when opened; restore focus on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement
      setQuery('')
      setHighlightedIndex(-1)
      // Auto-focus after a tick to ensure the element is mounted
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    } else {
      // Restore focus on close
      const prev = previousFocusRef.current as HTMLElement | null
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus()
      }
      previousFocusRef.current = null
    }
  }, [isOpen])

  // Click outside dismissal
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Build results
  const results = useMemo((): NodeSearchResult[] => {
    const searchLower = query.trim().toLowerCase()
    const items: NodeSearchResult[] = []

    // Existing nodes
    for (const node of nodes) {
      const label = node.data.label || ''
      const nousType = node.data.nousType || ''
      if (
        !searchLower ||
        label.toLowerCase().includes(searchLower) ||
        nousType.toLowerCase().includes(searchLower)
      ) {
        items.push({
          id: `existing-${node.id}`,
          label,
          icon: 'codicon-symbol-method',
          category: node.data.category,
          type: 'existing-node',
          value: node.id,
        })
      }
    }

    // Available node types from registry
    const registryEntries = getAllRegistryEntries()

    // Group by category order
    for (const category of CATEGORY_ORDER) {
      const categoryEntries = registryEntries.filter(([, entry]) => entry.category === category)
      for (const [nousType, entry] of categoryEntries) {
        if (
          !searchLower ||
          entry.defaultLabel.toLowerCase().includes(searchLower) ||
          nousType.toLowerCase().includes(searchLower)
        ) {
          items.push({
            id: `add-${nousType}`,
            label: entry.defaultLabel,
            icon: entry.icon,
            category: entry.category,
            type: 'add-node',
            value: nousType,
          })
        }
      }
    }

    return items
  }, [query, nodes])

  const existingNodeResults = results.filter((r) => r.type === 'existing-node')
  const addNodeResults = results.filter((r) => r.type === 'add-node')

  const handleSelectExisting = useCallback(
    (nodeId: string) => {
      onFocusNode(nodeId)
      onClose()
    },
    [onFocusNode, onClose],
  )

  const handleSelectAddNode = useCallback(
    (nousType: string) => {
      // Add node at canvas center (0, 0 in flow coordinates as a reasonable default)
      onAddNode(nousType, { x: 0, y: 0 })
      onClose()
    },
    [onAddNode, onClose],
  )

  if (!isOpen) return null

  const hasResults = existingNodeResults.length > 0 || addNodeResults.length > 0
  const totalResults = existingNodeResults.length + addNodeResults.length
  const allResults = [...existingNodeResults, ...addNodeResults]
  const highlightedResult = highlightedIndex >= 0 && highlightedIndex < allResults.length ? allResults[highlightedIndex] : null

  return (
    <div style={overlayStyle} data-testid="node-search-overlay">
      <div ref={panelRef} style={panelStyle} data-testid="node-search-panel" role="search" aria-label="Node search">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlightedIndex(-1) }}
          placeholder="Search nodes... (Ctrl+K)"
          style={searchInputStyle}
          aria-label="Search nodes"
          aria-expanded={hasResults}
          aria-controls={resultsListId}
          aria-activedescendant={highlightedResult ? `node-search-item-${highlightedResult.id}` : undefined}
          data-testid="node-search-input"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightedIndex((prev) => (prev + 1) % totalResults)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightedIndex((prev) => (prev <= 0 ? totalResults - 1 : prev - 1))
            } else if (e.key === 'Enter' && highlightedResult) {
              e.preventDefault()
              if (highlightedResult.type === 'existing-node') {
                handleSelectExisting(highlightedResult.value)
              } else {
                handleSelectAddNode(highlightedResult.value)
              }
            }
          }}
        />

        {/* Screen-reader result count announcement */}
        <div role="status" aria-live="polite" style={srOnlyStyle} data-testid="node-search-sr-count">
          {totalResults > 0 ? `${totalResults} results available` : 'No results found'}
        </div>

        <div id={resultsListId} style={resultsContainerStyle}>
          {!hasResults && (
            <div style={emptyStyle} data-testid="node-search-empty">
              No results found
            </div>
          )}

          {existingNodeResults.length > 0 && (
            <div data-testid="node-search-existing-section" role="listbox" aria-label="Existing nodes">
              <div style={sectionHeaderStyle}>Existing Nodes</div>
              {existingNodeResults.map((result) => (
                <button
                  key={result.id}
                  id={`node-search-item-${result.id}`}
                  type="button"
                  style={resultItemStyle}
                  onClick={() => handleSelectExisting(result.value)}
                  aria-label={`Go to ${result.label}`}
                  role="option"
                  aria-selected={highlightedResult?.id === result.id}
                  data-testid={`node-search-result-${result.id}`}
                >
                  <i className={`codicon ${result.icon}`} style={{ fontSize: 12 }} />
                  <span>{result.label}</span>
                  <span style={categoryBadgeStyle}>{result.category}</span>
                </button>
              ))}
            </div>
          )}

          {addNodeResults.length > 0 && (
            <div data-testid="node-search-add-section" role="listbox" aria-label="Add node types">
              <div style={sectionHeaderStyle}>Add Node</div>
              {addNodeResults.map((result) => (
                <button
                  key={result.id}
                  id={`node-search-item-${result.id}`}
                  type="button"
                  style={resultItemStyle}
                  onClick={() => handleSelectAddNode(result.value)}
                  aria-label={`Add ${result.label}`}
                  role="option"
                  aria-selected={highlightedResult?.id === result.id}
                  data-testid={`node-search-result-${result.id}`}
                >
                  <i className={`codicon ${result.icon}`} style={{ fontSize: 12 }} />
                  <span>{result.label}</span>
                  <span style={categoryBadgeStyle}>{result.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const NodeSearch = React.memo(NodeSearchInner)
