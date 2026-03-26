'use client'

import { useState, useCallback } from 'react'
import type { XYPosition } from '@xyflow/react'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'

// ─── Options and return type ──────────────────────────────────────────────────

export interface UseKeyboardNavOptions {
  /** Current nodes array from useBuilderState. */
  nodes: WorkflowBuilderNode[]
  /** Current edges array from useBuilderState. */
  edges: WorkflowBuilderEdge[]
  /** Selected node ID from useBuilderState. */
  selectedNodeId: string | null
  /** Selected edge ID from useBuilderState. */
  selectedEdgeId: string | null
  /** Callbacks into useBuilderState mutations. */
  onSelectNode: (nodeId: string) => void
  onDeselectAll: () => void
  removeNode: (nodeId: string) => void
  removeEdge: (edgeId: string) => void
  moveNode: (nodeId: string, position: XYPosition) => void
  /** Callback to close open floating panels/context menus. */
  onEscape: () => void
  /** Whether the canvas wrapper element has focus. */
  canvasHasFocus: boolean
}

export interface UseKeyboardNavReturn {
  /** Index of the currently focused node in the sorted node list (-1 = none). */
  focusedNodeIndex: number
  /** ID of the currently focused node (null = none). */
  focusedNodeId: string | null
  /** Attach to the canvas wrapper element's onKeyDown. */
  handleKeyDown: (e: React.KeyboardEvent) => void
}

// ─── Grid increment for arrow key nudge ─────────────────────────────────────

const GRID_SIZE = 20

// ─── Sort nodes by spatial position (top-to-bottom, left-to-right) ──────────

function sortNodesByPosition(nodes: WorkflowBuilderNode[]): WorkflowBuilderNode[] {
  return [...nodes].sort((a, b) => {
    const dy = a.position.y - b.position.y
    if (dy !== 0) return dy
    return a.position.x - b.position.x
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKeyboardNav(options: UseKeyboardNavOptions): UseKeyboardNavReturn {
  const {
    nodes,
    edges: _edges,
    selectedNodeId,
    selectedEdgeId,
    onSelectNode,
    onDeselectAll,
    removeNode,
    removeEdge,
    moveNode,
    onEscape,
    canvasHasFocus,
  } = options

  const [focusedNodeIndex, setFocusedNodeIndex] = useState(-1)

  // Derive focusedNodeId from current index and sorted nodes
  const sortedNodes = sortNodesByPosition(nodes)
  const focusedNodeId =
    focusedNodeIndex >= 0 && focusedNodeIndex < sortedNodes.length
      ? sortedNodes[focusedNodeIndex].id
      : null

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Guard: inactive when canvas does not have focus
      if (!canvasHasFocus) return

      // Guard: do not intercept modifier key combos (Ctrl+Z, Ctrl+K, etc.)
      if (e.ctrlKey || e.metaKey) return

      const key = e.key

      switch (key) {
        case 'Tab': {
          e.preventDefault()
          if (nodes.length === 0) return
          const sorted = sortNodesByPosition(nodes)
          setFocusedNodeIndex((prev) => {
            let next: number
            if (e.shiftKey) {
              // Shift+Tab: reverse cycle
              next = prev <= 0 ? sorted.length - 1 : prev - 1
            } else {
              // Tab: forward cycle
              next = prev >= sorted.length - 1 ? 0 : prev + 1
            }
            const nodeId = sorted[next].id
            onSelectNode(nodeId)
            return next
          })
          break
        }

        case 'Enter': {
          e.preventDefault()
          if (focusedNodeId) {
            onSelectNode(focusedNodeId)
          }
          break
        }

        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          if (selectedNodeId) {
            removeNode(selectedNodeId)
            setFocusedNodeIndex(-1)
          } else if (selectedEdgeId) {
            removeEdge(selectedEdgeId)
            setFocusedNodeIndex(-1)
          }
          break
        }

        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!selectedNodeId) return
          e.preventDefault()
          const node = nodes.find((n) => n.id === selectedNodeId)
          if (!node) return
          let newX = node.position.x
          let newY = node.position.y
          if (key === 'ArrowUp') newY -= GRID_SIZE
          if (key === 'ArrowDown') newY += GRID_SIZE
          if (key === 'ArrowLeft') newX -= GRID_SIZE
          if (key === 'ArrowRight') newX += GRID_SIZE
          // Clamp to non-negative
          newX = Math.max(0, newX)
          newY = Math.max(0, newY)
          moveNode(selectedNodeId, { x: newX, y: newY })
          break
        }

        case 'Escape': {
          e.preventDefault()
          onDeselectAll()
          onEscape()
          setFocusedNodeIndex(-1)
          break
        }

        default:
          break
      }
    },
    [
      canvasHasFocus,
      nodes,
      focusedNodeId,
      selectedNodeId,
      selectedEdgeId,
      onSelectNode,
      onDeselectAll,
      removeNode,
      removeEdge,
      moveNode,
      onEscape,
    ],
  )

  return {
    focusedNodeIndex,
    focusedNodeId,
    handleKeyDown,
  }
}
