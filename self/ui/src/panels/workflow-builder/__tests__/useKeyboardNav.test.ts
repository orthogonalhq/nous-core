// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardNav } from '../hooks/useKeyboardNav'
import type { UseKeyboardNavOptions } from '../hooks/useKeyboardNav'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string, x: number, y: number): WorkflowBuilderNode {
  return {
    id,
    type: 'builderNode',
    position: { x, y },
    data: {
      label: `Node ${id}`,
      category: 'agent',
      nousType: `nous.agent.${id}`,
    },
  }
}

function createEdge(id: string, source: string, target: string): WorkflowBuilderEdge {
  return {
    id,
    source,
    target,
    data: { edgeType: 'execution' },
  }
}

function makeKeyEvent(key: string, overrides: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as React.KeyboardEvent
}

function createOptions(overrides: Partial<UseKeyboardNavOptions> = {}): UseKeyboardNavOptions {
  return {
    nodes: [
      createNode('a', 0, 0),
      createNode('b', 100, 0),
      createNode('c', 0, 100),
    ],
    edges: [createEdge('e1', 'a', 'b')],
    selectedNodeId: null,
    selectedEdgeId: null,
    onSelectNode: vi.fn(),
    onDeselectAll: vi.fn(),
    removeNode: vi.fn(),
    removeEdge: vi.fn(),
    moveNode: vi.fn(),
    onEscape: vi.fn(),
    canvasHasFocus: true,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useKeyboardNav', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('returns focusedNodeIndex, focusedNodeId, and handleKeyDown', () => {
      const { result } = renderHook(() => useKeyboardNav(createOptions()))
      expect(result.current).toHaveProperty('focusedNodeIndex')
      expect(result.current).toHaveProperty('focusedNodeId')
      expect(result.current).toHaveProperty('handleKeyDown')
    })

    it('focusedNodeIndex is -1 initially', () => {
      const { result } = renderHook(() => useKeyboardNav(createOptions()))
      expect(result.current.focusedNodeIndex).toBe(-1)
    })

    it('focusedNodeId is null initially', () => {
      const { result } = renderHook(() => useKeyboardNav(createOptions()))
      expect(result.current.focusedNodeId).toBeNull()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('Tab cycles through nodes in position-sorted order (top-to-bottom, left-to-right)', () => {
      // Nodes: a(0,0), b(100,0), c(0,100)
      // Sorted: a(0,0), b(100,0), c(0,100) — y primary, x secondary
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => {
        result.current.handleKeyDown(makeKeyEvent('Tab'))
      })
      expect(result.current.focusedNodeIndex).toBe(0)
      expect(opts.onSelectNode).toHaveBeenCalledWith('a')
    })

    it('Shift+Tab cycles in reverse order', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      // First Tab to get to index 0
      act(() => {
        result.current.handleKeyDown(makeKeyEvent('Tab'))
      })
      // Shift+Tab should wrap to last
      act(() => {
        result.current.handleKeyDown(makeKeyEvent('Tab', { shiftKey: true }))
      })
      // Should wrap to index 2 (last node: c)
      expect(result.current.focusedNodeIndex).toBe(2)
    })

    it('Tab wraps from last node to first', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      // Tab 3 times to reach last, then one more to wrap
      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      // Now at index 2 (last)
      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      // Should wrap to 0
      expect(result.current.focusedNodeIndex).toBe(0)
    })

    it('Shift+Tab wraps from first node to last', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      // Shift+Tab from initial (-1) should go to last
      act(() => {
        result.current.handleKeyDown(makeKeyEvent('Tab', { shiftKey: true }))
      })
      expect(result.current.focusedNodeIndex).toBe(2)
    })

    it('Enter on focused node calls onSelectNode with the focused node ID', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      // First Tab to focus a node
      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      ;(opts.onSelectNode as ReturnType<typeof vi.fn>).mockClear()

      act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')) })
      expect(opts.onSelectNode).toHaveBeenCalledWith('a')
    })

    it('Delete removes the currently selected node via removeNode', () => {
      const opts = createOptions({ selectedNodeId: 'b' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Delete')) })
      expect(opts.removeNode).toHaveBeenCalledWith('b')
    })

    it('Backspace removes the currently selected node via removeNode', () => {
      const opts = createOptions({ selectedNodeId: 'a' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Backspace')) })
      expect(opts.removeNode).toHaveBeenCalledWith('a')
    })

    it('Delete removes the currently selected edge via removeEdge when no node is selected', () => {
      const opts = createOptions({ selectedEdgeId: 'e1' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Delete')) })
      expect(opts.removeEdge).toHaveBeenCalledWith('e1')
      expect(opts.removeNode).not.toHaveBeenCalled()
    })

    it('Arrow Up nudges selected node position by -20px on y axis', () => {
      const nodes = [createNode('a', 100, 100)]
      const opts = createOptions({ nodes, selectedNodeId: 'a' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')) })
      expect(opts.moveNode).toHaveBeenCalledWith('a', { x: 100, y: 80 })
    })

    it('Arrow Down nudges selected node position by +20px on y axis', () => {
      const nodes = [createNode('a', 100, 100)]
      const opts = createOptions({ nodes, selectedNodeId: 'a' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')) })
      expect(opts.moveNode).toHaveBeenCalledWith('a', { x: 100, y: 120 })
    })

    it('Arrow Left nudges selected node position by -20px on x axis', () => {
      const nodes = [createNode('a', 100, 100)]
      const opts = createOptions({ nodes, selectedNodeId: 'a' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowLeft')) })
      expect(opts.moveNode).toHaveBeenCalledWith('a', { x: 80, y: 100 })
    })

    it('Arrow Right nudges selected node position by +20px on x axis', () => {
      const nodes = [createNode('a', 100, 100)]
      const opts = createOptions({ nodes, selectedNodeId: 'a' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowRight')) })
      expect(opts.moveNode).toHaveBeenCalledWith('a', { x: 120, y: 100 })
    })

    it('Arrow key nudge clamps position to Math.max(0, value) (no negative coordinates)', () => {
      const nodes = [createNode('a', 10, 10)]
      const opts = createOptions({ nodes, selectedNodeId: 'a' })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')) })
      expect(opts.moveNode).toHaveBeenCalledWith('a', { x: 10, y: 0 })

      ;(opts.moveNode as ReturnType<typeof vi.fn>).mockClear()

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowLeft')) })
      expect(opts.moveNode).toHaveBeenCalledWith('a', { x: 0, y: 10 })
    })

    it('Escape calls onDeselectAll and onEscape, resets focused index', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      // First Tab to set a focused index
      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      expect(result.current.focusedNodeIndex).toBe(0)

      act(() => { result.current.handleKeyDown(makeKeyEvent('Escape')) })
      expect(opts.onDeselectAll).toHaveBeenCalled()
      expect(opts.onEscape).toHaveBeenCalled()
      expect(result.current.focusedNodeIndex).toBe(-1)
    })
  })

  // ─── Tier 3 — Edge Cases ───────────────────────────────────────────────

  describe('Tier 3 — Edge Cases', () => {
    it('canvasHasFocus=false suppresses all key bindings (no callbacks called)', () => {
      const opts = createOptions({ canvasHasFocus: false })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')) })
      act(() => { result.current.handleKeyDown(makeKeyEvent('Delete')) })
      act(() => { result.current.handleKeyDown(makeKeyEvent('Escape')) })

      expect(opts.onSelectNode).not.toHaveBeenCalled()
      expect(opts.onDeselectAll).not.toHaveBeenCalled()
      expect(opts.removeNode).not.toHaveBeenCalled()
      expect(opts.onEscape).not.toHaveBeenCalled()
    })

    it('Modifier keys (Ctrl+key) are not intercepted', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab', { ctrlKey: true })) })
      expect(opts.onSelectNode).not.toHaveBeenCalled()
    })

    it('Modifier keys (Meta+key) are not intercepted', () => {
      const opts = createOptions()
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab', { metaKey: true })) })
      expect(opts.onSelectNode).not.toHaveBeenCalled()
    })

    it('Tab on empty nodes array is a no-op', () => {
      const opts = createOptions({ nodes: [] })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Tab')) })
      expect(opts.onSelectNode).not.toHaveBeenCalled()
      expect(result.current.focusedNodeIndex).toBe(-1)
    })

    it('Delete with no selection (neither node nor edge selected) is a no-op', () => {
      const opts = createOptions({ selectedNodeId: null, selectedEdgeId: null })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('Delete')) })
      expect(opts.removeNode).not.toHaveBeenCalled()
      expect(opts.removeEdge).not.toHaveBeenCalled()
    })

    it('Arrow nudge with no selected node is a no-op', () => {
      const opts = createOptions({ selectedNodeId: null })
      const { result } = renderHook(() => useKeyboardNav(opts))

      act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')) })
      expect(opts.moveNode).not.toHaveBeenCalled()
    })
  })
})
