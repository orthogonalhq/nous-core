// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EdgeInspector } from '../inspectors/EdgeInspector'
import type { WorkflowBuilderNode, WorkflowBuilderEdge } from '../../../types/workflow-builder'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../floating-panel/useFloatingPanel', () => ({
  useFloatingPanel: () => ({
    state: { x: 0, y: 0, collapsed: false, pinned: false, visible: true },
    panelRef: { current: null },
    onCollapse: vi.fn(),
    onPin: vi.fn(),
    onClose: vi.fn(),
    onShow: vi.fn(),
    onDragStart: vi.fn(),
    onDrag: vi.fn(),
    onDragEnd: vi.fn(),
  }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>

const testNodes: WorkflowBuilderNode[] = [
  {
    id: 'n1',
    type: 'builderNode',
    position: { x: 0, y: 0 },
    data: { label: 'Source Node', category: 'trigger', nousType: 'nous.trigger.webhook' },
  },
  {
    id: 'n2',
    type: 'builderNode',
    position: { x: 200, y: 0 },
    data: { label: 'Target Node', category: 'agent', nousType: 'nous.agent.classify' },
  },
]

const testEdge: WorkflowBuilderEdge = {
  id: 'e-n1-n2',
  source: 'n1',
  target: 'n2',
  sourceHandle: 'source',
  targetHandle: 'target',
  type: 'builderEdge',
  data: { edgeType: 'execution' },
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EdgeInspector', () => {
  const removeEdge = vi.fn()
  const addEdge = vi.fn()

  beforeEach(() => {
    removeEdge.mockClear()
    addEdge.mockClear()
  })

  // ─── Tier 2 — Behavior ───────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('renders null when selectedEdgeId is null', () => {
      const { container } = render(
        <EdgeInspector
          selectedEdgeId={null}
          edges={[testEdge]}
          nodes={testNodes}
          removeEdge={removeEdge}
          addEdge={addEdge}
          containerRef={containerRef}
        />,
      )
      expect(container.innerHTML).toBe('')
    })

    it('renders null when selectedEdgeId does not match any edge', () => {
      const { container } = render(
        <EdgeInspector
          selectedEdgeId="nonexistent"
          edges={[testEdge]}
          nodes={testNodes}
          removeEdge={removeEdge}
          addEdge={addEdge}
          containerRef={containerRef}
        />,
      )
      expect(container.innerHTML).toBe('')
    })

    it('renders FloatingPanel with edge type and connection info when edge is selected', () => {
      render(
        <EdgeInspector
          selectedEdgeId="e-n1-n2"
          edges={[testEdge]}
          nodes={testNodes}
          removeEdge={removeEdge}
          addEdge={addEdge}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('floating-panel')).toBeTruthy()
      expect(screen.getByTestId('edge-type-badge')).toBeTruthy()
      expect(screen.getByText('execution')).toBeTruthy()
    })

    it('renders correct source and target node labels', () => {
      render(
        <EdgeInspector
          selectedEdgeId="e-n1-n2"
          edges={[testEdge]}
          nodes={testNodes}
          removeEdge={removeEdge}
          addEdge={addEdge}
          containerRef={containerRef}
        />,
      )
      expect(screen.getByTestId('edge-source-label').textContent).toBe('Source Node')
      expect(screen.getByTestId('edge-target-label').textContent).toBe('Target Node')
    })

    it('calls removeEdge and then addEdge when edge type toggle is activated', () => {
      render(
        <EdgeInspector
          selectedEdgeId="e-n1-n2"
          edges={[testEdge]}
          nodes={testNodes}
          removeEdge={removeEdge}
          addEdge={addEdge}
          containerRef={containerRef}
        />,
      )
      fireEvent.click(screen.getByTestId('edge-type-toggle'))
      expect(removeEdge).toHaveBeenCalledWith('e-n1-n2')
      expect(addEdge).toHaveBeenCalledTimes(1)
    })

    it('edge type toggle renders "execution" to "config" direction correctly', () => {
      render(
        <EdgeInspector
          selectedEdgeId="e-n1-n2"
          edges={[testEdge]}
          nodes={testNodes}
          removeEdge={removeEdge}
          addEdge={addEdge}
          containerRef={containerRef}
        />,
      )
      const toggle = screen.getByTestId('edge-type-toggle')
      expect(toggle.textContent).toContain('config')
    })
  })
})
